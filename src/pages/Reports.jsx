import React, { useState, useEffect, useMemo } from "react";
import { Order } from "@/entities/Order";
import { Category } from "@/entities/Category";
import { Product } from "@/entities/Product";
import { Settings } from "@/entities/Settings";
import { TableSession } from "@/entities/RestaurantTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  DollarSign,
  ShoppingBag,
  Package,
  TrendingUp,
  X,
  Clock,
  Calendar,
  FileText,
  Store,
  CreditCard,
} from "lucide-react";
import { subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay, subMonths } from "date-fns";
import { formatInBrasilia } from "@/utils/dateTime";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import DailySalesChart from "@/components/admin/reports/DailySalesChart";
import PeakHoursChart from "@/components/admin/reports/PeakHoursChart";
import ServiceFeeAccumulatedChart from "@/components/admin/reports/ServiceFeeAccumulatedChart";
import PaymentMethodsReport from "@/components/admin/reports/PaymentMethodsReport";
import ReportsCenterTab from "@/components/admin/reports/ReportsCenterTab";
import SalesChannelsReport from "@/components/admin/reports/SalesChannelsReport";
import TopProductsRanking from "@/components/admin/reports/TopProductsRanking";
import DayOfWeekReport from "@/components/admin/reports/DayOfWeekReport";
import FinancialBreakdownStrip from "@/components/admin/reports/FinancialBreakdownStrip";
import {
  aggregateDailySales,
  aggregateCategoryDistribution,
  aggregatePeakHours,
  aggregateServiceFeeCumulative,
  aggregatePaymentMethodsDistribution,
  aggregateSalesChannels,
  aggregateTopProducts,
  aggregateDayOfWeekSales,
  aggregateFinancialBreakdown,
} from "@/utils/reportsAnalytics";

const PERIOD_PRESETS = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "last_7_days", label: "Últimos 7 dias" },
  { id: "last_30_days", label: "Últimos 30 dias" },
  { id: "this_month", label: "Este Mês" },
  { id: "last_month", label: "Mês Anterior" },
  { id: "this_year", label: "Este Ano" },
  { id: "custom", label: "Personalizado" },
];

const ANALYTICS_SUBTABS = [
  { id: "overview", label: "Visão Geral & Faturamento", icon: TrendingUp },
  { id: "products", label: "Produtos & Cardápio", icon: Package },
  { id: "channels", label: "Canais & Operação", icon: Store },
  { id: "payments", label: "Meios de Pagamento", icon: CreditCard },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("sales"); // "sales" | "export"
  const [analyticsSubTab, setAnalyticsSubTab] = useState("overview"); // "overview" | "products" | "channels" | "payments"
  const [reportPeriod, setReportPeriod] = useState("last_30_days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [allOrders, setAllOrders] = useState([]);
  const [tableSessions, setTableSessions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [tenantSettings, setTenantSettings] = useState(null);

  const getDateRange = () => {
    const today = new Date();
    switch (reportPeriod) {
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
        return { start: subDays(today, 29), end: endOfDay(today) };
    }
  };

  useEffect(() => {
    loadAllData();
  }, [reportPeriod, customStartDate, customEndDate]);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const activeTenantId =
        localStorage.getItem("current_tenant_id") ||
        "a0000000-0000-0000-0000-000000000001";
      const { start, end } = getDateRange();

      const useRemotePagedOrders = Boolean(isSupabaseConfigured() && supabase);

      const [sessionsList, ordersList, catsList, prodsList, settingsList] =
        await Promise.all([
          useRemotePagedOrders ? Promise.resolve([]) : TableSession.list("-closed_at", 1000).catch(() => []),
          useRemotePagedOrders ? Promise.resolve([]) : Order.list("-created_date", 5000).catch(() => []),
          Category.list("order_index").catch(() => []),
          Product.list("-created_date").catch(() => []),
          Settings.list().catch(() => []),
        ]);

      let resolvedTenantSettings = settingsList?.[0] || null;
      let finalSessions = Array.isArray(sessionsList) ? sessionsList : [];
      let finalOrders = Array.isArray(ordersList) ? ordersList : [];

      if (useRemotePagedOrders) {
        try {
          const { data: tenantData } = await supabase
            .from("tenants")
            .select("*")
            .eq("id", activeTenantId)
            .maybeSingle();

          if (tenantData) {
            resolvedTenantSettings = { ...(resolvedTenantSettings || {}), ...tenantData };
          }

          // Paginação completa dos pedidos do período sem limite arbitrário de 500
          const pagedOrders = [];
          const PAGE_SIZE = 1000;
          for (let page = 0; page < 50; page++) {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            const { data: chunk, error: ordErr } = await supabase
              .from("orders")
              .select("id, tenant_id, order_number, customer_name, customer_phone, total_amount, total, subtotal, delivery_fee, discount_amount, discount, cashback_discount, status, payment_method, order_type, table_session_id, items, created_date")
              .eq("tenant_id", activeTenantId)
              .gte("created_date", start.toISOString())
              .lte("created_date", end.toISOString())
              .order("created_date", { ascending: false })
              .range(from, to);
            if (ordErr || !Array.isArray(chunk)) break;
            pagedOrders.push(...chunk);
            if (chunk.length < PAGE_SIZE) break;
          }
          finalOrders = pagedOrders;

          // Paginação completa das sessões de mesa fechadas no período
          const pagedSessions = [];
          for (let page = 0; page < 20; page++) {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            const { data: sessChunk, error: sessErr } = await supabase
              .from("table_sessions")
              .select("*")
              .eq("tenant_id", activeTenantId)
              .eq("status", "closed")
              .gte("closed_at", start.toISOString())
              .lte("closed_at", end.toISOString())
              .order("closed_at", { ascending: false })
              .range(from, to);
            if (sessErr || !Array.isArray(sessChunk)) break;
            pagedSessions.push(...sessChunk);
            if (sessChunk.length < PAGE_SIZE) break;
          }
          finalSessions = pagedSessions;
        } catch (err) {
          console.warn("[ReportsPage] Erro ao buscar complementos no Supabase:", err);
        }
      }

      setTableSessions(finalSessions);
      setAllOrders(finalOrders);
      setCategories(Array.isArray(catsList) ? catsList : []);
      setProducts(Array.isArray(prodsList) ? prodsList : []);
      setTenantSettings(resolvedTenantSettings);
    } catch (err) {
      console.error("[ReportsPage] Erro ao carregar dados:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtra pedidos pertencentes ao período selecionado
  const dateRange = getDateRange();
  const periodOrders = useMemo(() => {
    const { start, end } = dateRange;
    const startMs = start.getTime();
    const endMs = end.getTime();

    return allOrders.filter((order) => {
      if (!order.created_date) return false;
      const orderMs = new Date(order.created_date).getTime();
      return orderMs >= startMs && orderMs <= endMs;
    });
  }, [allOrders, dateRange]);

  // Pedidos válidos (não cancelados) e cancelados
  const validOrders = useMemo(
    () => periodOrders.filter((o) => o.status !== "cancelado"),
    [periodOrders]
  );
  const canceledOrders = useMemo(
    () => periodOrders.filter((o) => o.status === "cancelado"),
    [periodOrders]
  );

  // KPIs Financeiros
  const totalRevenue = useMemo(
    () => validOrders.reduce((sum, o) => sum + (Number(o.total_amount ?? o.total ?? 0) || 0), 0),
    [validOrders]
  );
  const lostRevenue = useMemo(
    () => canceledOrders.reduce((sum, o) => sum + (Number(o.total_amount ?? o.total ?? 0) || 0), 0),
    [canceledOrders]
  );
  const totalOrdersCount = validOrders.length;
  const canceledOrdersCount = canceledOrders.length;
  const avgTicket = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;
  const totalProductsSold = useMemo(
    () =>
      validOrders.reduce(
        (sum, o) =>
          sum +
          (o.items?.reduce((isum, i) => isum + (Number(i.quantity || 1) || 1), 0) || 0),
        0
      ),
    [validOrders]
  );

  // Horário de corte do dia comercial (padrão 04:00 da madrugada)
  const cutoffTime = tenantSettings?.business_day_cutoff_time || "04:00";

  // 1. Agregação Diária de Vendas (Gráfico de Barras por Dia)
  const dailySalesData = useMemo(
    () => aggregateDailySales(periodOrders, dateRange.start, dateRange.end, cutoffTime),
    [periodOrders, dateRange, cutoffTime]
  );

  // 2. Agregação de Categorias (Gráfico Donut Resiliente com Snapshot)
  const categoryMetrics = useMemo(
    () => aggregateCategoryDistribution(periodOrders, categories, products),
    [periodOrders, categories, products]
  );

  // 3. Agregação de Horários de Pico
  const peakHoursResult = useMemo(
    () => aggregatePeakHours(periodOrders),
    [periodOrders]
  );

  // 4. Agregação de Sessões de Mesa e Taxas de Serviço Acumuladas
  const periodSessions = useMemo(() => {
    const { start, end } = dateRange;
    const startMs = start.getTime();
    const endMs = end.getTime();

    return tableSessions.filter((session) => {
      const dateStr = session.closed_at || session.created_at;
      if (!dateStr) return false;
      const sessionMs = new Date(dateStr).getTime();
      return sessionMs >= startMs && sessionMs <= endMs;
    });
  }, [tableSessions, dateRange]);

  const isSingleDay = reportPeriod === "today";
  const serviceFeeMetrics = useMemo(
    () =>
      aggregateServiceFeeCumulative(
        periodSessions,
        validOrders,
        dateRange.start,
        dateRange.end,
        isSingleDay
      ),
    [periodSessions, validOrders, dateRange, isSingleDay]
  );

  // 5. Agregação Consolidada por Método de Pagamento
  const paymentMethodsAnalytics = useMemo(
    () => aggregatePaymentMethodsDistribution(validOrders),
    [validOrders]
  );

  // 6. Agregação por Canais de Venda (Delivery vs Balcão vs Salão)
  const channelsAnalytics = useMemo(
    () => aggregateSalesChannels(validOrders),
    [validOrders]
  );

  // 7. Top Produtos Mais Vendidos & Curva ABC
  const topProductsAnalytics = useMemo(
    () => aggregateTopProducts(validOrders, 10),
    [validOrders]
  );

  // 8. Padrão Semanal de Vendas (Segunda a Domingo)
  const dayOfWeekAnalytics = useMemo(
    () => aggregateDayOfWeekSales(validOrders, cutoffTime),
    [validOrders, cutoffTime]
  );

  // 9. Composição Financeira DRE (Bruto x Deduções x Líquido)
  const financialBreakdown = useMemo(
    () => aggregateFinancialBreakdown(validOrders, periodSessions),
    [validOrders, periodSessions]
  );

  const isServiceFeeEnabled = tenantSettings?.table_service_fee_enabled === true;
  const serviceFeeRate = Number(tenantSettings?.table_service_fee_rate ?? 10);
  const showServiceFeeReport = isServiceFeeEnabled || serviceFeeMetrics.totalServiceFee > 0;

  const COLORS = [
    "#dc2626", // vermelho
    "#ea580c", // laranja
    "#d97706", // âmbar
    "#ca8a04", // amarelo escuro
    "#65a30d", // lima
    "#059669", // esmeralda
    "#0284c7", // azul claro
    "#7c3aed", // violeta
  ];

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const periodLabelText = useMemo(() => {
    try {
      const s = formatInBrasilia(dateRange.start, "dd/MM/yyyy");
      const e = formatInBrasilia(dateRange.end, "dd/MM/yyyy");
      return s === e ? s : `${s} até ${e}`;
    } catch {
      return "Período selecionado";
    }
  }, [dateRange]);

  const canceledPercentage = useMemo(() => {
    const total = totalOrdersCount + canceledOrdersCount;
    return total > 0 ? ((canceledOrdersCount / total) * 100).toFixed(1) : "0";
  }, [totalOrdersCount, canceledOrdersCount]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F7F9F8]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#047857] mx-auto"></div>
          <p className="text-stone-600 font-semibold text-sm">Carregando relatórios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-[#F7F9F8] min-h-screen space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho Executivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              Relatórios & Indicadores
            </h1>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border border-stone-300 bg-stone-100 text-stone-700">
              Analytics
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            Acompanhe faturamento, horários de pico, produtos mais vendidos e exporte relatórios gerenciais.
          </p>
        </div>
      </div>

      {/* Abas Principais: Vendas vs Emissor de Relatórios */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-fit">
        <TabsList className="bg-stone-100 p-1 rounded-xl border border-stone-200 w-full sm:w-auto flex h-auto">
          <TabsTrigger
            value="sales"
            className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-xs px-4 py-2 gap-2 cursor-pointer transition-all"
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
            <span>Vendas & Análise</span>
          </TabsTrigger>
          <TabsTrigger
            value="export"
            className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-xs px-4 py-2 gap-2 cursor-pointer transition-all"
          >
            <FileText className="w-3.5 h-3.5 text-blue-700" />
            <span>Central de Relatórios (PDF / Excel)</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ================= ABA 1: VENDAS & ANÁLISE ================= */}
      {activeTab === "sales" && (
        <div className="space-y-4">
          {/* Seletor de Período Compacto e Padronizado */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/90 shadow-2xs space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#047857]" />
                <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                  Período de Análise
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-stone-500">
                <span>Intervalo:</span>
                <span className="font-semibold text-stone-900 bg-stone-100 px-2.5 py-0.5 rounded-lg border border-stone-200 font-mono text-[11px]">
                  {periodLabelText}
                </span>
                <span className="text-stone-300">•</span>
                <span className="text-emerald-700 font-bold">
                  {totalOrdersCount} pedido{totalOrdersCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {/* Pílulas de Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {PERIOD_PRESETS.map((preset) => {
                const isSelected = reportPeriod === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setReportPeriod(preset.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border text-center active:scale-[0.98] ${
                      isSelected
                        ? "bg-stone-900 border-stone-900 text-white shadow-xs font-bold"
                        : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50 hover:border-stone-300 hover:text-stone-900"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Se Customizado */}
            {reportPeriod === "custom" && (
              <div className="pt-2 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md animate-in fade-in">
                <div>
                  <Label htmlFor="start-date" className="text-[11px] font-semibold text-stone-600 block mb-1">
                    Data inicial
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="h-8 text-xs font-mono border-stone-300"
                  />
                </div>
                <div>
                  <Label htmlFor="end-date" className="text-[11px] font-semibold text-stone-600 block mb-1">
                    Data final
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="h-8 text-xs font-mono border-stone-300"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Faixa Executiva de 5 KPIs Compactos em 1 Linha */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* 1. Receita Total */}
            <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 truncate">
                  Receita Total
                </span>
                <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <DollarSign className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <span className="text-lg sm:text-xl font-bold font-mono text-stone-900 tracking-tight block">
                  {formatMoney(totalRevenue)}
                </span>
                <span className="text-[10px] text-stone-400 font-medium">Líquido apurado</span>
              </div>
            </div>

            {/* 2. Total de Pedidos */}
            <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 truncate">
                  Total Pedidos
                </span>
                <div className="w-6 h-6 rounded-md bg-stone-100 text-stone-600 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <span className="text-lg sm:text-xl font-bold font-mono text-stone-900 tracking-tight block">
                  {totalOrdersCount}
                </span>
                <span className="text-[10px] text-stone-400 font-medium">Entregues / Salão</span>
              </div>
            </div>

            {/* 3. Ticket Médio */}
            <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 truncate">
                  Ticket Médio
                </span>
                <div className="w-6 h-6 rounded-md bg-stone-100 text-stone-600 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <span className="text-lg sm:text-xl font-bold font-mono text-stone-900 tracking-tight block">
                  {formatMoney(avgTicket)}
                </span>
                <span className="text-[10px] text-stone-400 font-medium">Por pedido</span>
              </div>
            </div>

            {/* 4. Produtos Vendidos */}
            <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 truncate">
                  Itens Vendidos
                </span>
                <div className="w-6 h-6 rounded-md bg-stone-100 text-stone-600 flex items-center justify-center shrink-0">
                  <Package className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <span className="text-lg sm:text-xl font-bold font-mono text-stone-900 tracking-tight block">
                  {totalProductsSold} un.
                </span>
                <span className="text-[10px] text-stone-400 font-medium">Comercializados</span>
              </div>
            </div>

            {/* 5. Cancelamentos & Perdas */}
            <div className="bg-white p-3.5 rounded-2xl border border-rose-200/80 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 truncate">
                  Cancelados
                </span>
                <div className="w-6 h-6 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <X className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg sm:text-xl font-bold font-mono text-rose-700 tracking-tight">
                    {canceledOrdersCount}
                  </span>
                  <span className="text-[11px] font-mono font-medium text-rose-600">
                    (-{formatMoney(lostRevenue)})
                  </span>
                </div>
                <span className="text-[10px] text-rose-500 font-medium block truncate">
                  {canceledPercentage}% do volume
                </span>
              </div>
            </div>
          </div>

          {/* Sub-Abas Analíticas Temáticas */}
          <Tabs value={analyticsSubTab} onValueChange={setAnalyticsSubTab} className="w-fit">
            <TabsList className="bg-stone-100 p-1 rounded-xl border border-stone-200 w-full sm:w-auto flex flex-wrap h-auto gap-1">
              {ANALYTICS_SUBTABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-xs px-4 py-2 gap-2 cursor-pointer transition-all"
                  >
                    <Icon className="w-3.5 h-3.5 text-stone-600" />
                    <span>{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {/* ================= SUB-ABA 1: VISÃO GERAL & FATURAMENTO ================= */}
          {analyticsSubTab === "overview" && (
            <div className="space-y-4 animate-in fade-in">
              {/* DRE SIMPLIFICADA / COMPOSIÇÃO FINANCEIRA DAS VENDAS (BRUTO X DEDUÇÕES X LÍQUIDO) */}
              <FinancialBreakdownStrip data={financialBreakdown} />

              {/* 1. GRÁFICO DE BARRAS: VENDAS DIA A DIA */}
              <Card className="border border-stone-200 rounded-xl shadow-2xs bg-white overflow-hidden">
                <CardHeader className="bg-stone-50/70 border-b border-stone-200/80 pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-emerald-700" />
                      <span>Evolução Diária de Vendas</span>
                    </CardTitle>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Faturamento apurado dia a dia no período selecionado
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-semibold bg-emerald-50/60 text-emerald-800 border-emerald-200">
                    {dailySalesData.filter((d) => d.revenue > 0).length} dias com vendas
                  </Badge>
                </CardHeader>
                <CardContent className="pt-4">
                  <DailySalesChart data={dailySalesData} />
                </CardContent>
              </Card>

              {/* PADRÃO SEMANAL DE VENDAS (SEGUNDA A DOMINGO) */}
              <DayOfWeekReport
                analyticsData={dayOfWeekAnalytics}
                cutoffTime={cutoffTime}
              />
            </div>
          )}

          {/* ================= SUB-ABA 2: PRODUTOS & CARDÁPIO ================= */}
          {analyticsSubTab === "products" && (
            <div className="space-y-4 animate-in fade-in">
              {/* TOP PRODUTOS MAIS VENDIDOS & CURVA ABC */}
              <TopProductsRanking analyticsData={topProductsAnalytics} />

              {/* GRID: DONUT DE CATEGORIAS + TABELA DETALHADA */}
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Gráfico Redondo: Distribuição por Categoria (Com Snapshot Histórico) */}
                <Card className="border border-stone-200 rounded-xl shadow-2xs bg-white">
                  <CardHeader className="border-b border-stone-200/80 pb-3 flex flex-row items-center justify-between bg-stone-50/70">
                    <div>
                      <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-700" />
                        <span>Distribuição por Categoria</span>
                      </CardTitle>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Preserva nomes originais das categorias mesmo se forem excluídas
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs font-semibold bg-white text-stone-700 border-stone-300">
                      {categoryMetrics.length} categorias
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {categoryMetrics.length === 0 ? (
                      <div className="h-[280px] flex flex-col items-center justify-center text-stone-400 gap-2">
                        <TrendingUp className="w-10 h-10 stroke-1 text-stone-300" />
                        <p className="text-sm font-medium">Sem dados de distribuição para este período</p>
                      </div>
                    ) : (
                      <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={categoryMetrics}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percentage }) => `${name} ${percentage}%`}
                              outerRadius={95}
                              innerRadius={45}
                              paddingAngle={3}
                              dataKey="revenue"
                            >
                              {categoryMetrics.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS[index % COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value) => [formatMoney(value), "Receita"]}
                              contentStyle={{
                                borderRadius: "8px",
                                border: "1px solid #e7e5e4",
                                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                                fontWeight: "600",
                                fontSize: "12px",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tabela Detalhada por Categoria */}
                <Card className="border border-stone-200 rounded-xl shadow-2xs overflow-hidden bg-white">
                  <CardHeader className="bg-stone-50/70 border-b border-stone-200/80 pb-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold text-stone-900">
                      Detalhamento por Categoria
                    </CardTitle>
                    <span className="text-[11px] text-stone-500 font-medium">Snapshot histórico</span>
                  </CardHeader>
                  {categoryMetrics.length === 0 ? (
                    <CardContent className="h-[280px] flex flex-col items-center justify-center text-stone-400 gap-2">
                      <Package className="w-8 h-8 stroke-1 text-stone-300" />
                      <p className="text-xs font-medium">Nenhuma categoria encontrada no período</p>
                    </CardContent>
                  ) : (
                    <div className="overflow-x-auto max-h-[310px] overflow-y-auto">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-stone-50/70 text-stone-500 uppercase text-[10px] font-semibold border-b border-stone-200/80 sticky top-0 bg-stone-50">
                          <tr>
                            <th className="py-2.5 px-3">Categoria</th>
                            <th className="py-2.5 px-3 text-center">Itens</th>
                            <th className="py-2.5 px-3 text-right">Faturamento</th>
                            <th className="py-2.5 px-3 text-right">% Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 bg-white font-medium">
                          {categoryMetrics.map((cat, idx) => (
                            <tr key={idx} className="hover:bg-stone-50/60 transition-colors">
                              <td className="py-2.5 px-3 flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                                />
                                <span className="font-semibold text-stone-900 truncate">{cat.name}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-medium text-stone-700">
                                {cat.items} un.
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900">
                                {formatMoney(cat.revenue)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                                {cat.percentage}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* ================= SUB-ABA 3: CANAIS & OPERAÇÃO ================= */}
          {analyticsSubTab === "channels" && (
            <div className="space-y-4 animate-in fade-in">
              {/* ORIGEM DAS VENDAS & CANAIS (DELIVERY VS BALCÃO VS SALÃO) */}
              <SalesChannelsReport analyticsData={channelsAnalytics} />

              {/* GRID: HORÁRIOS DE PICO + TAXAS DE SERVIÇO */}
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Gráfico de Horários de Pico */}
                <Card className="border border-stone-200 rounded-xl shadow-2xs bg-white">
                  <CardHeader className="border-b border-stone-200/80 pb-3 flex flex-row items-center justify-between bg-stone-50/70">
                    <div>
                      <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-stone-700" />
                        <span>Horários de Pico (Volume por Hora)</span>
                      </CardTitle>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Distribuição de pedidos das 00h às 23h (Fuso de Brasília)
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <PeakHoursChart
                      data={peakHoursResult.hourlyData}
                      peakHourInfo={peakHoursResult.peakHourInfo}
                    />
                  </CardContent>
                </Card>

                {/* GRÁFICO DE VALOR ACUMULADO DA TAXA DE SERVIÇO */}
                {showServiceFeeReport ? (
                  <ServiceFeeAccumulatedChart
                    data={serviceFeeMetrics.dailyData}
                    totalServiceFee={serviceFeeMetrics.totalServiceFee}
                    totalSessionsCount={serviceFeeMetrics.totalSessionsCount}
                    avgServiceFee={serviceFeeMetrics.avgServiceFee}
                    serviceFeeRate={serviceFeeRate}
                    isEnabled={isServiceFeeEnabled}
                    isHourly={serviceFeeMetrics.isHourly}
                  />
                ) : (
                  <Card className="border border-stone-200 rounded-xl shadow-2xs bg-white flex flex-col justify-center">
                    <CardContent className="p-6 text-center space-y-2 text-stone-400">
                      <Store className="w-8 h-8 stroke-1 text-stone-300 mx-auto" />
                      <p className="text-xs font-semibold text-stone-600">Taxa de Serviço de Mesas</p>
                      <p className="text-[11px] text-stone-400 max-w-xs mx-auto">
                        A taxa de serviço (gorjetas / 10% garçom) está desativada ou não possui movimentação no período selecionado.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* ================= SUB-ABA 4: MEIOS DE PAGAMENTO ================= */}
          {analyticsSubTab === "payments" && (
            <div className="space-y-4 animate-in fade-in">
              <PaymentMethodsReport analyticsData={paymentMethodsAnalytics} />
            </div>
          )}
        </div>
      )}

      {/* ================= ABA 2: CENTRAL DE EMISSÃO DE RELATÓRIOS OFICIAIS ================= */}
      {activeTab === "export" && (
        <ReportsCenterTab
          orders={allOrders}
          sessions={tableSessions}
          tenantSettings={tenantSettings}
          storeName={
            tenantSettings?.restaurant_name ||
            localStorage.getItem("current_tenant_name") ||
            "Restaurante"
          }
        />
      )}
    </div>
  );
}