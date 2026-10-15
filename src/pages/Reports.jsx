import React, { useState, useEffect, useMemo } from "react";
import { Order } from "@/entities/Order";
import { Category } from "@/entities/Category";
import { Product } from "@/entities/Product";
import { Settings } from "@/entities/Settings";
import { ShiftClosing } from "@/entities/ShiftClosing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  Receipt,
  Clock,
  Sparkles,
  Flame,
  Calendar,
} from "lucide-react";
import { subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay } from "date-fns";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import ShiftClosingModal from "@/components/admin/orders/ShiftClosingModal";
import DailySalesChart from "@/components/admin/reports/DailySalesChart";
import PeakHoursChart from "@/components/admin/reports/PeakHoursChart";
import ShiftClosingHistoryTable from "@/components/admin/reports/ShiftClosingHistoryTable";
import {
  aggregateDailySales,
  aggregateCategoryDistribution,
  aggregatePeakHours,
} from "@/utils/reportsAnalytics";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("sales"); // "sales" | "history"
  const [reportPeriod, setReportPeriod] = useState("last_30_days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [allOrders, setAllOrders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [closings, setClosings] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [tenantSettings, setTenantSettings] = useState(null);

  // Modal de Fechamento de Caixa do Turno
  const [shiftClosingOpen, setShiftClosingOpen] = useState(false);

  const getDateRange = () => {
    const today = new Date();
    switch (reportPeriod) {
      case "today":
        return { start: startOfDay(today), end: endOfDay(today) };
      case "last_7_days":
        return { start: subDays(today, 6), end: endOfDay(today) };
      case "last_30_days":
        return { start: subDays(today, 29), end: endOfDay(today) };
      case "this_month":
        return { start: startOfMonth(today), end: endOfMonth(today) };
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

      const [ordersList, catsList, prodsList, settingsList, closingsList] =
        await Promise.all([
          Order.list("-created_date", 500).catch(() => []),
          Category.list("order_index").catch(() => []),
          Product.list("-created_date").catch(() => []),
          Settings.list().catch(() => []),
          ShiftClosing.list("-created_at", 100).catch(() => []),
        ]);

      let driversList = [];
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data } = await supabase
            .from("tenants")
            .select("delivery_drivers")
            .eq("id", activeTenantId)
            .maybeSingle();
          if (data?.delivery_drivers) driversList = data.delivery_drivers;
        } catch {}
      }

      setAllOrders(Array.isArray(ordersList) ? ordersList : []);
      setCategories(Array.isArray(catsList) ? catsList : []);
      setProducts(Array.isArray(prodsList) ? prodsList : []);
      setTenantSettings(settingsList?.[0] || null);
      setClosings(Array.isArray(closingsList) ? closingsList : []);
      setDrivers(driversList);
    } catch (err) {
      console.error("[ReportsPage] Erro ao carregar dados:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadClosingHistory = async () => {
    try {
      const closingsList = await ShiftClosing.list("-created_at", 100).catch(() => []);
      setClosings(Array.isArray(closingsList) ? closingsList : []);
    } catch {}
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

  // 1. Agregação Diária de Vendas (Gráfico de Barras por Dia)
  const dailySalesData = useMemo(
    () => aggregateDailySales(periodOrders, dateRange.start, dateRange.end),
    [periodOrders, dateRange]
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

  return (
    <div className="p-4 sm:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
              <span>Relatórios & Gestão</span>
              <span className="text-xs bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-lg">
                Inteligência
              </span>
            </h1>
            <p className="text-gray-600 text-xs sm:text-sm mt-1">
              Acompanhe o faturamento diário, horários de pico e histórico de fechamento de caixa
            </p>
          </div>

          <Button
            type="button"
            onClick={() => setShiftClosingOpen(true)}
            className="h-10 px-4 bg-gradient-to-r from-stone-900 to-stone-800 hover:from-black hover:to-stone-900 text-white rounded-2xl text-xs font-black shadow-md flex items-center gap-2 cursor-pointer border border-stone-700 self-start sm:self-auto transition-all active:scale-95"
            title="Abrir Fechamento de Caixa do Turno"
          >
            <Receipt className="w-4 h-4 text-amber-400" />
            <span>Fechamento de Caixa</span>
          </Button>
        </div>

        {/* Abas Principais: Vendas vs Histórico de Fechamentos */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-200/80 rounded-2xl w-fit border border-stone-300">
          <button
            type="button"
            onClick={() => setActiveTab("sales")}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "sales"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <TrendingUp className="w-4 h-4 text-[#047857]" />
            <span>📊 Vendas & Análise</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "history"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <Receipt className="w-4 h-4 text-amber-600" />
            <span>🧾 Histórico de Fechamentos</span>
            {closings.length > 0 && (
              <Badge className="bg-stone-100 text-stone-700 text-[10px] px-1.5 py-0">
                {closings.length}
              </Badge>
            )}
          </button>
        </div>

        {/* ================= ABA 1: VENDAS & ANÁLISE ================= */}
        {activeTab === "sales" && (
          <div className="space-y-6">
            {/* Filtro de Período */}
            <Card className="border-stone-200 shadow-sm bg-white">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="period" className="text-xs font-bold text-stone-700">
                      Período de Análise
                    </Label>
                    <Select value={reportPeriod} onValueChange={setReportPeriod}>
                      <SelectTrigger className="border-stone-200 focus:border-[#047857] rounded-xl mt-1 text-xs font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="today">Hoje</SelectItem>
                        <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
                        <SelectItem value="last_30_days">Últimos 30 dias</SelectItem>
                        <SelectItem value="this_month">Este mês</SelectItem>
                        <SelectItem value="this_year">Este ano</SelectItem>
                        <SelectItem value="custom">Período personalizado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {reportPeriod === "custom" && (
                    <>
                      <div>
                        <Label htmlFor="start-date" className="text-xs font-bold text-stone-700">
                          Data inicial
                        </Label>
                        <Input
                          id="start-date"
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="border-stone-200 focus:border-[#047857] rounded-xl mt-1 text-xs"
                        />
                      </div>
                      <div>
                        <Label htmlFor="end-date" className="text-xs font-bold text-stone-700">
                          Data final
                        </Label>
                        <Input
                          id="end-date"
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="border-stone-200 focus:border-[#047857] rounded-xl mt-1 text-xs"
                        />
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 4 KPIs Principais */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-0 shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Receita Total
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-black text-gray-900">
                    {formatMoney(totalRevenue)}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Total de Pedidos
                  </CardTitle>
                  <ShoppingBag className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-black text-gray-900">
                    {totalOrdersCount}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Ticket Médio
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-black text-gray-900">
                    {formatMoney(avgTicket)}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Produtos Vendidos
                  </CardTitle>
                  <Package className="h-4 w-4 text-amber-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-black text-gray-900">
                    {totalProductsSold} un.
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Cancelamentos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="border-0 shadow-sm bg-rose-50/50 border-rose-100">
                <CardHeader className="flex flex-row items-center justify-between pb-1">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-rose-700">
                    Pedidos Cancelados
                  </CardTitle>
                  <X className="h-4 w-4 text-rose-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-black text-rose-700">
                    {canceledOrdersCount}
                  </div>
                  <p className="text-[11px] text-rose-500 mt-0.5">
                    {totalOrdersCount + canceledOrdersCount > 0
                      ? `${(((canceledOrdersCount) / (totalOrdersCount + canceledOrdersCount)) * 100).toFixed(1)}% do volume total`
                      : "0% do total"}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-rose-50/50 border-rose-100">
                <CardHeader className="flex flex-row items-center justify-between pb-1">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-rose-700">
                    Receita Perdida
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-rose-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-black text-rose-700">
                    {formatMoney(lostRevenue)}
                  </div>
                  <p className="text-[11px] text-rose-500 mt-0.5">Devido a cancelamentos</p>
                </CardContent>
              </Card>
            </div>

            {/* 1. GRÁFICO DE BARRAS: VENDAS DIA A DIA (SEM CATEGORIA) */}
            <Card className="border-0 shadow-md bg-white overflow-hidden">
              <CardHeader className="bg-stone-50 border-b border-stone-100 pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-black text-gray-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-rose-600" />
                    <span>Evolução Diária de Vendas (Faturamento dos Dias)</span>
                  </CardTitle>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Faturamento cronológico apurado dia a dia no período selecionado
                  </p>
                </div>
                <Badge variant="outline" className="text-xs font-bold bg-white text-stone-700">
                  {dailySalesData.filter((d) => d.revenue > 0).length} dias com vendas
                </Badge>
              </CardHeader>
              <CardContent className="pt-4">
                <DailySalesChart data={dailySalesData} />
              </CardContent>
            </Card>

            {/* 2. GRID: DONUT DE CATEGORIAS + HORÁRIOS DE PICO */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Gráfico Redondo: Distribuição por Categoria (Com Snapshot Histórico) */}
              <Card className="border-0 shadow-md bg-white">
                <CardHeader className="border-b border-stone-100 pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-black text-gray-900 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-rose-600" />
                      <span>Distribuição por Categoria</span>
                    </CardTitle>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Preserva nomes originais das categorias mesmo se forem excluídas
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-bold bg-stone-50">
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
                              borderRadius: "14px",
                              border: "none",
                              boxShadow: "0 6px 25px rgba(0,0,0,0.12)",
                              fontWeight: "bold",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Gráfico de Horários de Pico */}
              <Card className="border-0 shadow-md bg-white">
                <CardHeader className="border-b border-stone-100 pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-black text-gray-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" />
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
            </div>

            {/* 3. Tabela Detalhada por Categoria */}
            {categoryMetrics.length > 0 && (
              <Card className="border-0 shadow-md overflow-hidden bg-white">
                <CardHeader className="bg-stone-50 border-b border-stone-100 pb-3">
                  <CardTitle className="text-sm font-bold text-stone-900">
                    Detalhamento por Categoria (Snapshot Histórico Preservado)
                  </CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-stone-100/70 text-stone-600 uppercase text-[11px] font-bold border-b border-stone-200">
                      <tr>
                        <th className="py-3 px-4">Categoria</th>
                        <th className="py-3 px-4 text-center">Itens Vendidos</th>
                        <th className="py-3 px-4 text-right">Faturamento Total</th>
                        <th className="py-3 px-4 text-right">% do Faturamento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 bg-white font-medium">
                      {categoryMetrics.map((cat, idx) => (
                        <tr key={idx} className="hover:bg-stone-50 transition-colors">
                          <td className="py-3 px-4 flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                            />
                            <span className="font-bold text-stone-900">{cat.name}</span>
                          </td>
                          <td className="py-3 px-4 text-center font-semibold text-stone-700">
                            {cat.items} un.
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-stone-900">
                            {formatMoney(cat.revenue)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-rose-600">
                            {cat.percentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ================= ABA 2: HISTÓRICO DE FECHAMENTOS ================= */}
        {activeTab === "history" && (
          <ShiftClosingHistoryTable
            closings={closings}
            isLoading={isLoading}
            storeName={
              tenantSettings?.restaurant_name ||
              localStorage.getItem("current_tenant_name") ||
              "Restaurante"
            }
          />
        )}
      </div>

      {/* Modal Interativo de Fechamento de Caixa */}
      <ShiftClosingModal
        isOpen={shiftClosingOpen}
        onClose={() => setShiftClosingOpen(false)}
        orders={allOrders}
        drivers={drivers}
        tenantSettings={tenantSettings}
        storeName={
          tenantSettings?.restaurant_name ||
          localStorage.getItem("current_tenant_name") ||
          "Restaurante"
        }
        onClosingSaved={() => loadClosingHistory()}
      />
    </div>
  );
}