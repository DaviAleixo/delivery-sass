import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Users,
  HeartPulse,
  DollarSign,
  Search,
  MessageSquare,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  StickyNote,
  ChevronRight,
  Coins,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  buildWhatsAppTemplates,
  buildWhatsAppUrl,
  classifyClientSegment,
  cleanPhoneDigits,
  computeVipSpentThreshold,
  fetchClientsSummary,
  formatMoneyBRL,
  formatPhoneBR,
} from "@/services/clientsService";
import ClientDetailDrawer from "@/components/admin/ClientDetailDrawer";

const RESERVED_SLUGS = new Set([
  "clients",
  "dashboard",
  "orders",
  "pdv",
  "menu",
  "adminlogin",
  "login",
  "superadmin",
  "financial",
  "cash",
  "tables",
  "kds",
]);

async function resolveActiveTenantId() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const routeSlug =
    segments.length > 0 && !RESERVED_SLUGS.has(segments[0].toLowerCase())
      ? segments[0].toLowerCase()
      : null;

  let activeTenantId = localStorage.getItem("current_tenant_id");
  const activeSlug = routeSlug || localStorage.getItem("current_tenant_slug");

  if (isSupabaseConfigured() && supabase) {
    if (activeSlug === "vrumm" || activeSlug === "vruum-burguer") {
      return "a0000000-0000-0000-0000-000000000001";
    }
    if (activeSlug) {
      const { data } = await supabase
        .from("tenants_public")
        .select("id")
        .eq("slug", activeSlug)
        .maybeSingle();
      if (data?.id) return data.id;
    }
  }

  return activeTenantId || null;
}

export default function ClientsPage() {
  const [tenantId, setTenantId] = useState(null);
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("lastOrderDate");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedClient, setSelectedClient] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const effectiveId = await resolveActiveTenantId();
      setTenantId(effectiveId);

      if (effectiveId && isSupabaseConfigured() && supabase) {
        const list = await fetchClientsSummary(effectiveId);
        setClients(list);
      } else {
        setClients([]);
      }
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
      toast.error(err?.message || "Erro ao carregar base de clientes.");
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const vipSpentThreshold = useMemo(
    () => computeVipSpentThreshold(clients),
    [clients]
  );

  const enrichedClients = useMemo(
    () =>
      clients.map((client) => ({
        ...client,
        segment: classifyClientSegment(client, vipSpentThreshold),
      })),
    [clients, vipSpentThreshold]
  );

  const metrics = useMemo(() => {
    const totalClients = enrichedClients.length;
    const totalOrders = enrichedClients.reduce(
      (sum, c) => sum + c.totalOrders,
      0
    );
    const totalRevenue = enrichedClients.reduce(
      (sum, c) => sum + c.totalSpent,
      0
    );
    const avgLtv = totalClients > 0 ? totalRevenue / totalClients : 0;
    const avgOrderTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const recurringCount = enrichedClients.filter(
      (c) => c.segment.isRecurring
    ).length;
    const recurringPct =
      totalClients > 0 ? Math.round((recurringCount / totalClients) * 100) : 0;

    const vipCount = enrichedClients.filter((c) => c.segment.isVip).length;
    const atRiskCount = enrichedClients.filter(
      (c) => c.segment.isAtRisk
    ).length;
    const active30dCount = enrichedClients.filter(
      (c) => c.totalOrders > 0 && !c.segment.isAtRisk
    ).length;
    const newCount = enrichedClients.filter((c) => c.segment.isNew).length;

    return {
      totalClients,
      avgLtv,
      avgOrderTicket,
      recurringCount,
      recurringPct,
      vipCount,
      atRiskCount,
      active30dCount,
      newCount,
    };
  }, [enrichedClients]);

  const filteredAndSortedClients = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const qDigits = cleanPhoneDigits(q);

    const filtered = enrichedClients.filter((client) => {
      if (segmentFilter === "vip" && !client.segment.isVip) return false;
      if (segmentFilter === "recurring" && !client.segment.isRecurring)
        return false;
      if (segmentFilter === "at_risk" && !client.segment.isAtRisk) return false;
      if (segmentFilter === "new" && !client.segment.isNew) return false;

      if (!q) return true;
      const nameMatch = (client.full_name || "").toLowerCase().includes(q);
      const phoneDigits = cleanPhoneDigits(client.phone);
      const phoneMatch =
        (client.phone || "").includes(q) ||
        (qDigits.length > 0 && phoneDigits.includes(qDigits));
      return nameMatch || phoneMatch;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortBy === "totalOrders") {
        return (a.totalOrders - b.totalOrders) * dir;
      }
      if (sortBy === "totalSpent") {
        return (a.totalSpent - b.totalSpent) * dir;
      }
      const timeA = a.lastOrderDate ? a.lastOrderDate.getTime() : 0;
      const timeB = b.lastOrderDate ? b.lastOrderDate.getTime() : 0;
      return (timeA - timeB) * dir;
    });
  }, [enrichedClients, searchTerm, segmentFilter, sortBy, sortDir]);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  };

  const renderSortIcon = (field) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="w-3 h-3 text-stone-400 inline ml-1" />;
    }
    return sortDir === "desc" ? (
      <ArrowDown className="w-3 h-3 text-emerald-700 inline ml-1" />
    ) : (
      <ArrowUp className="w-3 h-3 text-emerald-700 inline ml-1" />
    );
  };

  const handleOpenClient = (client) => {
    setSelectedClient(client);
    setDrawerOpen(true);
  };

  const handleNoteUpdated = (clientId, savedNotes) => {
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, crmNotes: savedNotes } : c))
    );
    setSelectedClient((prev) =>
      prev && prev.id === clientId ? { ...prev, crmNotes: savedNotes } : prev
    );
  };

  const filterChips = [
    { key: "all", label: "Todos", count: metrics.totalClients },
    { key: "vip", label: "VIPs", count: metrics.vipCount },
    { key: "recurring", label: "Recorrentes (3+)", count: metrics.recurringCount },
    { key: "at_risk", label: "Sumidos (+30d)", count: metrics.atRiskCount },
    { key: "new", label: "Novos (7d)", count: metrics.newCount },
  ];

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F7F9F8]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#047857] mx-auto" />
          <p className="text-stone-600 font-semibold text-sm">
            Carregando base de clientes...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-[#F7F9F8] min-h-screen space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho Executivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              Clientes & Relacionamento
            </h1>
            <Badge
              variant="outline"
              className="text-xs font-semibold bg-white text-stone-600 border-stone-300"
            >
              {metrics.totalClients} cadastrados
            </Badge>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            Histórico de compras, recorrência, cashback e reativação pelo WhatsApp
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={loadData}
          className="h-8 text-xs bg-white border-stone-300 text-stone-700 hover:bg-stone-50 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Atualizar
        </Button>
      </div>

      {/* Grid Superior: 3 Cards Estratégicos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
              Total de Clientes
            </span>
            <Users className="w-4 h-4 text-stone-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
            {metrics.totalClients}
          </p>
          <span className="text-[11px] text-stone-500 mt-0.5 block">
            <strong className="text-emerald-700">{metrics.recurringCount}</strong>{" "}
            recorrentes ({metrics.recurringPct}% da base)
          </span>
        </Card>

        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
              Clientes Ativos (30 dias)
            </span>
            <HeartPulse className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="flex items-baseline gap-2.5 mt-1">
            <p className="text-2xl font-bold font-mono text-emerald-700">
              {metrics.active30dCount}
            </p>
            <span className="text-xs font-medium text-stone-500">compraram</span>
            {metrics.atRiskCount > 0 && (
              <button
                type="button"
                onClick={() => setSegmentFilter("at_risk")}
                className="ml-auto text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full hover:bg-rose-100 transition-colors cursor-pointer"
              >
                {metrics.atRiskCount} sumidos
              </button>
            )}
          </div>
          <span className="text-[11px] text-stone-500 mt-0.5 block">
            {metrics.atRiskCount > 0
              ? "Fizeram pedido no mês · clique para ver sumidos"
              : "Fizeram pedido nos últimos 30 dias"}
          </span>
        </Card>

        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
              Gasto Médio por Cliente
            </span>
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
            {formatMoneyBRL(metrics.avgLtv)}
          </p>
          <span className="text-[11px] text-stone-500 mt-0.5 block">
            Ticket médio por pedido:{" "}
            <strong className="font-mono text-stone-700">
              {formatMoneyBRL(metrics.avgOrderTicket)}
            </strong>
          </span>
        </Card>
      </div>

      {/* Card da Tabela de Clientes */}
      <Card className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
        <CardHeader className="bg-stone-50/60 border-b border-stone-200/80 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-bold text-stone-900">
                Base de Clientes
              </CardTitle>
              <p className="text-xs text-stone-500 mt-0.5">
                Clique em um cliente para ver endereço, pedidos favoritos e anotações
              </p>
            </div>

            <div className="w-full sm:w-72 relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 rounded-lg border-stone-300 text-xs bg-white focus-visible:ring-stone-900"
              />
            </div>
          </div>

          {/* Filtros de Segmentação */}
          <div className="flex flex-wrap items-center gap-1.5">
            {filterChips.map((chip) => {
              const active = segmentFilter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setSegmentFilter(chip.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                  }`}
                >
                  <span>{chip.label}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200/80 bg-stone-50/70 text-stone-500 font-semibold uppercase text-[10px]">
                  <th className="py-2.5 px-4">Cliente</th>
                  <th className="py-2.5 px-4">WhatsApp</th>
                  <th
                    className="py-2.5 px-4 text-center cursor-pointer select-none hover:text-stone-900"
                    onClick={() => toggleSort("totalOrders")}
                  >
                    Pedidos {renderSortIcon("totalOrders")}
                  </th>
                  <th
                    className="py-2.5 px-4 text-right cursor-pointer select-none hover:text-stone-900"
                    onClick={() => toggleSort("totalSpent")}
                  >
                    Total Gasto {renderSortIcon("totalSpent")}
                  </th>
                  <th
                    className="py-2.5 px-4 text-right cursor-pointer select-none hover:text-stone-900"
                    onClick={() => toggleSort("lastOrderDate")}
                  >
                    Último Pedido {renderSortIcon("lastOrderDate")}
                  </th>
                  <th className="py-2.5 px-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredAndSortedClients.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center py-12 text-stone-400 text-xs"
                    >
                      Nenhum cliente encontrado com os critérios selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedClients.map((client) => {
                    const { recency, primaryBadge } = client.segment;
                    const templates = buildWhatsAppTemplates(client);

                    return (
                      <tr
                        key={client.id}
                        onClick={() => handleOpenClient(client)}
                        className="hover:bg-stone-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8 rounded-lg border border-stone-200 shrink-0">
                              <AvatarFallback className="bg-stone-100 text-stone-700 font-bold text-xs rounded-lg">
                                {client.full_name?.charAt(0).toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-semibold text-stone-900 text-xs truncate">
                                  {client.full_name}
                                </p>
                                {primaryBadge && (
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 font-semibold ${primaryBadge.className}`}
                                  >
                                    {primaryBadge.label}
                                  </Badge>
                                )}
                                {client.cashbackBalance > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 font-mono font-semibold bg-emerald-50 text-emerald-700 border-emerald-200"
                                    title="Saldo de cashback disponível"
                                  >
                                    <Coins className="w-2.5 h-2.5 mr-1" />
                                    {formatMoneyBRL(client.cashbackBalance)}
                                  </Badge>
                                )}
                                {client.crmNotes && (
                                  <StickyNote
                                    className="w-3 h-3 text-amber-500 shrink-0"
                                    title="Possui anotação interna"
                                  />
                                )}
                              </div>
                              {client.lastAddress && (
                                <p className="text-[10px] text-stone-400 truncate max-w-[260px] mt-0.5">
                                  {client.lastAddress}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td
                          className="py-3 px-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-stone-700 text-xs">
                              {formatPhoneBR(client.phone)}
                            </span>
                            {client.phone && client.phone !== "-" && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-md cursor-pointer"
                                    title="Enviar WhatsApp rápido"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="start"
                                  className="w-64 p-2 space-y-1 bg-white border border-stone-200 shadow-lg rounded-xl"
                                >
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 px-2 py-1">
                                    Mensagem rápida no WhatsApp
                                  </p>
                                  {templates.map((tpl) => {
                                    const url = buildWhatsAppUrl(
                                      client.phone,
                                      tpl.message
                                    );
                                    return (
                                      <button
                                        key={tpl.id}
                                        type="button"
                                        onClick={() => {
                                          if (url) {
                                            window.open(
                                              url,
                                              "_blank",
                                              "noopener,noreferrer"
                                            );
                                          }
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
                                      >
                                        <span className="block text-xs font-semibold text-stone-800">
                                          {tpl.label}
                                        </span>
                                        <span className="block text-[10px] text-stone-400">
                                          {tpl.description}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <Badge
                            variant="outline"
                            className="font-mono text-[11px] font-semibold text-stone-700 bg-stone-50 border-stone-200"
                          >
                            {client.totalOrders}
                          </Badge>
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold text-stone-900">
                          {formatMoneyBRL(client.totalSpent)}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <span
                            className={`block text-[11px] font-semibold ${
                              recency.tone === "amber"
                                ? "text-rose-600"
                                : recency.tone === "emerald"
                                  ? "text-emerald-700"
                                  : "text-stone-600"
                            }`}
                          >
                            {recency.label}
                          </span>
                          <span className="block text-[10px] text-stone-400 font-mono">
                            {client.lastOrderDate
                              ? format(client.lastOrderDate, "dd/MM/yyyy", {
                                  locale: ptBR,
                                })
                              : "-"}
                          </span>
                        </td>

                        <td className="py-3 px-2 text-right">
                          <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-600 transition-colors inline" />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Ficha 360º do Cliente */}
      <ClientDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        client={selectedClient}
        tenantId={tenantId}
        vipSpentThreshold={vipSpentThreshold}
        onNoteUpdated={handleNoteUpdated}
      />
    </div>
  );
}
