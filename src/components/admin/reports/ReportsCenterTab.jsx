import React, { useState, useMemo, useEffect } from "react";
import {
  FileSpreadsheet,
  Printer,
  Calendar,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Building2,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  subDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  startOfDay,
  endOfDay,
  subMonths,
} from "date-fns";
import { formatInBrasilia } from "@/utils/dateTime";
import { buildReportData, exportReportToCSV } from "@/utils/reportExportBuilder";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import ReportDocumentPreviewModal from "./ReportDocumentPreviewModal";

const PERIOD_PRESETS = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "last_7_days", label: "Últimos 7 dias" },
  { id: "last_30_days", label: "Últimos 30 dias" },
  { id: "this_month", label: "Este Mês" },
  { id: "last_month", label: "Mês Anterior (Contabilidade)", isRecommended: true },
  { id: "this_year", label: "Este Ano" },
  { id: "custom", label: "Personalizado" },
];

export default function ReportsCenterTab({
  orders = [],
  sessions = [],
  tenantSettings = {},
  storeName = "PedeMuleke",
}) {
  const [selectedPeriod, setSelectedPeriod] = useState("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Dados dinâmicos sincronizados por período
  const [periodOrders, setPeriodOrders] = useState(orders);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Modal da Folha A4 Timbrada
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [compiledReport, setCompiledReport] = useState(null);

  const resolveDateRange = () => {
    const today = new Date();
    switch (selectedPeriod) {
      case "today":
        return { start: startOfDay(today), end: endOfDay(today) };
      case "yesterday": {
        const y = subDays(today, 1);
        return { start: startOfDay(y), end: endOfDay(y) };
      }
      case "last_7_days":
        return { start: subDays(today, 6), end: endOfDay(today) };
      case "last_30_days":
        return { start: subDays(today, 29), end: endOfDay(today) };
      case "this_month":
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case "last_month": {
        const lm = subMonths(today, 1);
        return { start: startOfMonth(lm), end: endOfMonth(lm) };
      }
      case "this_year":
        return { start: startOfYear(today), end: endOfYear(today) };
      case "custom":
        return {
          start: customStartDate ? startOfDay(new Date(customStartDate)) : subDays(today, 29),
          end: customEndDate ? endOfDay(new Date(customEndDate)) : endOfDay(today),
        };
      default:
        return { start: startOfMonth(today), end: endOfMonth(today) };
    }
  };

  const dateRange = useMemo(() => resolveDateRange(), [selectedPeriod, customStartDate, customEndDate]);

  // Carrega os pedidos exatos do período selecionado do banco para nunca faltar dados históricos
  useEffect(() => {
    let isMounted = true;
    const fetchOrdersForRange = async () => {
      const activeTenantId =
        localStorage.getItem("current_tenant_id") ||
        "a0000000-0000-0000-0000-000000000001";

      if (isSupabaseConfigured() && supabase) {
        setIsLoadingOrders(true);
        try {
          const { start, end } = dateRange;
          const paged = [];
          const PAGE_SIZE = 1000;
          for (let page = 0; page < 20; page++) {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            const { data: chunk, error } = await supabase
              .from("orders")
              .select("id, tenant_id, order_number, customer_name, customer_phone, total_amount, total, subtotal, delivery_fee, discount_amount, discount, cashback_discount, status, payment_method, order_type, table_session_id, items, created_date")
              .eq("tenant_id", activeTenantId)
              .gte("created_date", start.toISOString())
              .lte("created_date", end.toISOString())
              .order("created_date", { ascending: false })
              .range(from, to);

            if (error || !Array.isArray(chunk)) break;
            paged.push(...chunk);
            if (chunk.length < PAGE_SIZE) break;
          }

          if (isMounted) {
            setPeriodOrders(paged);
          }
        } catch (err) {
          console.warn("Erro ao buscar pedidos do período para o relatório:", err);
          if (isMounted) setPeriodOrders(orders);
        } finally {
          if (isMounted) setIsLoadingOrders(false);
        }
      } else {
        setPeriodOrders(orders);
      }
    };

    fetchOrdersForRange();
    return () => {
      isMounted = false;
    };
  }, [dateRange, orders]);

  // Prévia viva dos dados calculados para o período
  const currentData = useMemo(() => {
    return buildReportData({
      orders: periodOrders,
      sessions,
      reportType: "financial",
      dateRange,
      options: {
        includePayments: true,
        includeServiceFee: true,
        includeCancellations: true,
        includeChannels: true,
      },
      tenantSettings,
      storeName,
    });
  }, [periodOrders, sessions, dateRange, tenantSettings, storeName]);

  const { summary, paymentMethodsList = [], channelsList = [], productsList = [] } = currentData;

  const formatMoney = (val) => `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  // Ações de Emissão Direta
  const handleOpenPdf = (reportType) => {
    const data = buildReportData({
      orders: periodOrders,
      sessions,
      reportType,
      dateRange,
      options: {
        includePayments: true,
        includeServiceFee: true,
        includeCancellations: true,
        includeChannels: true,
      },
      tenantSettings,
      storeName,
    });
    setCompiledReport(data);
    setIsPreviewOpen(true);
  };

  const handleExportCsv = (reportType) => {
    const data = buildReportData({
      orders: periodOrders,
      sessions,
      reportType,
      dateRange,
      options: {
        includePayments: true,
        includeServiceFee: true,
        includeCancellations: true,
        includeChannels: true,
      },
      tenantSettings,
      storeName,
    });
    exportReportToCSV(data);
  };

  const periodLabelText = useMemo(() => {
    try {
      const s = formatInBrasilia(dateRange.start, "dd/MM/yyyy");
      const e = formatInBrasilia(dateRange.end, "dd/MM/yyyy");
      return s === e ? s : `${s} até ${e}`;
    } catch {
      return "Período selecionado";
    }
  }, [dateRange]);

  return (
    <div className="space-y-6">
      {/* 1. SELETOR DE PERÍODO UNIFICADO COM DESIGN EXECUTIVO */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#047857] flex items-center justify-center border border-emerald-100/70 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-stone-900 block">
                Período do Fechamento & Emissão
              </span>
              <span className="text-[11px] text-stone-500">
                Selecione o intervalo de apuração para gerar os documentos oficiais
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="text-stone-500">Intervalo:</span>
            <span className="font-semibold text-stone-900 bg-stone-100 px-3 py-1 rounded-lg border border-stone-200 font-mono text-[11px]">
              {periodLabelText}
            </span>
            <span className="text-stone-300">•</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-800 font-bold bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-md text-[11px]">
              {isLoadingOrders ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {summary.totalOrdersCount} pedido{summary.totalOrdersCount === 1 ? "" : "s"} apurado{summary.totalOrdersCount === 1 ? "" : "s"}
                </>
              )}
            </span>
          </div>
        </div>

        {/* Botoes de Presets Rápidos */}
        <div className="flex items-center gap-2 flex-wrap">
          {PERIOD_PRESETS.map((preset) => {
            const isSelected = selectedPeriod === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedPeriod(preset.id)}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border text-center flex items-center gap-1.5 active:scale-[0.98]",
                  isSelected
                    ? "bg-stone-900 border-stone-900 text-white shadow-xs font-bold"
                    : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50 hover:border-stone-300 hover:text-stone-900"
                )}
              >
                <span>{preset.label}</span>
                {preset.isRecommended && !isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Recomendado para contabilidade" />
                )}
              </button>
            );
          })}
        </div>

        {/* Campos de Data Customizada */}
        {selectedPeriod === "custom" && (
          <div className="pt-3 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md animate-in fade-in">
            <div>
              <Label className="text-[11px] font-semibold text-stone-600 block mb-1">
                Data Inicial
              </Label>
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-8 text-xs font-mono border-stone-300"
              />
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-stone-600 block mb-1">
                Data Final
              </Label>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-8 text-xs font-mono border-stone-300"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. OS 3 DOCUMENTOS OFICIAIS EM CARDS EXECUTIVOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CARD 1: BALANÇO FINANCEIRO & FISCAL */}
        <Card className="border border-stone-200/90 rounded-2xl shadow-2xs hover:shadow-md transition-all bg-white flex flex-col justify-between overflow-hidden group">
          <div>
            <div className="p-5 border-b border-stone-100 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#047857] flex items-center justify-center shrink-0 border border-emerald-100/80 group-hover:scale-105 transition-transform">
                  <DollarSign className="w-5 h-5" />
                </div>
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-[#047857] border-emerald-200 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5"
                >
                  Fiscal & Sócios
                </Badge>
              </div>

              <div>
                <h3 className="text-base font-bold text-stone-900 tracking-tight group-hover:text-emerald-900 transition-colors">
                  Balanço Financeiro & Fiscal
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed mt-0.5">
                  Demonstrativo oficial de faturamento bruto, descontos concedidos e segregação bancária (Pix/Cartões) para o Simples Nacional.
                </p>
              </div>
            </div>

            {/* Prévia Viva dos Números (Mini-DRE) */}
            <div className="p-5 space-y-3.5 bg-stone-50/50">
              {/* Cascata Bruto x Descontos x Líquido */}
              <div className="bg-white rounded-xl p-3.5 border border-stone-200/80 shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span className="font-medium">(+) Faturamento Bruto:</span>
                  <span className="font-mono font-bold text-stone-900">{formatMoney(summary.totalGrossRevenue)}</span>
                </div>

                <div className="flex items-center justify-between text-xs text-amber-800">
                  <span className="font-medium">(-) Descontos Concedidos:</span>
                  <span className="font-mono font-semibold">
                    {summary.totalDiscounts > 0 ? `-${formatMoney(summary.totalDiscounts)}` : "R$ 0,00"}
                  </span>
                </div>

                <div className="pt-2 border-t border-stone-200/80 flex items-baseline justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900">
                    (=) Faturamento Líquido:
                  </span>
                  <span className="text-xl font-black text-emerald-950 font-mono tracking-tight">
                    {formatMoney(summary.netRevenue)}
                  </span>
                </div>
              </div>

              {/* Meios de Pagamento (Destino do Líquido) */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">
                  Distribuição por Meio de Pagamento
                </span>
                {paymentMethodsList.length > 0 ? (
                  paymentMethodsList.slice(0, 3).map((pm) => (
                    <div key={pm.id} className="flex items-center justify-between text-xs">
                      <span className="text-stone-600 truncate flex items-center gap-1.5 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        {pm.label}
                      </span>
                      <span className="font-semibold text-stone-900 font-mono text-[11px]">
                        {formatMoney(pm.revenue)}{" "}
                        <span className="text-stone-400 font-normal">({pm.percentage}%)</span>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-stone-400 text-xs italic py-1">Nenhum pagamento registrado no período.</p>
                )}
              </div>

              {summary.canceledOrdersCount > 0 && (
                <div className="pt-2 border-t border-stone-200/60 text-[11px] text-rose-700 flex items-center justify-between">
                  <span>Cancelamentos / Perdas ({summary.canceledOrdersCount} ped.)</span>
                  <span className="font-mono font-medium">-{formatMoney(summary.totalCanceledRevenue)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Botões de Emissão */}
          <div className="p-4 bg-white border-t border-stone-100 flex items-center gap-2">
            <Button
              type="button"
              onClick={() => handleOpenPdf("financial")}
              className="flex-1 h-10 rounded-xl font-bold text-xs bg-[#047857] hover:bg-[#036348] text-white gap-2 cursor-pointer shadow-xs active:scale-[0.98] transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Gerar PDF (A4)</span>
            </Button>
            <Button
              type="button"
              onClick={() => handleExportCsv("financial")}
              variant="outline"
              className="h-10 px-3.5 rounded-xl font-semibold text-xs text-stone-700 border border-stone-300 hover:bg-stone-50 gap-1.5 cursor-pointer shadow-2xs"
              title="Baixar planilha compatível com Microsoft Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Excel</span>
            </Button>
          </div>
        </Card>

        {/* CARD 2: EXTRATO OPERACIONAL DE PEDIDOS */}
        <Card className="border border-stone-200/90 rounded-2xl shadow-2xs hover:shadow-md transition-all bg-white flex flex-col justify-between overflow-hidden group">
          <div>
            <div className="p-5 border-b border-stone-100 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-100/80 group-hover:scale-105 transition-transform">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <Badge
                  variant="outline"
                  className="bg-blue-50 text-blue-800 border-blue-200 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5"
                >
                  Auditoria & Caixa
                </Badge>
              </div>

              <div>
                <h3 className="text-base font-bold text-stone-900 tracking-tight group-hover:text-blue-900 transition-colors">
                  Extrato Geral de Pedidos
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed mt-0.5">
                  Auditoria analítica linha a linha com código do pedido, data/hora, cliente, canal (Mesa, Delivery, Balcão) e totais.
                </p>
              </div>
            </div>

            {/* Prévia Viva dos Números */}
            <div className="p-5 space-y-3.5 bg-stone-50/50">
              <div className="bg-white rounded-xl p-3.5 border border-stone-200/80 shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span className="font-medium">Total de Pedidos Auditados:</span>
                  <span className="font-mono font-bold text-stone-900 text-sm">{summary.totalOrdersCount} pedidos</span>
                </div>
                <div className="flex items-center justify-between text-xs text-stone-600 pt-1 border-t border-stone-100">
                  <span className="font-medium">Ticket Médio por Pedido:</span>
                  <span className="font-mono font-bold text-stone-900">{formatMoney(summary.averageTicket)}</span>
                </div>
              </div>

              {/* Origem por Canais */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">
                  Distribuição por Canal de Atendimento
                </span>
                {channelsList.length > 0 ? (
                  channelsList.map((ch) => (
                    <div key={ch.id} className="flex items-center justify-between text-xs">
                      <span className="text-stone-600 truncate flex items-center gap-1.5 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        {ch.label}
                      </span>
                      <span className="font-semibold text-stone-900 font-mono text-[11px]">
                        {ch.count} ped.{" "}
                        <span className="text-stone-400 font-normal">({ch.percentage}%)</span>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-stone-400 text-xs italic py-1">Nenhum pedido registrado no período.</p>
                )}
              </div>

              <div className="pt-2 border-t border-stone-200/60 text-[11px] text-stone-600 flex items-center justify-between">
                <span>Taxas de entrega arrecadadas</span>
                <span className="font-mono font-semibold text-stone-900">{formatMoney(summary.totalDeliveryFee)}</span>
              </div>
            </div>
          </div>

          {/* Botões de Emissão */}
          <div className="p-4 bg-white border-t border-stone-100 flex items-center gap-2">
            <Button
              type="button"
              onClick={() => handleOpenPdf("orders")}
              className="flex-1 h-10 rounded-xl font-bold text-xs bg-[#047857] hover:bg-[#036348] text-white gap-2 cursor-pointer shadow-xs active:scale-[0.98] transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Gerar PDF (A4)</span>
            </Button>
            <Button
              type="button"
              onClick={() => handleExportCsv("orders")}
              variant="outline"
              className="h-10 px-3.5 rounded-xl font-semibold text-xs text-stone-700 border border-stone-300 hover:bg-stone-50 gap-1.5 cursor-pointer shadow-2xs"
              title="Baixar planilha compatível com Microsoft Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Excel</span>
            </Button>
          </div>
        </Card>

        {/* CARD 3: RANKING DO CARDÁPIO & CURVA ABC */}
        <Card className="border border-stone-200/90 rounded-2xl shadow-2xs hover:shadow-md transition-all bg-white flex flex-col justify-between overflow-hidden group">
          <div>
            <div className="p-5 border-b border-stone-100 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-100/80 group-hover:scale-105 transition-transform">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <Badge
                  variant="outline"
                  className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5"
                >
                  Mix & Cardápio
                </Badge>
              </div>

              <div>
                <h3 className="text-base font-bold text-stone-900 tracking-tight group-hover:text-amber-900 transition-colors">
                  Ranking do Cardápio & Curva ABC
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed mt-0.5">
                  Classificação de itens mais vendidos, representatividade de receita e controle de giro de estoque para compras e fornecedores.
                </p>
              </div>
            </div>

            {/* Prévia Viva dos Números */}
            <div className="p-5 space-y-3.5 bg-stone-50/50">
              <div className="bg-white rounded-xl p-3.5 border border-stone-200/80 shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span className="font-medium">Unidades Vendidas:</span>
                  <span className="font-mono font-bold text-stone-900 text-sm">
                    {productsList.reduce((s, p) => s + p.quantity, 0)} itens
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-stone-600 pt-1 border-t border-stone-100">
                  <span className="font-medium">Produtos Distintos no Período:</span>
                  <span className="font-mono font-bold text-stone-900">{productsList.length} itens</span>
                </div>
              </div>

              {/* Top 3 Produtos Mais Vendidos */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 block mb-1">
                  Top 3 Itens Mais Faturados
                </span>
                {productsList.length > 0 ? (
                  productsList.slice(0, 3).map((prod, idx) => (
                    <div key={prod.id || idx} className="flex items-center justify-between text-xs">
                      <span className="text-stone-700 truncate max-w-[150px] flex items-center gap-1.5 font-medium">
                        <span className="font-mono text-stone-400 text-[10px] font-bold">{idx + 1}º</span>
                        {prod.name}
                      </span>
                      <span className="font-semibold text-stone-900 font-mono text-[11px]">
                        {prod.quantity} un.{" "}
                        <span className="text-stone-400 font-normal">({prod.percentage}%)</span>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-stone-400 text-xs italic py-1">Nenhum produto vendido no período.</p>
                )}
              </div>

              {productsList.length > 3 && (
                <div className="pt-2 border-t border-stone-200/60 text-[11px] text-stone-500 italic flex items-center justify-between">
                  <span>Outros itens detalhados no relatório</span>
                  <span className="font-medium">+{productsList.length - 3} itens</span>
                </div>
              )}
            </div>
          </div>

          {/* Botões de Emissão */}
          <div className="p-4 bg-white border-t border-stone-100 flex items-center gap-2">
            <Button
              type="button"
              onClick={() => handleOpenPdf("products")}
              className="flex-1 h-10 rounded-xl font-bold text-xs bg-[#047857] hover:bg-[#036348] text-white gap-2 cursor-pointer shadow-xs active:scale-[0.98] transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Gerar PDF (A4)</span>
            </Button>
            <Button
              type="button"
              onClick={() => handleExportCsv("products")}
              variant="outline"
              className="h-10 px-3.5 rounded-xl font-semibold text-xs text-stone-700 border border-stone-300 hover:bg-stone-50 gap-1.5 cursor-pointer shadow-2xs"
              title="Baixar planilha compatível com Microsoft Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Excel</span>
            </Button>
          </div>
        </Card>
      </div>

      {/* 3. PROTOCOLO DE CONFORMIDADE E SUPORTE CONTÁBIL */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-stone-200/90 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center shrink-0 border border-stone-200">
            <Building2 className="w-4 h-4 text-stone-700" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
              Protocolo Contábil & Fechamento Mensal
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            </h4>
            <p className="text-xs text-stone-500 leading-relaxed mt-0.5 max-w-3xl">
              Os documentos oficiais gerados em PDF A4 seguem o padrão timbrado da sua empresa com CNPJ, discriminação contábil entre receita bancária e espécie, código de autenticidade e campo formal de assinatura do gestor, prontos para a apuração do DAS (Simples Nacional) e conciliação bancária.
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <Badge
            variant="outline"
            className="bg-stone-50 text-stone-700 border-stone-200 text-xs px-3 py-1 font-mono font-medium"
          >
            Padronização A4 / DRE
          </Badge>
        </div>
      </div>

      {/* Modal da Folha A4 Timbrada */}
      <ReportDocumentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        reportData={compiledReport}
      />
    </div>
  );
}
