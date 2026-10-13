import React, { useState, useEffect } from "react";
import { Order } from "@/entities/Order";
import { Settings } from "@/entities/Settings";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { 
  ArrowLeft, Clock, Sparkles, Truck, Store, 
  Search, CheckCircle2, Bike, PackageCheck, RefreshCw,
  MessageCircle, UtensilsCrossed, ShieldCheck
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import OrderCountdownTimer from "@/components/admin/OrderCountdownTimer";

// --- Utilitários de Segurança e Formatação Resiliente ---
function safeFormatCurrency(val) {
  const num = Number(val);
  return isNaN(num) ? "0,00" : num.toFixed(2).replace(".", ",");
}

function safeFormatDate(val, pattern = "dd 'de' MMMM 'às' HH:mm") {
  if (!val) return "";
  try {
    const str = String(val).trim();
    const isoStr = str.includes(" ") && !str.includes("T") ? str.replace(" ", "T") : str;
    const parsed = new Date(isoStr);
    if (isNaN(parsed.getTime())) return "";
    return format(parsed, pattern, { locale: ptBR });
  } catch {
    return "";
  }
}

function safeGetItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === "string") {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function safeOrderId(id) {
  if (!id) return "000000";
  return String(id).slice(-6).toUpperCase();
}

const getOrderSteps = (orderType) => [
  { status: "pendente", label: "Recebido", icon: Clock },
  { status: "confirmado", label: "Confirmado", icon: CheckCircle2 },
  { 
    status: "enviado", 
    label: orderType === 'delivery' ? "A Caminho" : (orderType === 'dine_in' ? "Servindo" : "Pronto"), 
    icon: orderType === 'delivery' ? Bike : Store 
  },
  { status: "entregue", label: "Entregue", icon: PackageCheck },
];

function getStepIndex(status) {
  switch (status) {
    case "pendente": return 0;
    case "confirmado":
    case "preparando": return 1;
    case "enviado": return 2;
    case "entregue": return 3;
    default: return -1;
  }
}

export default function MyOrdersPage() {
  const [searchParams] = useSearchParams();
  const highlightOrderId = searchParams.get("id");
  const { tenant } = useTenant();

  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [isSearchingPhone, setIsSearchingPhone] = useState(false);

  const requestNotificationPermission = async () => {
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch {}
  };

  useEffect(() => {
    loadOrders();
    requestNotificationPermission();

    // Polling inteligente e seguro a cada 15s enquanto a aba estiver visível
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        loadOrders(false);
      }
    }, 15000);

    return () => {
      clearInterval(interval);
    };
  }, [highlightOrderId]);

  const loadOrders = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      let loggedUser = null;
      try {
        loggedUser = await base44.auth.me();
        setUser(loggedUser);
      } catch {}

      // Coletar IDs de pedidos salvos localmente
      const localIds = JSON.parse(localStorage.getItem("vrumburguer_recent_orders") || "[]");
      const savedPhone = localStorage.getItem("vrumburguer_customer_phone") || "";
      if (savedPhone && !phoneSearch) setPhoneSearch(savedPhone);

      // Buscar todos os pedidos e configurações
      const [allOrders, settingsData] = await Promise.all([
        Order.list("-created_date"),
        Settings.list()
      ]);

      if (settingsData && settingsData.length > 0) {
        setSettings(settingsData[0]);
      }

      let filtered = [];
      if (highlightOrderId) {
        // Pedido específico vindo da URL
        const found = (allOrders || []).filter(o => o.id === highlightOrderId);
        if (found.length > 0) {
          filtered = found;
        } else {
          // Busca direta do pedido pelo ID se não veio na listagem geral
          try {
            const direct = await Order.get(highlightOrderId);
            if (direct) {
              filtered = [direct];
            }
          } catch {}
        }
      }

      // Se logado, inclui os do email
      if (loggedUser?.email) {
        const userOrders = (allOrders || []).filter(o => o.user_email === loggedUser.email);
        filtered = [...filtered, ...userOrders];
      }

      // Inclui os pedidos salvos no navegador (Guest Checkout)
      if (localIds.length > 0) {
        const guestOrders = (allOrders || []).filter(o => localIds.includes(o.id));
        filtered = [...filtered, ...guestOrders];
      }

      // Inclui todos os pedidos vinculados ao telefone do cliente (salvos permanentemente)
      if (savedPhone) {
        const phoneClean = savedPhone.replace(/\D/g, "");
        if (phoneClean.length >= 8) {
          const phoneOrders = (allOrders || []).filter(o => {
            const op = (o.customer_phone || "").replace(/\D/g, "");
            return op === phoneClean || (op.length >= 8 && op.endsWith(phoneClean.slice(-8)));
          });
          filtered = [...filtered, ...phoneOrders];
        }
      }

      // Remover duplicatas e ordenar por mais recente
      const unique = Array.from(new Map(filtered.map(item => [item.id, item])).values())
        .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
      setOrders(unique);
    } catch (error) {
      console.error("Erro ao carregar pedidos:", error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  const handleSearchByPhone = async (e) => {
    e.preventDefault();
    if (!phoneSearch.trim()) return;
    setIsSearchingPhone(true);

    try {
      const cleanInput = phoneSearch.replace(/\D/g, "");
      localStorage.setItem("vrumburguer_customer_phone", phoneSearch);

      const allOrders = await Order.list("-created_date");
      const matches = (allOrders || []).filter(o => {
        const orderPhoneClean = (o.customer_phone || "").replace(/\D/g, "");
        return orderPhoneClean.includes(cleanInput) || cleanInput.includes(orderPhoneClean);
      });

      setOrders(matches);
    } catch (err) {
      console.error("Erro ao buscar por telefone:", err);
    } finally {
      setIsSearchingPhone(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pendente: "bg-amber-100 text-amber-800 border-amber-300",
      confirmado: "bg-blue-100 text-blue-800 border-blue-300",
      preparando: "bg-blue-100 text-blue-800 border-blue-300",
      enviado: "bg-indigo-100 text-indigo-800 border-indigo-300",
      entregue: "bg-emerald-100 text-emerald-800 border-emerald-300",
      cancelado: "bg-red-100 text-red-800 border-red-300"
    };
    return colors[status] || "bg-gray-100 text-gray-800 border-gray-300";
  };

  const getStatusText = (status, order = null) => {
    if (status === "preparando" || status === "confirmado") {
      return "Confirmado";
    }
    if (status === "enviado") {
      if (order?.order_type === "delivery") return "A Caminho";
      if (order?.order_type === "dine_in" || order?.table_number?.toLowerCase().includes("mesa")) return "Sendo Servido";
      return "Pronto p/ Retirada";
    }
    const texts = {
      pendente: "Recebido",
      confirmado: "Confirmado",
      entregue: "Entregue",
      cancelado: "Cancelado"
    };
    return texts[status] || status;
  };

  const activeOrders = orders.filter(o => ['pendente', 'confirmado', 'preparando', 'enviado'].includes(o.status));
  const completedOrders = orders.filter(o => ['entregue', 'cancelado'].includes(o.status));

  // Dados do restaurante para suporte WhatsApp
  const restaurantWhatsApp = tenant?.whatsapp || tenant?.phone || settings?.whatsapp || settings?.phone || "";
  const cleanStorePhone = restaurantWhatsApp.replace(/\D/g, "");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-stone-700 font-medium">Carregando status do pedido...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-20 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 py-4 max-w-4xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to={createPageUrl("Menu")}>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-stone-100">
                  <ArrowLeft className="w-5 h-5 text-stone-700" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-stone-900 leading-tight">Acompanhar Pedidos</h1>
                <p className="text-xs sm:text-sm text-stone-500">Rastreamento em tempo real da cozinha à sua porta</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => loadOrders(true)} className="gap-1.5 text-xs">
              <RefreshCw className="w-3.5 h-3.5" />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
        {/* Banner informativo de Guest Checkout */}
        {!user && (
          <Card className="border-amber-200 bg-amber-50/80 shadow-none">
            <CardContent className="p-4">
              <form onSubmit={handleSearchByPhone} className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="flex items-start gap-2.5">
                  <Search className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-950">Consultar por WhatsApp / Telefone</p>
                    <p className="text-xs text-amber-800">Comprou sem login? Digite seu número para resgatar seus pedidos.</p>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Input
                    placeholder="(11) 99999-9999"
                    value={phoneSearch}
                    onChange={(e) => setPhoneSearch(e.target.value)}
                    className="bg-white max-w-xs h-9 text-sm"
                  />
                  <Button type="submit" size="sm" disabled={isSearchingPhone} className="bg-red-600 hover:bg-red-700 text-white shrink-0 h-9">
                    {isSearchingPhone ? "Buscando..." : "Buscar"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {orders.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
            <div className="text-6xl mb-4">🛵</div>
            <h3 className="text-xl font-bold text-stone-900 mb-2">Nenhum pedido encontrado</h3>
            <p className="text-stone-600 mb-6 max-w-md mx-auto text-sm">
              Você ainda não tem pedidos registrados neste aparelho ou número. Que tal pedir agora?
            </p>
            <Link to={createPageUrl("Menu")}>
              <Button className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6">
                Abrir Cardápio
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Pedidos em Andamento */}
            {activeOrders.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-red-600 animate-pulse" />
                  <h2 className="text-lg sm:text-xl font-bold text-stone-900">Pedidos em Andamento</h2>
                </div>

                <AnimatePresence>
                  {activeOrders.map((order) => {
                    const currentStep = getStepIndex(order.status);
                    const orderItems = safeGetItems(order.items);
                    const isHighlighted = highlightOrderId === order.id;
                    const isPixPaid = order.payment_status === "paid" || order.status === "confirmado";

                    return (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                      >
                        {/* Banner de Celebração de Pagamento Aprovado */}
                        {isHighlighted && isPixPaid && (
                          <div className="mb-3 p-4 bg-emerald-500 text-white rounded-2xl shadow-md flex items-center justify-between gap-3 animate-fade-in">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                                <ShieldCheck className="w-6 h-6 text-white" />
                              </div>
                              <div>
                                <h4 className="font-extrabold text-sm sm:text-base leading-tight">
                                  🎉 Pagamento PIX Confirmado com Sucesso!
                                </h4>
                                <p className="text-xs text-emerald-100 mt-0.5">
                                  Seu pedido já foi enviado para a cozinha e está sendo preparado.
                                </p>
                              </div>
                            </div>
                            <Badge className="bg-white text-emerald-800 font-bold border-none shrink-0 shadow-sm">
                              Pago via PIX
                            </Badge>
                          </div>
                        )}

                        <Card className="border-red-100 shadow-lg overflow-hidden bg-white">
                          {/* Topo do Card */}
                          <div className="bg-gradient-to-r from-red-600 to-amber-600 p-4 sm:p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <span className="text-xs uppercase tracking-wider text-red-100 font-semibold">Status ao Vivo</span>
                              <h3 className="text-lg font-bold">Pedido #{safeOrderId(order.id)}</h3>
                              <p className="text-xs text-red-100 mt-0.5">
                                {safeFormatDate(order.created_date)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Cronômetro de tempo restante de entrega / preparo */}
                              <OrderCountdownTimer 
                                order={order} 
                                deliveryTimeSetting={tenant?.delivery_time || settings?.delivery_time || "40-50 min"} 
                              />
                              
                              <Badge className={`${getStatusColor(order.status)} font-semibold text-xs px-3 py-1 shadow-sm`}>
                                {getStatusText(order.status, order)}
                              </Badge>
                            </div>
                          </div>

                          <CardContent className="p-5 sm:p-6 space-y-6">
                            {/* Linha do Tempo (Stepper) */}
                            {order.status !== 'cancelado' && (
                              <div className="pt-2 pb-4">
                                <div className="relative flex justify-between">
                                  {/* Linha de fundo */}
                                  <div className="absolute top-1/2 left-0 right-0 h-1 bg-stone-200 -translate-y-1/2 z-0"></div>
                                  {/* Linha de progresso */}
                                  <div 
                                    className="absolute top-1/2 left-0 h-1 bg-red-600 -translate-y-1/2 z-0 transition-all duration-500"
                                    style={{ width: `${(Math.max(0, currentStep) / (getOrderSteps(order.order_type).length - 1)) * 100}%` }}
                                  ></div>

                                  {getOrderSteps(order.order_type).map((step, idx) => {
                                    const StepIcon = step.icon;
                                    const isPassed = currentStep >= idx;
                                    const isCurrent = currentStep === idx;

                                    return (
                                      <div key={step.status} className="relative z-10 flex flex-col items-center">
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                                          isPassed 
                                            ? 'bg-red-600 text-white shadow-md ring-4 ring-red-100' 
                                            : 'bg-stone-200 text-stone-400'
                                        } ${isCurrent ? 'scale-110 animate-bounce' : ''}`}>
                                          <StepIcon className="w-4 h-4" />
                                        </div>
                                        <span className={`text-[10px] sm:text-xs mt-2 font-medium text-center ${
                                          isPassed ? 'text-stone-900 font-bold' : 'text-stone-400'
                                        }`}>
                                          {step.label}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Informações de Entrega / Retirada / Consumo no Local */}
                            <div className="bg-stone-50 rounded-xl p-4 border border-stone-200/80 space-y-2 text-sm">
                              <div className="flex items-center gap-2 text-stone-700">
                                {order.order_type === 'delivery' ? (
                                  <>
                                    <Truck className="w-4 h-4 text-red-600 shrink-0" />
                                    <span className="font-medium">Entrega em:</span>
                                    <span className="text-stone-600">{order.customer_address || order.delivery_address}</span>
                                  </>
                                ) : (order.order_type === 'dine_in' || (order.table_number && order.table_number.toLowerCase().includes('mesa'))) ? (
                                  <>
                                    <span className="text-base shrink-0">🍽️</span>
                                    <span className="font-medium">Consumo no Local:</span>
                                    <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg text-xs">
                                      {order.table_number || "Mesa do Salão"}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Store className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span className="font-medium">Retirada no Balcão:</span>
                                    <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg font-semibold">
                                      Retire quando pronto
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500 pt-1">
                                <span>Cliente: <strong>{order.customer_name || "Cliente"}</strong></span>
                                <span>WhatsApp: <strong>{order.customer_phone || "Não informado"}</strong></span>
                                {order.payment_method && (
                                  <span>Forma de Pagamento: <strong className="capitalize">{order.payment_method}</strong></span>
                                )}
                              </div>
                            </div>

                            {/* Itens do Pedido */}
                            <div className="space-y-2">
                              <p className="text-xs font-bold uppercase text-stone-400 tracking-wider">Itens do Pedido</p>
                              <div className="divide-y divide-stone-100">
                                {orderItems.map((item, index) => {
                                  const itemSubtotal = item.subtotal ?? (Number(item.price || 0) * Number(item.quantity || 1));
                                  return (
                                    <div key={index} className="py-2 flex justify-between items-start text-sm">
                                      <div>
                                        <span className="font-semibold text-stone-800">
                                          {item.quantity}x {item.product_name || item.name}
                                        </span>
                                        {item.additionals && item.additionals.length > 0 && (
                                          <p className="text-xs text-stone-500">
                                            + {item.additionals.map(a => a.name).join(', ')}
                                          </p>
                                        )}
                                      </div>
                                      <span className="text-stone-700 font-medium">
                                        R$ {safeFormatCurrency(itemSubtotal)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <Separator />

                            {/* Totais */}
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-semibold text-stone-600">Total Pago</span>
                              <span className="text-2xl font-extrabold text-red-600">
                                R$ {safeFormatCurrency(order.total_amount || order.total)}
                              </span>
                            </div>

                            {/* Ações: Contatar Loja & Novo Pedido */}
                            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                              {cleanStorePhone && (
                                <a
                                  href={`https://wa.me/55${cleanStorePhone}?text=${encodeURIComponent(`Olá! Gostaria de acompanhar o andamento do meu pedido #${safeOrderId(order.id)}`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1"
                                >
                                  <Button 
                                    variant="outline" 
                                    className="w-full border-emerald-600 text-emerald-700 hover:bg-emerald-50 gap-2 h-10 text-xs font-semibold"
                                  >
                                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                                    Falar com o Restaurante no WhatsApp
                                  </Button>
                                </a>
                              )}

                              <Link to={createPageUrl("Menu")} className="flex-1">
                                <Button 
                                  variant="ghost" 
                                  className="w-full border border-stone-200 text-stone-700 hover:bg-stone-100 gap-2 h-10 text-xs font-semibold"
                                >
                                  <UtensilsCrossed className="w-4 h-4 text-stone-500" />
                                  Fazer Novo Pedido
                                </Button>
                              </Link>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            {/* Histórico Anterior */}
            {completedOrders.length > 0 && (
              <div className="space-y-4 pt-4">
                <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-stone-500" />
                  Histórico de Pedidos Anteriores
                </h2>

                <div className="space-y-3">
                  {completedOrders.map((order) => {
                    const orderItems = safeGetItems(order.items);
                    return (
                      <Card key={order.id} className="border-stone-200 bg-white hover:border-stone-300 transition-all shadow-sm">
                        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-stone-900">Pedido #{safeOrderId(order.id)}</span>
                              <Badge className={`${getStatusColor(order.status)} font-medium text-[11px]`}>
                                {getStatusText(order.status)}
                              </Badge>
                            </div>
                            <p className="text-xs text-stone-500">
                              {safeFormatDate(order.created_date, "dd/MM/yyyy 'às' HH:mm")}
                            </p>
                            <p className="text-xs text-stone-600 mt-1">
                              {orderItems.map(i => `${i.quantity}x ${i.product_name || i.name}`).join(', ')}
                            </p>
                          </div>
                          <div className="text-right w-full sm:w-auto border-t sm:border-t-0 pt-2 sm:pt-0">
                            <span className="text-base font-bold text-stone-900 block">
                              R$ {safeFormatCurrency(order.total_amount || order.total)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}