import React, { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MapPin,
  MessageSquare,
  ShoppingBag,
  StickyNote,
  Clock,
  CreditCard,
  Loader2,
  Check,
  ChevronDown,
  Crown,
  Phone,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  buildWhatsAppTemplates,
  buildWhatsAppUrl,
  classifyClientSegment,
  fetchClientDetail,
  formatMoneyBRL,
  formatPaymentMethodLabel,
  formatPhoneBR,
  saveClientNote,
} from "@/services/clientsService";

const ORDER_STATUS_LABELS = {
  novo: { label: "Novo", className: "bg-sky-50 text-sky-700 border-sky-200" },
  confirmado: { label: "Confirmado", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  em_preparo: { label: "Em preparo", className: "bg-amber-50 text-amber-700 border-amber-200" },
  pronto: { label: "Pronto", className: "bg-teal-50 text-teal-700 border-teal-200" },
  saiu_para_entrega: { label: "Em rota", className: "bg-purple-50 text-purple-700 border-purple-200" },
  entregue: { label: "Entregue", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelado: { label: "Cancelado", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

const CHANNEL_LABELS = {
  delivery: "Delivery",
  retirada: "Retirada",
  balcao: "Balcão",
  mesa: "Mesa",
};

export default function ClientDetailDrawer({
  open,
  onOpenChange,
  client,
  tenantId,
  vipSpentThreshold,
  onNoteUpdated,
}) {
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    if (!open || !client) return;
    setNoteText(client.crmNotes || "");
    setDetail(null);

    if (!tenantId || !client.phone) return;

    let cancelled = false;
    setIsLoading(true);
    fetchClientDetail(tenantId, client.phone)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        if (typeof res.notes === "string") {
          setNoteText(res.notes);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Erro ao carregar ficha do cliente:", err);
          toast.error("Não foi possível carregar o histórico completo do cliente.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, client, tenantId]);

  if (!client) return null;

  const segment = classifyClientSegment(client, vipSpentThreshold);
  const avgTicket =
    client.totalOrders > 0 ? client.totalSpent / client.totalOrders : 0;
  const cashbackBalance =
    detail !== null ? detail.cashbackBalance : Number(client.cashbackBalance || 0);
  const cashbackExpiresAt =
    detail !== null ? detail.cashbackExpiresAt : client.cashbackExpiresAt;
  const templates = buildWhatsAppTemplates({
    ...client,
    cashbackBalance,
  });

  const primaryTemplate =
    (cashbackBalance > 0 && templates.find((t) => t.id === "cashback")) ||
    (segment.isAtRisk && templates.find((t) => t.id === "reactivate")) ||
    templates.find((t) => t.id === "blank") ||
    templates[0];

  const handleSaveNote = async () => {
    if (!tenantId || !client.phone) return;
    setIsSavingNote(true);
    try {
      const res = await saveClientNote(tenantId, client.phone, noteText);
      const savedNotes = res?.notes ?? noteText.trim();
      setNoteText(savedNotes);
      onNoteUpdated?.(client.id, savedNotes);
      toast.success("Anotação salva no perfil do cliente.");
    } catch (err) {
      console.error("Erro ao salvar anotação:", err);
      toast.error(err?.message || "Erro ao salvar anotação.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const openTemplate = (message) => {
    const url = buildWhatsAppUrl(client.phone, message);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const formattedPayment = formatPaymentMethodLabel(client.lastPaymentMethod);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[500px] p-0 flex flex-col bg-[#F5F7F6] border-l border-stone-200 overflow-hidden"
      >
        {/* Cabeçalho Executivo */}
        <SheetHeader className="px-5 pt-5 pb-4 bg-white border-b border-stone-200 text-left space-y-3.5">
          <div className="flex items-start gap-3.5 pr-8">
            <Avatar className="w-12 h-12 rounded-xl border border-emerald-200/80 shadow-2xs shrink-0">
              <AvatarFallback className="bg-emerald-900 text-white font-bold text-base rounded-xl">
                {client.full_name?.charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <SheetTitle className="text-lg font-bold text-stone-900 capitalize truncate leading-tight">
                  {client.full_name}
                </SheetTitle>
                {segment.primaryBadge && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold px-2 py-0.5 inline-flex items-center gap-1 ${segment.primaryBadge.className}`}
                  >
                    {segment.primaryBadge.key === "vip" && (
                      <Crown className="w-2.5 h-2.5" />
                    )}
                    {segment.primaryBadge.label}
                  </Badge>
                )}
              </div>

              <SheetDescription className="sr-only">
                Perfil e histórico de pedidos de {client.full_name}
              </SheetDescription>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-stone-500">
                <span className="inline-flex items-center gap-1 font-mono text-stone-700">
                  <Phone className="w-3 h-3 text-stone-400" />
                  {formatPhoneBR(client.phone)}
                </span>
                {client.firstOrderDate && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
                    <Calendar className="w-3 h-3" />
                    Desde{" "}
                    {format(client.firstOrderDate, "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Barra de Ação WhatsApp Unificada */}
          {client.phone && primaryTemplate && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => openTemplate(primaryTemplate.message)}
                className="flex-1 h-9 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg shadow-2xs cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                {primaryTemplate.id === "blank"
                  ? "Enviar WhatsApp"
                  : primaryTemplate.label}
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 px-3 text-xs font-medium bg-white border-stone-200 text-stone-700 hover:bg-stone-50 rounded-lg cursor-pointer"
                  >
                    Modelos
                    <ChevronDown className="w-3.5 h-3.5 ml-1 text-stone-400" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-64 p-1.5 space-y-0.5 bg-white border border-stone-200 shadow-lg rounded-xl"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 px-2.5 py-1">
                    Escolher mensagem
                  </p>
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => openTemplate(tpl.message)}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-emerald-50/80 transition-colors cursor-pointer"
                    >
                      <span className="block text-xs font-semibold text-stone-800">
                        {tpl.label}
                      </span>
                      <span className="block text-[10px] text-stone-400">
                        {tpl.description}
                      </span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          )}
        </SheetHeader>

        {/* Corpo rolável */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 3 KPIs Principais Alinhados */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white border border-stone-200/90 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 block">
                Total Gasto
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-stone-900 mt-1 block">
                {formatMoneyBRL(client.totalSpent)}
              </span>
            </div>

            <div className="bg-white border border-stone-200/90 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 block">
                Pedidos
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-stone-900 mt-1 block">
                {client.totalOrders}
              </span>
            </div>

            <div className="bg-white border border-stone-200/90 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 block">
                Ticket Médio
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-stone-900 mt-1 block">
                {formatMoneyBRL(avgTicket)}
              </span>
            </div>
          </div>

          {/* Faixa Dedicada de Cashback */}
          <div
            className={`rounded-xl px-4 py-3 border flex items-center justify-between gap-3 shadow-2xs ${
              cashbackBalance > 0
                ? "bg-emerald-50/80 border-emerald-200"
                : "bg-white border-stone-200/90"
            }`}
          >
            <div>
              <span className="text-[11px] font-semibold text-stone-500 block">
                Saldo de Cashback
              </span>
              <span
                className={`text-base font-bold font-mono tabular-nums ${
                  cashbackBalance > 0 ? "text-emerald-700" : "text-stone-400"
                }`}
              >
                {formatMoneyBRL(cashbackBalance)}
              </span>
            </div>
            {cashbackBalance > 0 && cashbackExpiresAt ? (
              <span className="text-[11px] font-medium text-emerald-800 bg-white/90 border border-emerald-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                Válido até{" "}
                <strong className="font-mono">
                  {format(new Date(cashbackExpiresAt), "dd/MM/yyyy", { locale: ptBR })}
                </strong>
              </span>
            ) : (
              <span className="text-[11px] text-stone-400 whitespace-nowrap">
                {cashbackBalance > 0 ? "Sem data de expiração" : "Sem saldo ativo"}
              </span>
            )}
          </div>

          {/* Endereço & Preferências */}
          <div className="bg-white border border-stone-200/90 rounded-xl p-4 shadow-2xs space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-stone-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-stone-500">
                  Último endereço de entrega
                </p>
                <p className="text-xs font-medium text-stone-800 mt-0.5 break-words leading-relaxed">
                  {client.lastAddress || "Sem endereço de entrega registrado"}
                </p>
              </div>
            </div>

            {(client.lastOrderType || formattedPayment) && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-2.5 border-t border-stone-100 text-xs text-stone-500">
                {client.lastOrderType && (
                  <span className="inline-flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-stone-400" />
                    Canal:
                    <strong className="text-stone-800 font-semibold">
                      {CHANNEL_LABELS[client.lastOrderType] || client.lastOrderType}
                    </strong>
                  </span>
                )}
                {formattedPayment && (
                  <span className="inline-flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-stone-400" />
                    Último pagamento:
                    <strong className="text-stone-800 font-semibold">
                      {formattedPayment}
                    </strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Itens Mais Pedidos */}
          <div className="bg-white border border-stone-200/90 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-700" />
              <h3 className="text-xs font-bold text-stone-900">
                Itens mais pedidos
              </h3>
            </div>
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-stone-400 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analisando pedidos...
              </div>
            ) : detail?.topItems?.length > 0 ? (
              <div className="space-y-2.5">
                {detail.topItems.map((item, idx) => {
                  const maxQty = Math.max(Number(detail.topItems[0]?.qty || 1), 1);
                  const pct = Math.max(8, Math.round((Number(item.qty || 0) / maxQty) * 100));
                  return (
                    <div key={`${item.name}-${idx}`} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[10px] font-bold text-stone-400 w-4 shrink-0">
                            {idx + 1}.
                          </span>
                          <span className="font-medium text-stone-800 truncate">
                            {item.name}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] font-semibold text-emerald-700 shrink-0 tabular-nums">
                          {item.qty}x
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600/80 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-stone-400">
                Nenhum item contabilizado ainda.
              </p>
            )}
          </div>

          {/* Observação Interna */}
          <div className="bg-white border border-stone-200/90 rounded-xl p-4 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-stone-500" />
                <h3 className="text-xs font-bold text-stone-900">
                  Observação interna
                </h3>
              </div>
              <span className="text-[10px] text-stone-400">
                Visível só para a equipe
              </span>
            </div>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Ex: Prefere lanche sem cebola, portaria bloco B, cliente VIP do bairro..."
              rows={2}
              maxLength={1000}
              className="text-xs bg-stone-50/70 border-stone-200 resize-none focus-visible:ring-emerald-700"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-stone-400 font-mono">
                {noteText.length}/1000
              </span>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveNote}
                disabled={isSavingNote}
                className="h-7 px-3 text-xs bg-stone-900 hover:bg-stone-800 text-white rounded-lg cursor-pointer"
              >
                {isSavingNote ? (
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                ) : (
                  <Check className="w-3 h-3 mr-1.5" />
                )}
                Salvar
              </Button>
            </div>
          </div>

          {/* Histórico Recente de Pedidos */}
          <div className="bg-white border border-stone-200/90 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-stone-500" />
                <h3 className="text-xs font-bold text-stone-900">
                  Últimos pedidos
                </h3>
              </div>
              {detail?.orders?.length > 0 && (
                <span className="text-[10px] text-stone-400">
                  {detail.orders.length} recentes
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-stone-400 py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando histórico...
              </div>
            ) : detail?.orders?.length > 0 ? (
              <div className="divide-y divide-stone-100">
                {detail.orders.map((ord) => {
                  const statusMeta = ORDER_STATUS_LABELS[
                    String(ord.status || "").toLowerCase()
                  ] || {
                    label: ord.status || "Pedido",
                    className: "bg-stone-100 text-stone-700 border-stone-200",
                  };
                  const itemsSummary = Array.isArray(ord.items)
                    ? ord.items
                        .slice(0, 3)
                        .map(
                          (it) =>
                            `${it.quantity || 1}x ${
                              it.name || it.product_name || "Item"
                            }`
                        )
                        .join(", ")
                    : "";

                  return (
                    <div key={ord.id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-xs text-stone-900">
                            #{ord.order_number || String(ord.id).slice(0, 6)}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${statusMeta.className}`}
                          >
                            {statusMeta.label}
                          </Badge>
                        </div>
                        <span className="font-mono font-bold text-xs tabular-nums text-stone-900 shrink-0">
                          {formatMoneyBRL(ord.total)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-stone-400">
                        <span className="truncate">
                          {itemsSummary || CHANNEL_LABELS[ord.order_type] || "Pedido"}
                        </span>
                        <span className="font-mono shrink-0">
                          {ord.created_date
                            ? format(new Date(ord.created_date), "dd/MM HH:mm", {
                                locale: ptBR,
                              })
                            : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-stone-400 text-center py-4">
                Nenhum pedido encontrado para este cliente.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
