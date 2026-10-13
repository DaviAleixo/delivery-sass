import React, { useState, useEffect } from "react";
import { Order } from "@/entities/Order";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, ShoppingBag, Package, TrendingUp, X } from "lucide-react";
import { subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay } from "date-fns";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";
import ShiftClosingModal from "@/components/admin/orders/ShiftClosingModal";
import { calculateShiftClosing } from "@/utils/shiftClosingCalculator";
import { Settings } from "@/entities/Settings";

export default function ReportsPage() {
  const [metrics, setMetrics] = useState({
    total_revenue: 0,
    total_orders: 0,
    cancelled_orders: 0,
    lost_revenue: 0,
    total_products_sold: 0,
    category_metrics: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [reportPeriod, setReportPeriod] = useState("last_30_days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Estado para Fechamento de Turno
  const [shiftClosingOpen, setShiftClosingOpen] = useState(false);
  const [shiftClosingData, setShiftClosingData] = useState(null);
  const [tenantSettings, setTenantSettings] = useState(null);

  const getDateRange = () => {
    const today = new Date();
    switch (reportPeriod) {
      case "today": return { start: startOfDay(today), end: endOfDay(today) };
      case "last_7_days": return { start: subDays(today, 6), end: today };
      case "last_30_days": return { start: subDays(today, 29), end: today };
      case "this_month": return { start: startOfMonth(today), end: endOfMonth(today) };
      case "this_year": return { start: startOfYear(today), end: endOfYear(today) };
      case "custom": return {
          start: customStartDate ? new Date(customStartDate) : subDays(today, 29),
          end: customEndDate ? new Date(customEndDate) : today,
      };
      default: return { start: subDays(today, 29), end: today };
    }
  };

  useEffect(() => {
    loadData();
    loadClosingDependencies();
  }, [reportPeriod, customStartDate, customEndDate]);

  const loadClosingDependencies = async () => {
    try {
      const [allOrders, settingsList] = await Promise.all([
        Order.list("-created_date", 200).catch(() => []),
        Settings.list().catch(() => []),
      ]);
      const activeTenantId = localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
      let drivers = [];
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data } = await supabase
            .from("tenants")
            .select("delivery_drivers")
            .eq("id", activeTenantId)
            .maybeSingle();
          if (data?.delivery_drivers) drivers = data.delivery_drivers;
        } catch {}
      }

      setTenantSettings(settingsList?.[0] || null);
      const calculated = calculateShiftClosing({
        orders: Array.isArray(allOrders) ? allOrders : [],
        drivers,
        tenantSettings: settingsList?.[0] || null,
      });
      setShiftClosingData(calculated);
    } catch {}
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
        const { start, end } = getDateRange();
        const startIso = start.toISOString();
        const endIso = end.toISOString();

        if (isSupabaseConfigured() && supabase) {
          const { data, error } = await supabase.rpc("get_sales_metrics", {
            p_start: startIso,
            p_end: endIso
          });

          if (!error && data) {
            setMetrics({
              total_revenue: Number(data.total_revenue || 0),
              total_orders: Number(data.total_orders || 0),
              cancelled_orders: Number(data.cancelled_orders || 0),
              lost_revenue: Number(data.lost_revenue || 0),
              total_products_sold: Number(data.total_products_sold || 0),
              category_metrics: Array.isArray(data.category_metrics) ? data.category_metrics : []
            });
            setIsLoading(false);
            return;
          }
        }

        // Fallback local caso Supabase RPC não esteja acessível
        const ordersData = await Order.list("-created_date", 50);
        const normalizedEnd = endOfDay(end);
        const filtered = ordersData.filter(order => {
          const d = new Date(order.created_date);
          return d >= start && d <= normalizedEnd && order.status !== 'cancelado';
        });
        const cancelled = ordersData.filter(order => {
          const d = new Date(order.created_date);
          return d >= start && d <= normalizedEnd && order.status === 'cancelado';
        });

        const rev = filtered.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        const lost = cancelled.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        const itemsCount = filtered.reduce((sum, o) => sum + (o.items?.reduce((isum, i) => isum + Number(i.quantity || 1), 0) || 0), 0);

        setMetrics({
          total_revenue: rev,
          total_orders: filtered.length,
          cancelled_orders: cancelled.length,
          lost_revenue: lost,
          total_products_sold: itemsCount,
          category_metrics: []
        });
    } catch (error) {
        console.error("Error loading sales metrics:", error);
    } finally {
        setIsLoading(false);
    }
  };

  const COLORS = ['#dc2626', '#ea580c', '#d97706', '#ca8a04', '#65a30d'];

  const totalRevenue = metrics.total_revenue;
  const totalOrders = metrics.total_orders;
  const totalProductsSold = metrics.total_products_sold;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalCancelled = metrics.cancelled_orders;
  const lostRevenue = metrics.lost_revenue;
  const categoryMetrics = metrics.category_metrics;

  if (isLoading) return <div className="p-8">Carregando relatórios...</div>

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Relatórios de Vendas</h1>
            <p className="text-gray-600 mt-2">Analise o desempenho do seu negócio</p>
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
        
        <Card className="mb-8 border-red-200">
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="period">Período de Análise</Label>
                <Select value={reportPeriod} onValueChange={setReportPeriod}>
                  <SelectTrigger className="border-red-200 focus:border-red-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
                    <Label htmlFor="start-date">Data inicial</Label>
                    <Input id="start-date" type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="border-red-200 focus:border-red-600"/>
                  </div>
                  <div>
                    <Label htmlFor="end-date">Data final</Label>
                    <Input id="end-date" type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="border-red-200 focus:border-red-600"/>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="border-0 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Receita Total</CardTitle>
                <DollarSign className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">R$ {totalRevenue.toFixed(2).replace('.', ',')}</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total de Pedidos</CardTitle>
                <ShoppingBag className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{totalOrders}</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Ticket Médio</CardTitle>
                <TrendingUp className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">R$ {avgTicket.toFixed(2).replace('.', ',')}</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Produtos Vendidos</CardTitle>
                <Package className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{totalProductsSold}</div>
              </CardContent>
            </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card className="border-0 shadow-md border-red-100">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Pedidos Cancelados</CardTitle>
                <X className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{totalCancelled}</div>
                <p className="text-xs text-gray-500 mt-1">
                  {totalOrders + totalCancelled > 0 
                    ? `${((totalCancelled / (totalOrders + totalCancelled)) * 100).toFixed(1)}% do total` 
                    : '0% do total'}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md border-red-100">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Receita Perdida</CardTitle>
                <DollarSign className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">R$ {lostRevenue.toFixed(2).replace('.', ',')}</div>
                <p className="text-xs text-gray-500 mt-1">Devido a cancelamentos</p>
              </CardContent>
            </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
            <Card className="border-0 shadow-md">
                <CardHeader className="border-b border-stone-100 pb-3">
                  <CardTitle className="text-base font-bold text-gray-900">Vendas por Categoria</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {categoryMetrics.length === 0 ? (
                    <div className="h-[300px] flex flex-col items-center justify-center text-stone-400 gap-2">
                      <Package className="w-10 h-10 stroke-1 text-stone-300" />
                      <p className="text-sm font-medium">Nenhuma venda por categoria no período selecionado</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={categoryMetrics} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} interval={0} angle={-15} textAnchor="end" />
                            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `R$${val}`} />
                            <Tooltip 
                              formatter={(value) => [`R$ ${Number(value).toFixed(2).replace('.', ',')}`, 'Receita']}
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                            />
                            <Bar dataKey="revenue" fill="#dc2626" radius={[6, 6, 0, 0]} name="Receita" />
                        </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
            </Card>

            <Card className="border-0 shadow-md">
                <CardHeader className="border-b border-stone-100 pb-3">
                  <CardTitle className="text-base font-bold text-gray-900">Distribuição de Receita</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {categoryMetrics.length === 0 ? (
                    <div className="h-[300px] flex flex-col items-center justify-center text-stone-400 gap-2">
                      <TrendingUp className="w-10 h-10 stroke-1 text-stone-300" />
                      <p className="text-sm font-medium">Sem dados de distribuição para este período</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={categoryMetrics}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={105}
                                innerRadius={45}
                                paddingAngle={3}
                                dataKey="revenue"
                            >
                                {categoryMetrics.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value) => [`R$ ${Number(value).toFixed(2).replace('.', ',')}`, 'Receita']}
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
            </Card>
        </div>

        {/* Tabela detalhada de categorias */}
        {categoryMetrics.length > 0 && (
          <Card className="border-0 shadow-md overflow-hidden mb-8">
            <CardHeader className="bg-stone-50 border-b border-stone-100 pb-3">
              <CardTitle className="text-sm font-bold text-stone-900">Detalhamento por Categoria</CardTitle>
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
                  {categoryMetrics.map((cat, idx) => {
                    const pct = totalRevenue > 0 ? ((cat.revenue / totalRevenue) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={idx} className="hover:bg-stone-50 transition-colors">
                        <td className="py-3 px-4 flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="font-bold text-stone-900">{cat.name}</span>
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-stone-700">{cat.items} un.</td>
                        <td className="py-3 px-4 text-right font-bold text-stone-900">R$ {Number(cat.revenue).toFixed(2).replace('.', ',')}</td>
                        <td className="py-3 px-4 text-right font-bold text-red-600">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

      </div>

      <ShiftClosingModal
        isOpen={shiftClosingOpen}
        onClose={() => setShiftClosingOpen(false)}
        closingData={shiftClosingData}
        storeName={tenantSettings?.restaurant_name || localStorage.getItem("current_tenant_name") || "Vruum Burguer"}
      />
    </div>
  );
}