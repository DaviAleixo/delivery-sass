import React, { useState, useEffect, useRef } from "react";
import { Order } from "@/entities/Order";
import { Product } from "@/entities/Product";
import { Category } from "@/entities/Category";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, ShoppingBag, Package, TrendingUp } from "lucide-react";
import { format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function DashboardPage() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const playNotificationSound = () => {
    try {
      if (audioRef.current) {
        audioRef.current.volume = 1.0;
        audioRef.current.play().catch(_err => {});
      }
    } catch (_e) {}
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ordersData, productsData, categoriesData] = await Promise.all([
        Order.list("-created_date", 50),
        Product.list(),
        Category.list()
      ]);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
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

  const todayRevenue = todayOrders.reduce((sum, order) => {
    const val = Number(order?.total_amount || order?.total || 0);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const pendingOrders = (orders || []).filter(order => order?.status === "pendente").length;

  const getStatusColor = (status) => {
    const colors = {
      pendente: "bg-yellow-100 text-yellow-800",
      confirmado: "bg-blue-100 text-blue-800",
      preparando: "bg-purple-100 text-purple-800",
      enviado: "bg-indigo-100 text-indigo-800",
      entregue: "bg-green-100 text-green-800",
      cancelado: "bg-red-100 text-red-800"
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getStatusText = (status) => {
    const texts = {
      pendente: "Pendente",
      confirmado: "Confirmado",
      preparando: "Preparando",
      enviado: "Enviado",
      entregue: "Entregue",
      cancelado: "Cancelado"
    };
    return texts[status] || status;
  };
  
  const getCategoryNameById = (categoryId) => {
    return categories.find(c => c.id === categoryId)?.name || 'Sem Categoria';
  };

  if (isLoading) {
    return (
      <div className="p-8 bg-[#F7F9F8] min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#047857] mx-auto mb-4"></div>
          <p className="text-stone-600">Carregando painel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[#F7F9F8] min-h-screen">
      {/* Audio de notificação - oculto */}
      <audio ref={audioRef} preload="auto">
        <source src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" type="audio/mpeg" />
      </audio>
      
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Acompanhe suas vendas e pedidos em tempo real
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Vendas Hoje
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                R$ {todayRevenue.toFixed(2).replace('.', ',')}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {todayOrders.length} pedidos hoje
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Pedidos Pendentes
              </CardTitle>
              <ShoppingBag className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {pendingOrders}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Aguardando confirmação
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total de Produtos
              </CardTitle>
              <Package className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {products.length}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {products.filter(p => p.available).length} disponíveis
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total de Pedidos
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {orders.length}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Todos os pedidos
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle>Pedidos Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {orders.slice(0, 10).map((order) => {
                  const d = safeDate(order?.created_date);
                  const amount = Number(order?.total_amount || order?.total || 0);
                  return (
                    <div key={order.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">
                          {order.customer_name || "Cliente"}
                        </p>
                        <p className="text-sm text-gray-600">
                          {d ? format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "-"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">
                          R$ {amount.toFixed(2).replace('.', ',')}
                        </p>
                        <Badge className={getStatusColor(order.status)}>
                          {getStatusText(order.status)}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
                {orders.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    Nenhum pedido encontrado
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Produtos Mais Vendidos</CardTitle>
              <Badge variant="outline" className="text-xs bg-[#D1E9DF]/40 text-[#047857] border-[#D1E9DF] font-bold">
                Top Vendas
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(() => {
                  const ranked = [...products]
                    .map(product => {
                      let salesCount = 0;
                      (orders || []).forEach(order => {
                        if (order.status !== 'cancelado' && Array.isArray(order.items)) {
                          order.items.forEach(item => {
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
                      <div key={product.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-stone-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="relative w-11 h-11 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden border border-gray-200 flex-shrink-0">
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                              <span>🍽️</span>
                            )}
                            <span className="absolute top-0.5 left-0.5 bg-black/75 text-[10px] text-white font-black px-1 rounded">
                              #{idx + 1}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{product.name}</p>
                            <p className="text-xs text-gray-500 capitalize">
                              {getCategoryNameById(product.category || product.category_id)}
                              {product.salesCount > 0 && (
                                <span className="ml-2 font-bold text-[#047857]">• {product.salesCount} vendidos</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <p className="font-extrabold text-gray-900 text-sm">
                          R$ {price.toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                    );
                  });
                })()}
                {products.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    Nenhum produto cadastrado
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}