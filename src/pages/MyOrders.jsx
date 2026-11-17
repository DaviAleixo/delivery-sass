import React, { useState, useEffect } from "react";
import { Order } from "@/entities/Order";
import { Settings } from "@/entities/Settings";
import { base44 } from "@/api/base44Client";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useTenant } from "@/lib/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, Clock, Sparkles, Store, 
  CheckCircle2, Bike, PackageCheck, RefreshCw,
  UtensilsCrossed, MapPin, User, Phone, CreditCard
} from "lucide-react";
import { formatPhoneBR } from "@/services/clientsService";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatInBrasilia } from "@/utils/dateTime";
import OrderCountdownTimer from "@/components/admin/OrderCountdownTimer";
import { getPaymentBrandInfo } from "@/constants/paymentBrands";

// --- Utilitários de Segurança e Formatação Resiliente ---
function safeFormatCurrency(val) {
  const num = Number(val);
  return isNaN(num) ? "0,00" : num.toFixed(2).replace(".", ",");
}

function formatPaymentMethodLabel(method) {
  if (!method) return "Não informado";
  const m = String(method).toLowerCase().trim();
  if (m === "pix" || m === "pix_online") return "PIX";
  if (m.includes("debito")) return "Cartão de Débito";
  if (m.includes("credito")) return "Cartão de Crédito";
  if (m.includes("dinheiro")) return "Dinheiro";
  if (m.includes("refeicao") || m.includes("alimentacao") || m.includes("vale")) return "Vale Refeição";
  if (m.includes("cashback")) return "Saldo de Cashback";
  return method.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function safeFormatDate(val) {
  if (!val) return "";
  try {
    const str = String(val).trim();
    const isoStr = str.includes(" ") && !str.includes("T") ? str.replace(" ", "T") : str;
    const parsed = new Date(isoStr);
    if (isNaN(parsed.getTime())) return "";
    return formatInBrasilia(parsed, { separator: " às " });
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

function getStepIndex(status, orderType) {
  switch (status) {
    case "pendente": return 0;
    case "confirmado":
    case "preparando": return 1;
    case "pronto": return orderType === "delivery" ? 1 : 2;
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
  const [_user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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

      // Buscar apenas os pedidos autorizados do usuário/navegador (sem Order.list() global!)
      const [settingsData] = await Promise.all([
        Settings.list()
      ]);

      if (settingsData && settingsData.length > 0) {
        setSettings(settingsData[0]);
      }

      let filtered = [];
      if (isSupabaseConfigured() && supabase) {
        try {
          const tokenEntries = JSON.parse(localStorage.getItem("vrumburguer_recent_orders_tokens") || "[]");
          if (Array.isArray(tokenEntries) && tokenEntries.length > 0) {
            const { data: tokOrders } = await supabase.rpc("get_public_orders_by_tokens", {
              p_tokens: tokenEntries,
            });
            if (Array.isArray(tokOrders)) {
              filtered = [...filtered, ...tokOrders];
            }
          }

          if (highlightOrderId) {
            const urlParams = new URLSearchParams(window.location.search);
            const urlToken = urlParams.get("token");
            const matchedEntry = Array.isArray(tokenEntries)
              ? tokenEntries.find((t) => t.id === highlightOrderId)
              : null;
            const effectiveToken = urlToken || matchedEntry?.tracking_token;
            if (effectiveToken) {
              const { data: trackRes } = await supabase.rpc("get_order_by_tracking_token", {
                p_order_id: highlightOrderId,
                p_tracking_token: effectiveToken,
              });
              if (trackRes?.success && trackRes?.order) {
                filtered.push(trackRes.order);
              }
            }
          }
        } catch {}
      } else {
        const allOrders = await Order.list("-created_date", 25);
        if (highlightOrderId) {
          filtered = (allOrders || []).filter(o => o.id === highlightOrderId);
        }
        if (loggedUser?.email) {
          filtered = [...filtered, ...(allOrders || []).filter(o => o.user_email === loggedUser.email)];
        }
        if (localIds.length > 0) {
          filtered = [...filtered, ...(allOrders || []).filter(o => localIds.includes(o.id))];
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

  const getStatusColor = (status) => {
    const colors = {
      pendente: "bg-amber-100 text-amber-800 border-amber-300",
      confirmado: "bg-blue-100 text-blue-800 border-blue-300",
      preparando: "bg-blue-100 text-blue-800 border-blue-300",
      pronto: "bg-emerald-100 text-emerald-800 border-emerald-300",
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
    if (status === "pronto") {
      if (order?.order_type === "delivery") return "Pronto • Aguardando entregador";
      if (order?.order_type === "dine_in" || order?.table_number?.toLowerCase().includes("mesa")) return "Pronto p/ Servir";
      return "Pronto p/ Retirada";
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

  const activeOrders = orders.filter(o => ['pendente', 'confirmado', 'preparando', 'pronto', 'enviado'].includes(o.status));
  const completedOrders = orders.filter(o => ['entregue', 'cancelado'].includes(o.status));

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
        {orders.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
            <div className="text-6xl mb-4">🛵</div>
            <h3 className="text-xl font-bold text-stone-900 mb-2">Nenhum pedido encontrado</h3>
            <p className="text-stone-600 mb-6 max-w-md mx-auto text-sm">
              Você ainda não tem pedidos registrados neste aparelho ou número. Que tal pedir agora?
            </p>
            <Link to={createPageUrl("Menu")}>
              <Button className="bg-[#047857] hover:bg-[#065f46] text-white font-bold px-6">
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
                  <Sparkles className="w-5 h-5 text-[#047857] animate-pulse" />
                  <h2 className="text-lg sm:text-xl font-bold text-stone-900">Pedidos em Andamento</h2>
                </div>

                <AnimatePresence>
                  {activeOrders.map((order) => {
                    const currentStep = getStepIndex(order.status, order.order_type);
                    const orderItems = safeGetItems(order.items);

                    return (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                      >
                        <Card className="border-[#D1E9DF] shadow-lg overflow-hidden bg-white">
                          {/* Topo do Card */}
                          <div className="bg-gradient-to-r from-[#064e3b] to-[#047857] p-4 sm:p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <span className="text-xs uppercase tracking-wider text-emerald-100 font-semibold">Status ao Vivo</span>
                              <h3 className="text-lg font-bold">Pedido #{safeOrderId(order.id)}</h3>
                              <p className="text-xs text-emerald-100 mt-0.5">
                                {safeFormatDate(order.created_date)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Cronômetro de tempo restante de entrega / preparo (apenas delivery/retirada) */}
                              {order.order_type !== 'dine_in' && !order.table_number && (
                                <OrderCountdownTimer 
                                  order={order} 
                                  deliveryTimeSetting={tenant?.delivery_time || settings?.delivery_time || "40-50 min"} 
                                />
                              )}
                              
                              <Badge className={`${getStatusColor(order.status)} font-semibold text-xs px-3 py-1 shadow-sm`}>
                                {order.order_type === 'dine_in' || order.table_number 
                                  ? (order.status === 'entregue' ? 'Finalizado' : 'Confirmado na Mesa')
                                  : getStatusText(order.status, order)}
                              </Badge>
                            </div>
                          </div>

                          <CardContent className="p-5 sm:p-6 space-y-6">
                            {/* Linha do Tempo (Stepper para delivery/retirada) ou Card de Confirmação na Mesa */}
                            {order.status !== 'cancelado' && (
                              (order.order_type === 'dine_in' || order.table_number) ? (
                                <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-4 flex items-center gap-3.5 shadow-2xs">
                                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                                    <CheckCircle2 className="w-6 h-6" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-black text-emerald-950">Pedido Confirmado na Mesa</p>
                                    <p className="text-xs text-emerald-800">Seu pedido foi registrado e enviado diretamente para a cozinha.</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="pt-2 pb-4">
                                  <div className="relative flex justify-between">
                                    {/* Linha de fundo */}
                                    <div className="absolute top-1/2 left-0 right-0 h-1 bg-stone-200 -translate-y-1/2 z-0"></div>
                                    {/* Linha de progresso */}
                                    <div 
                                      className="absolute top-1/2 left-0 h-1 bg-[#047857] -translate-y-1/2 z-0 transition-all duration-500"
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
                                              ? 'bg-[#047857] text-white shadow-md ring-4 ring-[#D1E9DF]' 
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
                              )
                            )}

                            {/* Informações de Entrega / Retirada / Consumo no Local */}
                            <div className="bg-stone-50/80 rounded-2xl p-4 border border-stone-200/90 space-y-3.5">
                              {/* Destino do Pedido */}
                              {order.order_type === 'delivery' ? (
                                <div className="flex items-start gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-emerald-100/70 text-[#047857] flex items-center justify-center shrink-0 mt-0.5">
                                    <MapPin className="w-4 h-4 text-[#047857]" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                                      Endereço de Entrega
                                    </span>
                                    <p className="text-xs sm:text-sm font-semibold text-stone-900 leading-snug mt-0.5">
                                      {order.customer_address || order.delivery_address || "Endereço não informado"}
                                    </p>
                                  </div>
                                </div>
                              ) : (order.order_type === 'dine_in' || (order.table_number && order.table_number.toLowerCase().includes('mesa'))) ? (
                                <div className="flex items-start gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-emerald-100/70 text-[#047857] flex items-center justify-center shrink-0 mt-0.5">
                                    <UtensilsCrossed className="w-4 h-4 text-[#047857]" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                                      Consumo no Local
                                    </span>
                                    <div className="mt-1">
                                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-extrabold text-xs inline-block">
                                        {order.table_number || "Mesa do Salão"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-amber-100/70 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                                    <Store className="w-4 h-4 text-amber-700" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                                      Retirada no Balcão
                                    </span>
                                    <p className="text-xs sm:text-sm font-semibold text-stone-900 mt-0.5">
                                      Retire seu pedido diretamente no balcão da loja assim que estiver pronto.
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* Linhas de Informações: Cliente, WhatsApp e Pagamento */}
                              <div className="border-t border-stone-200/70 pt-3 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-stone-500 flex items-center gap-1.5 font-medium">
                                    <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                    Cliente
                                  </span>
                                  <span className="font-semibold text-stone-900 truncate max-w-[200px] text-right">
                                    {order.customer_name || "Cliente"}
                                  </span>
                                </div>

                                {order.customer_phone && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-stone-500 flex items-center gap-1.5 font-medium">
                                      <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                      WhatsApp
                                    </span>
                                    <span className="font-mono font-medium text-stone-800">
                                      {formatPhoneBR(order.customer_phone)}
                                    </span>
                                  </div>
                                )}

                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-stone-500 flex items-center gap-1.5 font-medium">
                                    <CreditCard className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                    Pagamento
                                  </span>
                                  <span className="font-medium text-stone-800 bg-white border border-stone-200 px-2 py-0.5 rounded-md text-[11px] shadow-2xs inline-flex items-center gap-1.5">
                                    {order.card_brand ? (
                                      <>
                                        {(() => {
                                          const bInfo = getPaymentBrandInfo(order.card_brand);
                                          return bInfo?.image ? (
                                            <img src={bInfo.image} alt={order.card_brand} className="h-3.5 w-auto object-contain shrink-0" />
                                          ) : null;
                                        })()}
                                        <span>{formatPaymentMethodLabel(order.payment_method)} ({order.card_brand})</span>
                                      </>
                                    ) : (
                                      formatPaymentMethodLabel(order.payment_method)
                                    )}
                                  </span>
                                </div>
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
                              <span className="text-2xl font-extrabold text-[#171717]">
                                R$ {safeFormatCurrency(order.total_amount || order.total)}
                              </span>
                            </div>

                            {/* Ações: Novo Pedido */}
                            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                              <Link to={createPageUrl("Menu")} className="w-full">
                                <Button 
                                  variant="outline" 
                                  className="w-full border-stone-200 text-stone-700 hover:bg-stone-100 gap-2 h-10 text-xs font-semibold cursor-pointer"
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