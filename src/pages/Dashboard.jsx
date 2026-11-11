import React, { useState, useEffect, useRef } from "react";
import { Order } from "@/entities/Order";
import { Product } from "@/entities/Product";
import { Category } from "@/entities/Category";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, ShoppingBag, Package, TrendingUp, UtensilsCrossed, ArrowUpRight } from "lucide-react";
import { format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getActiveTenantId } from "@/entities/storage";

export default function DashboardPage() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [serverTodayStats, setServerTodayStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ordersData, productsData, categoriesData] = await Promise.all([
        Order.list("-created_date", 100),
        Product.list(),
        Category.list()
      ]);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);

      // Métricas exatas agregadas no servidor para evitar truncamento em lojas de alto volume
      const activeTenantId = getActiveTenantId();
      if (activeTenantId && isSupabaseConfigured() && supabase) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const { data: metrics } = await Promise.resolve(
          supabase.rpc("get_sales_metrics", {
            p_tenant_id: activeTenantId,
            p_start_date: startOfToday.toISOString(),
            p_end_date: new Date().toISOString(),
          })
        ).catch(() => ({ data: null }));
        if (metrics) setServerTodayStats(metrics);
      }
    } catch (err) {
      console.error("Erro ao carregar dados do dashboard:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const safeDate = (dateVal) => {
    if (!dateVal) return null;
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  };

  const todayOrders = (orders || []).filter(order => {
    const d = safeDate(order?.created_date);
    return d ? isToday(d) : false;
  });

  const localTodayRevenue = todayOrders.reduce((sum, order) => {
    if (order.status === "cancelado") return sum;
    const val = Number(order?.total_amount || order?.total || 0);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const todayRevenue = serverTodayStats ? Number(serverTodayStats.total_revenue || 0) : localTodayRevenue;
  const todayCountDisplay = serverTodayStats ? Number(serverTodayStats.total_orders || 0) : todayOrders.length;

  const pendingOrders = (orders || []).filter(order => order?.status === "pendente").length;

  const getStatusBadge = (status) => {
    const map = {
      pendente: { label: "Pendente", className: "bg-amber-50 text-amber-800 border-amber-300" },
      confirmado: { label: "Confirmado", className: "bg-blue-50 text-blue-800 border-blue-300" },
      preparando: { label: "Preparando", className: "bg-purple-50 text-purple-800 border-purple-300" },
      enviado: { label: "Enviado", className: "bg-indigo-50 text-indigo-800 border-indigo-300" },
      entregue: { label: "Entregue", className: "bg-emerald-50 text-emerald-800 border-emerald-300" },
      cancelado: { label: "Cancelado", className: "bg-rose-50 text-rose-800 border-rose-300" }
    };
    const s = map[status] || { label: status, className: "bg-stone-100 text-stone-700 border-stone-200" };
    return (
      <Badge variant="outline" className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${s.className}`}>
        {s.label}
      </Badge>
    );
  };
  
  const getCategoryNameById = (categoryId) => {
    return categories.find(c => c.id === categoryId)?.name || 'Sem Categoria';
  };

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F7F9F8]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#047857] mx-auto"></div>
          <p className="text-stone-600 font-semibold text-sm">Carregando painel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-[#F7F9F8] min-h-screen space-y-6 max-w-7xl mx-auto">
      {/* Audio de notificação */}
      <audio ref={audioRef} preload="auto">
        <source src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" type="audio/mpeg" />
      </audio>
      
      {/* Cabeçalho Executivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            Visão Geral (Dashboard)
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Métricas de vendas, fila de pedidos e produtos com maior saída
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-white text-stone-600 border-stone-300 text-xs font-medium px-3 py-1 rounded-md">
            Hoje • {format(new Date(), "dd 'de' MMMM", { locale: ptBR })}
          </Badge>
          <Link
            to={createPageUrl("Orders")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-900 hover:bg-black text-white transition-colors shadow-2xs"
          >
            <span>Ver Pedidos</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Grid Superior: 4 Cards de Métricas Principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Faturamento do Dia */}
        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
              Vendas de Hoje
            </span>
            <DollarSign className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
            {formatMoney(todayRevenue)}
          </p>
          <span className="text-[11px] text-stone-500 mt-0.5 block">
            {todayCountDisplay} {todayCountDisplay === 1 ? "pedido hoje" : "pedidos hoje"}
          </span>
        </Card>

        {/* Card 2: Pedidos Pendentes */}
        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
              Pendentes
            </span>
            <ShoppingBag className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
            {pendingOrders}
          </p>
          <span className="text-[11px] text-stone-500 mt-0.5 block">
            {pendingOrders === 0 ? "Fila em dia" : "Aguardando confirmação"}
          </span>
        </Card>

        {/* Card 3: Total de Pedidos */}
        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
              Total de Pedidos
            </span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
            {orders.length}
          </p>
          <span className="text-[11px] text-stone-500 mt-0.5 block">
            Histórico registrado
          </span>
        </Card>

        {/* Card 4: Produtos Ativos */}
        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
              Cardápio Ativo
            </span>
            <Package className="w-4 h-4 text-stone-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
            {products.filter(p => p.available !== false).length}
          </p>
          <span className="text-[11px] text-stone-500 mt-0.5 block">
            de {products.length} itens cadastrados
          </span>
        </Card>
      </div>

      {/* Grid Principal: Pedidos Recentes (Esquerda) vs Produtos Mais Vendidos (Direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Card: Pedidos Recentes */}
        <Card className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
          <CardHeader className="p-4 pb-3 border-b border-stone-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-stone-900">
                Pedidos Recentes
              </CardTitle>
              <p className="text-xs text-stone-500 mt-0.5">
                Últimos pedidos recebidos na operação
              </p>
            </div>
            <Link
              to={createPageUrl("Orders")}
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 hover:underline"
            >
              Ver todos →
            </Link>
          </CardHeader>

          <CardContent className="p-0">
            {orders.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs">
                Nenhum pedido registrado no sistema
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {orders.slice(0, 8).map((order) => {
                  const d = safeDate(order?.created_date);
                  const amount = Number(order?.total_amount || order?.total || 0);

                  return (
                    <div
                      key={order.id}
                      className="p-3.5 sm:px-4 flex items-center justify-between hover:bg-stone-50/60 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-stone-900">
                            #{order.id?.slice(-4) || order.id} • {order.customer_name || "Cliente Balcão"}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-400 font-mono">
                          {d ? format(d, "dd/MM 'às' HH:mm", { locale: ptBR }) : "-"}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold font-mono text-stone-900">
                          {formatMoney(amount)}
                        </span>
                        {getStatusBadge(order.status)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card: Produtos Mais Vendidos */}
        <Card className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
          <CardHeader className="p-4 pb-3 border-b border-stone-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-stone-900">
                Produtos Mais Vendidos
              </CardTitle>
              <p className="text-xs text-stone-500 mt-0.5">
                Curva de saída calculada a partir dos pedidos concluídos
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] font-semibold text-stone-600 bg-stone-50 border-stone-200">
              Ranking
            </Badge>
          </CardHeader>

          <CardContent className="p-0">
            {products.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs">
                Nenhum produto cadastrado
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {(() => {
                  const ranked = [...products]
                    .map((product) => {
                      let salesCount = 0;
                      (orders || []).forEach((order) => {
                        if (order.status !== "cancelado" && Array.isArray(order.items)) {
                          order.items.forEach((item) => {
                            if (
                              item.product_id === product.id ||
                              item.id === product.id ||
                              (item.name && item.name.toLowerCase().trim() === product.name.toLowerCase().trim())
                            ) {
                              salesCount += Number(item.quantity) || 1;
                            }
                          });
                        }
                      });
                      return { ...product, salesCount };
                    })
                    .sort((a, b) => b.salesCount - a.salesCount || (b.popular ? 1 : 0) - (a.popular ? 1 : 0))
                    .slice(0, 8);

                  return ranked.map((product, idx) => {
                    const price = Number(product.price || 0);

                    return (
                      <div
                        key={product.id}
                        className="p-3 sm:px-4 flex items-center justify-between hover:bg-stone-50/60 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center overflow-hidden border border-stone-200 shrink-0">
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                              <UtensilsCrossed className="w-4 h-4 text-stone-400" />
                            )}
                            <span className="absolute top-0.5 left-0.5 bg-black/75 text-[9px] text-white font-bold px-1 rounded">
                              #{idx + 1}
                            </span>
                          </div>

                          <div className="truncate">
                            <p className="font-semibold text-stone-900 text-xs truncate">
                              {product.name}
                            </p>
                            <p className="text-[11px] text-stone-500 capitalize truncate">
                              {getCategoryNameById(product.category || product.category_id)}
                              {product.salesCount > 0 && (
                                <span className="ml-1.5 font-semibold text-emerald-700">
                                  • {product.salesCount} {product.salesCount === 1 ? "vendido" : "vendidos"}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <span className="font-mono font-bold text-xs text-stone-900 shrink-0 pl-3">
                          {formatMoney(price)}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
