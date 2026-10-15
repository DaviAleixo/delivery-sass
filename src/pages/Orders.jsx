import React, { useState, useEffect, useRef } from "react";
import { Order } from "@/entities/Order";
import { Settings } from "@/entities/Settings";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MapPin, Clock, CheckCircle, X, Bell, BellOff, Volume2, Timer, Check,
  Calendar, Search, ChefHat, Bike, ShoppingBag, SlidersHorizontal, ChevronRight, ChevronDown, Pencil, QrCode, RefreshCw
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { soundAlert } from "@/utils/soundAlert";
import TableQRCodeModal from "@/components/admin/TableQRCodeModal";
import OrderCard from "@/components/admin/orders/OrderCard";
import DispatchOrderModal from "@/components/admin/orders/DispatchOrderModal";
import ShiftClosingModal from "@/components/admin/orders/ShiftClosingModal";
import { calculateShiftClosing } from "@/utils/shiftClosingCalculator";
import { Receipt } from "lucide-react";
import { getStoreStatusInfo, getTodayDateKey } from "@/utils/storeStatus";
import { getBrasiliaParts } from "@/utils/dateTime";
import { useOrdersRealtime } from "@/hooks/useOrdersRealtime";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

/**
 * Determina se o pedido pertence ao turno de trabalho atual da hamburgueria.
 * Se a hamburgueria abre às 18:00 e vai até as 02:00, o turno engloba desde as 18:00
 * até o fechamento da madrugada. Pedidos em andamento são sempre mantidos.
 */
function isOrderInCurrentShift(order, settings) {
  if (!order || !order.created_date) return false;
  
  // Qualquer pedido que ainda não foi entregue ou cancelado permanece visível no turno
  if (['pendente', 'confirmado', 'preparando', 'enviado'].includes(order.status)) {
    return true;
  }

  const d = new Date(order.created_date);
  if (isNaN(d.getTime())) return false;

  const nowParts = getBrasiliaParts(new Date());
  let openingHour = 18;
  let openingMinute = 0;

  if (settings?.opening_time) {
    const parts = settings.opening_time.split(':').map(Number);
    if (!isNaN(parts[0])) openingHour = parts[0];
    if (!isNaN(parts[1])) openingMinute = parts[1];
  }

  const shiftStart = new Date();
  // Se o horário atual em Brasília for de madrugada antes da abertura, o turno começou no dia anterior
  if (nowParts.hour < openingHour) {
    shiftStart.setDate(shiftStart.getDate() - 1);
  }
  shiftStart.setHours(openingHour, openingMinute, 0, 0);

  return d.getTime() >= shiftStart.getTime();
}

function isDateToday(dateStr) {
  if (!dateStr) return false;
  const orderParts = getBrasiliaParts(dateStr);
  const nowParts = getBrasiliaParts(new Date());
  return orderParts.dateKey === nowParts.dateKey;
}

function isDateYesterday(dateStr) {
  if (!dateStr) return false;
  const orderParts = getBrasiliaParts(dateStr);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yParts = getBrasiliaParts(yesterday);
  return orderParts.dateKey === yParts.dateKey;
}

function isDateWithinDays(dateStr, days = 7) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  return d.getTime() >= cutoff;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [deliveryTime, setDeliveryTime] = useState("60–80 min");
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("vrumburguer_order_sound_enabled") !== "false";
    }
    return true;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pendente");
  const [timeFilter, setTimeFilter] = useState("shift"); // "shift" | "today" | "yesterday" | "week" | "all"
  const [channelFilter, setChannelFilter] = useState("all"); // "all" | "delivery" | "pickup" | "dine_in"
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  
  const [orderLimit, setOrderLimit] = useState(35);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Estados para Gestão de Entregadores e Despacho
  const [drivers, setDrivers] = useState([]);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [orderToDispatch, setOrderToDispatch] = useState(null);

  // Estado para Fechamento de Caixa do Turno
  const [shiftClosingOpen, setShiftClosingOpen] = useState(false);

  const knownPendingIds = useRef(new Set());
  const isFirstLoad = useRef(true);
  const isFetchingRef = useRef(false);

  // Conexão WebSocket Realtime instantânea com Supabase
  useOrdersRealtime({
    onInsert: (newOrder) => {
      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });

      // Se for pedido aguardando pagamento via PIX, NÃO alerta a loja ainda!
      if (newOrder.status === "aguardando_pagamento") {
        return;
      }

      if (newOrder.status === "pendente") {
        soundAlert.playOrderChime();
        soundAlert.setPendingCount((prev) => (prev || 0) + 1);
        knownPendingIds.current.add(newOrder.id);
      }

      const client = newOrder.customer_name || "Cliente";
      const num = String(newOrder.id).slice(-4).toUpperCase();
      toast.success(`🔔 Novo Pedido #${num} de ${client}!`, {
        description: `Total: R$ ${(newOrder.total_amount || newOrder.total || 0).toFixed(2).replace(".", ",")}`,
        duration: 7000,
      });
    },
    onUpdate: (updatedOrder) => {
      setOrders((prev) => {
        const existing = prev.find((o) => o.id === updatedOrder.id);
        // Se mudou de 'aguardando_pagamento' para 'confirmado' ou 'pendente' (PIX pago com sucesso!):
        if (existing?.status === "aguardando_pagamento" && ["pendente", "confirmado"].includes(updatedOrder.status)) {
          soundAlert.playOrderChime();
          const client = updatedOrder.customer_name || "Cliente";
          const num = String(updatedOrder.id).slice(-4).toUpperCase();
          toast.success(`💰 PIX Confirmado! Pedido #${num} de ${client}!`, {
            description: `Total: R$ ${(updatedOrder.total_amount || updatedOrder.total || 0).toFixed(2).replace(".", ",")}`,
            duration: 8000,
          });
        }
        return prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o));
      });
    },
    onDelete: (deletedOrder) => {
      setOrders((prev) => prev.filter((o) => o.id !== deletedOrder.id));
    },
  });

  useEffect(() => {
    loadData();
    // Fallback passivo a cada 30 segundos apenas por precaução de rede
    const interval = setInterval(() => {
      loadOrdersOnly();
    }, 30000);

    return () => {
      clearInterval(interval);
      soundAlert.stopContinuousAlert();
      soundAlert.setPendingCount(0);
    };

  }, [orderLimit]);

  // Sincroniza ativamente o alarme sonoro com pedidos pendentes
  // Se houver qualquer pedido pendente (mesmo antigo) e o som estiver ativado, toca a campainha!
  useEffect(() => {
    if (!soundEnabled) {
      soundAlert.stopContinuousAlert();
      soundAlert.setPendingCount(0);
      return;
    }

    const currentPending = orders.filter((o) => o.status === "pendente");
    soundAlert.setPendingCount(currentPending.length);

    if (currentPending.length > 0) {
      soundAlert.startContinuousAlert();
    } else {
      soundAlert.stopContinuousAlert();
    }
  }, [orders, soundEnabled]);

  const loadData = async () => {
    try {
      const [ordersData, settingsData] = await Promise.all([
        Order.list("-created_date", orderLimit),
        Settings.list()
      ]);
      const safeOrders = Array.isArray(ordersData) ? ordersData : [];
      setOrders(safeOrders);

      if (settingsData && settingsData.length > 0) {
        setSettings(settingsData[0]);
        if (settingsData[0].delivery_time) {
          setDeliveryTime(settingsData[0].delivery_time);
        }
      }

      // Carrega dados completos do restaurante diretamente do Supabase (tenants)
      const currentTenantId = localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
      let resolvedTenant = null;
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: tenantRow } = await supabase
            .from("tenants")
            .select("*")
            .eq("id", currentTenantId)
            .maybeSingle();
          if (tenantRow) {
            resolvedTenant = tenantRow;
            if (tenantRow.delivery_drivers && Array.isArray(tenantRow.delivery_drivers)) {
              setDrivers(tenantRow.delivery_drivers);
            }
          }
        } catch (_drvErr) {}
      }

      if (resolvedTenant) {
        const formattedSettings = {
          ...resolvedTenant,
          restaurant_name: resolvedTenant.name,
          restaurant_logo: resolvedTenant.logo_url,
        };
        setSettings(formattedSettings);
        if (resolvedTenant.delivery_time) {
          setDeliveryTime(resolvedTenant.delivery_time);
        }
      } else if (settingsData && settingsData.length > 0) {
        setSettings(settingsData[0]);
        if (settingsData[0].delivery_time) {
          setDeliveryTime(settingsData[0].delivery_time);
        }
      }

      // Inicializa os IDs de pedidos pendentes conhecidos e ativa som contínuo se houver pendentes
      const pendingOrders = safeOrders.filter(o => o.status === 'pendente');
      soundAlert.setPendingCount(pendingOrders.length);
      knownPendingIds.current = new Set(pendingOrders.map(o => o.id));
      isFirstLoad.current = false;
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrdersOnly = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const ordersData = await Order.list("-created_date", orderLimit);
      const safeOrders = Array.isArray(ordersData) ? ordersData : [];
      setOrders(safeOrders);

      // Checa pedidos pendentes e atualiza o alarme sonoro
      const currentPending = safeOrders.filter(o => o.status === 'pendente');
      soundAlert.setPendingCount(currentPending.length);
      knownPendingIds.current = new Set(currentPending.map(o => o.id));
    } catch (err) {
      console.error("Erro ao atualizar pedidos:", err);
    } finally {
      isFetchingRef.current = false;
    }
  };

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setOrderLimit(prev => prev + 25);
    setIsLoadingMore(false);
  };

  const toggleSoundAlert = () => {
    const nextState = !soundEnabled;
    soundAlert.setEnabled(nextState);
    setSoundEnabled(nextState);

    if (nextState) {
      const currentPending = orders.filter((o) => o.status === "pendente");
      soundAlert.setPendingCount(currentPending.length);
      soundAlert.playOrderChime();
    } else {
      soundAlert.stopContinuousAlert();
      soundAlert.setPendingCount(0);
    }
  };

  const testSound = () => {
    soundAlert.playOrderChime();
  };

  const [isTogglingStore, setIsTogglingStore] = useState(false);

  const storeStatus = getStoreStatusInfo(settings);

  const handleToggleStoreStatus = async () => {
    const targetTenantId = settings?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
    setIsTogglingStore(true);
    try {
      const todayKey = getTodayDateKey();
      const newStatus = !storeStatus.isOpen;
      
      const updatedData = {
        manual_store_open: newStatus,
        manual_override_date: todayKey,
      };

      await Settings.update(targetTenantId, updatedData);
      
      const newSettings = { ...settings, ...updatedData, id: targetTenantId };
      setSettings(newSettings);
      
      window.dispatchEvent(new CustomEvent("settings_updated", { detail: newSettings }));

      if (!newStatus) {
        toast("🔴 Loja fechada manualmente!", {
          description: "Deseja conferir e fechar o caixa do turno agora?",
          action: {
            label: "🧾 Fechar Caixa",
            onClick: () => setShiftClosingOpen(true),
          },
          duration: 12000,
        });
      } else {
        toast.success("🟢 Loja aberta manualmente!");
      }
    } catch (err) {
      console.error("Erro ao alterar status da loja:", err);
      toast.error("Erro ao alterar status da loja. Tente novamente.");
    } finally {
      setIsTogglingStore(false);
    }
  };

  const handleResetToAuto = async () => {
    const targetTenantId = settings?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
    setIsTogglingStore(true);
    try {
      const updatedData = {
        manual_store_open: null,
        manual_override_date: null,
      };

      await Settings.update(targetTenantId, updatedData);
      
      const newSettings = { ...settings, ...updatedData, id: targetTenantId };
      setSettings(newSettings);
      
      window.dispatchEvent(new CustomEvent("settings_updated", { detail: newSettings }));
      toast.info("⏱️ Horário resetado para a programação semanal!");
    } catch (err) {
      console.error("Erro ao resetar status da loja:", err);
      toast.error("Erro ao resetar status da loja.");
    } finally {
      setIsTogglingStore(false);
    }
  };

  const handleSetDeliveryTime = async (newTime) => {
    setDeliveryTime(newTime);
    setIsEditingTime(false);
    const targetTenantId = settings?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
    try {
      await Settings.update(targetTenantId, { delivery_time: newTime });
      toast.success("Tempo de entrega atualizado!");
    } catch (err) {
      console.error("Erro ao atualizar tempo de entrega:", err);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      setOrders(prev => {
        const next = prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o);
        const remainingPending = next.filter(o => o.status === 'pendente');
        soundAlert.setPendingCount(remainingPending.length);
        return next;
      });
      await Order.update(orderId, { status: newStatus });
      const statusLabel =
        newStatus === "confirmado" ? "confirmado" :
        newStatus === "cancelado" ? "cancelado" :
        newStatus === "preparando" ? "em preparo" :
        newStatus === "enviado" ? "enviado" :
        newStatus === "entregue" ? "entregue" : newStatus;
      toast.success(`Pedido #${String(orderId).slice(-4).toUpperCase()} marcado como ${statusLabel}!`);
      loadOrdersOnly();
    } catch (err) {
      console.error("Erro ao atualizar status do pedido:", err);
      toast.error("Erro ao atualizar status do pedido. Tente novamente.");
    }
  };

  const handleOrderStatusClick = (orderId, newStatus) => {
    if (newStatus === "enviado") {
      const target = orders.find((o) => o.id === orderId);
      const activeDrivers = (drivers || []).filter((d) => d.active !== false);
      // Se for pedido do tipo delivery E houver entregadores cadastrados na equipe, abre o modal de despacho
      if (target && target.order_type === "delivery" && activeDrivers.length > 0) {
        setOrderToDispatch(target);
        setDispatchModalOpen(true);
        return;
      }
    }
    updateOrderStatus(orderId, newStatus);
  };

  const handleConfirmDispatch = async ({ driver, orderIds, tripId }) => {
    const nowIso = new Date().toISOString();
    const driverName = driver?.name || null;
    const driverId = driver?.id || null;

    setOrders((prev) =>
      prev.map((o) => {
        if (orderIds.includes(o.id)) {
          return {
            ...o,
            status: "enviado",
            driver_id: driverId,
            driver_name: driverName,
            trip_id: tripId,
            dispatched_at: nowIso,
          };
        }
        return o;
      })
    );

    try {
      await Promise.all(
        orderIds.map((id) =>
          Order.update(id, {
            status: "enviado",
            driver_id: driverId,
            driver_name: driverName,
            trip_id: tripId,
            dispatched_at: nowIso,
          })
        )
      );

      toast.success(
        `🚀 ${orderIds.length} ${orderIds.length === 1 ? "pedido despachado" : "pedidos despachados"} ${
          driverName ? `com ${driverName}` : ""
        }!`
      );
      loadOrdersOnly();
    } catch (err) {
      console.error("Erro ao despachar pedidos:", err);
      toast.error("Erro ao registrar saída de entrega.");
    }
  };


  const safeMoney = (val) => {
    const num = Number(val || 0);
    return isNaN(num) ? "0,00" : num.toFixed(2).replace(".", ",");
  };

  const safeDate = (dateVal) => {
    if (!dateVal) return null;
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  };

  const getStatusColor = (status) => {
    const colors = {
      pendente: "bg-yellow-100 text-yellow-800 border-yellow-200",
      confirmado: "bg-blue-100 text-blue-800 border-blue-200",
      preparando: "bg-purple-100 text-purple-800 border-purple-200",
      enviado: "bg-indigo-100 text-indigo-800 border-indigo-200",
      entregue: "bg-green-100 text-green-800 border-green-200",
      cancelado: "bg-red-100 text-red-800 border-red-200"
    };
    return colors[status] || "bg-gray-100 text-gray-800 border-gray-200";
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

  const getStatusIcon = (status) => {
    const icons = {
      pendente: <Clock className="w-4 h-4" />,
      confirmado: <CheckCircle className="w-4 h-4" />,
      preparando: <Clock className="w-4 h-4" />,
      enviado: <MapPin className="w-4 h-4" />,
      entregue: <CheckCircle className="w-4 h-4" />,
      cancelado: <X className="w-4 h-4" />
    };
    return icons[status];
  };

  const getPaymentMethodText = (method) => {
    const methods = {
      dinheiro: "Dinheiro",
      pix: "PIX",
      pix_online: "PIX Online (Mercado Pago)",
      cartao: "Cartão",
      cartao_credito: "Cartão de Crédito",
      cartao_debito: "Cartão de Débito",
      alimentacao: "Vale Alimentação / Refeição"
    };
    return methods[method] || method || "-";
  };

  // Filtro por período de tempo (Turno aberto, Hoje, Ontem, Semana, Todos)
  const timeFilteredOrders = React.useMemo(() => {
    let list = (orders || []).filter(o => o.status !== "aguardando_pagamento");

    if (timeFilter === "shift") {
      list = list.filter(o => isOrderInCurrentShift(o, settings));
    } else if (timeFilter === "today") {
      list = list.filter(o => isDateToday(o.created_date) || ['pendente', 'confirmado', 'preparando', 'enviado'].includes(o.status));
    } else if (timeFilter === "yesterday") {
      list = list.filter(o => isDateYesterday(o.created_date));
    } else if (timeFilter === "week") {
      list = list.filter(o => isDateWithinDays(o.created_date, 7));
    }

    // Filtro por canal de atendimento
    if (channelFilter !== "all") {
      list = list.filter(o => {
        if (channelFilter === "delivery") return o.order_type === "delivery";
        if (channelFilter === "pickup") return o.order_type === "pickup" || o.order_type === "balcao";
        if (channelFilter === "dine_in") return o.order_type === "dine_in" || o.order_type === "mesa";
        return true;
      });
    }

    // Busca rápida por texto (Número do pedido, Nome, Mesa ou Telefone)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(o => 
        String(o.id).toLowerCase().includes(q) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
        (o.customer_phone && o.customer_phone.includes(q)) ||
        (o.table_number && o.table_number.toLowerCase().includes(q))
      );
    }

    return list;
  }, [orders, timeFilter, channelFilter, settings, searchQuery]);

  const filteredOrders = React.useMemo(() => {
    if (activeTab === "all") return timeFilteredOrders;
    return timeFilteredOrders.filter(order => order.status === activeTab);
  }, [timeFilteredOrders, activeTab]);

  const statusCounts = {
    all: timeFilteredOrders.length,
    pendente: timeFilteredOrders.filter(o => o.status === "pendente").length,
    confirmado: timeFilteredOrders.filter(o => o.status === "confirmado").length,
    preparando: timeFilteredOrders.filter(o => o.status === "preparando").length,
    enviado: timeFilteredOrders.filter(o => o.status === "enviado").length,
    entregue: timeFilteredOrders.filter(o => o.status === "entregue").length,
  };

  const toggleOrderExpansion = (orderId) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="p-8 bg-[#F7F9F8] min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#047857] mx-auto mb-4"></div>
          <p className="text-stone-600">Carregando pedidos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-[#F7F9F8] min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Cabeçalho da Página com Título e Cards de Ações Rápidas */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-950 tracking-tight">Pedidos</h1>
            <p className="text-sm text-gray-500 mt-1">Gerencie e acompanhe todos os pedidos do seu restaurante.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Card 1: Entrega média */}
            <div className="bg-white border border-gray-200/90 rounded-2xl px-4 py-2 flex items-center gap-3 shadow-2xs">
              <Clock className="w-4 h-4 text-gray-500 shrink-0" />
              <div>
                <p className="text-[10px] text-gray-400 font-medium leading-none">Entrega média</p>
                {!isEditingTime ? (
                  <p className="text-sm font-black text-gray-950 leading-tight mt-0.5">{deliveryTime}</p>
                ) : (
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      type="text"
                      value={customTimeInput}
                      onChange={(e) => setCustomTimeInput(e.target.value)}
                      placeholder="60–80 min"
                      className="bg-gray-100 text-xs px-2 py-0.5 rounded-md w-20 border border-gray-300 outline-none font-bold"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customTimeInput.trim()) handleSetDeliveryTime(customTimeInput.trim());
                        else setIsEditingTime(false);
                      }}
                      className="bg-[#047857] text-white p-0.5 rounded text-xs cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingTime(false)}
                      className="bg-gray-200 text-gray-600 p-0.5 rounded text-xs cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              {!isEditingTime && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomTimeInput(deliveryTime);
                    setIsEditingTime(true);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                  title="Alterar tempo médio"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Card 2: Fechamento de Caixa */}
            <button
              type="button"
              onClick={() => setShiftClosingOpen(true)}
              className="bg-white border border-gray-200/90 hover:border-gray-300 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xs hover:bg-gray-50/70 transition-all cursor-pointer"
            >
              <Receipt className="w-4 h-4 text-gray-700 shrink-0" />
              <span className="text-xs font-bold text-gray-900">Fechamento de Caixa</span>
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 ml-0.5" />
            </button>

            {/* Card 3: QR Code das Mesas */}
            <TableQRCodeModal
              settings={settings}
              trigger={
                <button
                  type="button"
                  className="bg-white border border-gray-200/90 hover:border-gray-300 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xs hover:bg-gray-50/70 transition-all cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-gray-700 shrink-0" />
                  <span className="text-xs font-bold text-gray-900">QR Code das Mesas</span>
                </button>
              }
            />
          </div>
        </div>

        {/* Abas de Status dos Pedidos (Pílulas Horizontais) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide pt-1">
          {[
            { id: "pendente", label: "Pendentes", icon: Clock, count: statusCounts.pendente },
            { id: "confirmado", label: "Confirmados", icon: Check, count: statusCounts.confirmado },
            { id: "preparando", label: "Preparando", icon: ChefHat, count: statusCounts.preparando },
            { id: "enviado", label: "Enviados", icon: Bike, count: statusCounts.enviado },
            { id: "entregue", label: "Entregues", icon: ShoppingBag, count: statusCounts.entregue },
            { id: "cancelado", label: "Cancelados", icon: X, count: statusCounts.cancelado },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-[#E6F4EA] border border-emerald-200/90 text-[#047857] shadow-2xs"
                    : "bg-white/70 border border-transparent hover:border-gray-200 hover:bg-white text-gray-600"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#047857]" : "text-gray-500"}`} />
                <span>{tab.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold min-w-[20px] text-center ${
                  isActive
                    ? "bg-[#D1E9DF] text-[#047857]"
                    : "text-gray-400 font-semibold"
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-0.5">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Dropdown de Data */}
            <div className="relative">
              <select
                value={timeFilter === "shift" ? "shift" : timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="appearance-none bg-white border border-gray-200/90 rounded-2xl pl-8 pr-8 py-2 text-xs font-bold text-gray-800 shadow-2xs hover:bg-gray-50 focus:border-[#047857] outline-none cursor-pointer"
              >
                <option value="today">Hoje</option>
                <option value="yesterday">Ontem</option>
                <option value="week">Últimos 7 dias</option>
                <option value="all">Histórico Completo</option>
                <option value="shift">Turno Aberto (Ao Vivo)</option>
              </select>
              <Calendar className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Botão de Turno Ao Vivo */}
            <button
              type="button"
              onClick={() => setTimeFilter(timeFilter === "shift" ? "today" : "shift")}
              className={`bg-white border rounded-2xl pl-3 pr-4 py-2 text-xs font-bold shadow-2xs hover:bg-gray-50 transition-all flex items-center gap-2 cursor-pointer ${
                timeFilter === "shift" ? "border-emerald-300 text-emerald-800 bg-emerald-50/50" : "border-gray-200/90 text-gray-800"
              }`}
              title="Alternar filtro de Turno Aberto"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Turno Aberto (Ao Vivo)</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-1" />
            </button>

            {/* Dropdown de Canais */}
            <div className="relative">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="appearance-none bg-white border border-gray-200/90 rounded-2xl pl-4 pr-8 py-2 text-xs font-bold text-gray-800 shadow-2xs hover:bg-gray-50 focus:border-[#047857] outline-none cursor-pointer"
              >
                <option value="all">Todos os canais</option>
                <option value="delivery">🛵 Delivery</option>
                <option value="pickup">🥡 Retirada</option>
                <option value="dine_in">🍽️ Salão (Mesa)</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Busca e Botão Filtros */}
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 md:w-80">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar pedido, cliente, mesa..."
                className="w-full bg-white border border-gray-200/90 rounded-2xl pl-9 pr-8 py-2 text-xs text-gray-900 placeholder:text-gray-400 shadow-2xs outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setTimeFilter("shift");
                setChannelFilter("all");
                setSearchQuery("");
              }}
              className="bg-white border border-gray-200/90 rounded-2xl px-3.5 py-2 text-xs font-bold text-gray-700 shadow-2xs hover:bg-gray-50 flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
              title="Limpar filtros"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" />
              <span>Filtros</span>
            </button>
          </div>
        </div>

        {/* Listagem de Pedidos ou Estado Vazio */}
        <div className="space-y-4 pt-2">
          <div className="grid gap-4">
            <AnimatePresence>
              {filteredOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isExpanded={expandedOrders.has(order.id)}
                  onToggleExpansion={() => toggleOrderExpansion(order.id)}
                  onUpdateStatus={handleOrderStatusClick}
                  deliveryTime={deliveryTime}
                  safeDate={safeDate}
                  safeMoney={safeMoney}
                  getStatusColor={getStatusColor}
                  getStatusIcon={getStatusIcon}
                  getStatusText={getStatusText}
                  getPaymentMethodText={getPaymentMethodText}
                />
              ))}
            </AnimatePresence>

            {orders.length >= orderLimit && (
              <div className="flex justify-center pt-4 pb-2">
                <Button
                  onClick={handleLoadMore}
                  variant="outline"
                  disabled={isLoadingMore}
                  className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-2xl text-xs font-bold"
                >
                  {isLoadingMore ? "Carregando..." : `Carregar Mais Pedidos (+25)`}
                </Button>
              </div>
            )}

            {filteredOrders.length === 0 && !isLoading && (
              <div className="text-center py-20 px-4">
                {/* Ilustração da Caixa de Papelão Aberta Isométrica Idêntica à Foto */}
                <div className="w-32 h-32 mx-auto flex items-center justify-center">
                  <svg viewBox="0 0 160 140" fill="none" className="w-32 h-32 drop-shadow-sm">
                    <ellipse cx="80" cy="120" rx="46" ry="10" fill="#E2E8F0" />
                    {/* Caixa lateral esquerda */}
                    <path d="M42 68 L80 88 L80 120 L42 100 Z" fill="#D39763" />
                    {/* Caixa lateral direita */}
                    <path d="M80 88 L118 68 L118 100 L80 120 Z" fill="#B87B48" />
                    {/* Fundo interno esquerdo */}
                    <path d="M42 68 L80 48 L80 88 L42 68 Z" fill="#995E32" />
                    {/* Fundo interno direito */}
                    <path d="M80 48 L118 68 L80 88 Z" fill="#7D4922" />
                    {/* Aba superior esquerda (aberta p/ fora) */}
                    <path d="M42 68 L80 48 L65 32 L26 52 Z" fill="#E8B07D" />
                    {/* Aba superior direita (aberta p/ fora) */}
                    <path d="M80 48 L118 68 L134 52 L95 32 Z" fill="#DC9F6A" />
                    {/* Aba frontal esquerda (caída p/ baixo) */}
                    <path d="M42 68 L80 88 L74 104 L36 84 Z" fill="#E8B07D" />
                    {/* Aba frontal direita (caída p/ baixo) */}
                    <path d="M80 88 L118 68 L124 84 L86 104 Z" fill="#DC9F6A" />
                    {/* Faíscas verdes alegres */}
                    <path d="M72 26 L76 18 L80 26" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M88 28 L94 22" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M64 30 L58 24" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>

                <h3 className="text-xl font-bold text-gray-950 mt-5">
                  Nenhum pedido encontrado
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 mt-1.5 max-w-sm mx-auto">
                  {activeTab === "all"
                    ? "Não há pedidos no período selecionado."
                    : `Não há pedidos com o status "${getStatusText(activeTab)}" no período selecionado.`}
                </p>

                <button
                  type="button"
                  onClick={() => loadOrdersOnly()}
                  className="bg-[#047857] hover:bg-[#065f46] text-white font-bold rounded-xl px-6 py-2.5 text-xs shadow-sm flex items-center gap-2 mx-auto mt-5 transition-all active:scale-95 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Atualizar pedidos</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Inteligente de Despacho com Entregador */}
        <DispatchOrderModal
          isOpen={dispatchModalOpen}
          onClose={() => {
            setDispatchModalOpen(false);
            setOrderToDispatch(null);
          }}
          mainOrder={orderToDispatch}
          otherReadyOrders={orders.filter(
            (o) =>
              o.id !== orderToDispatch?.id &&
              o.order_type === "delivery" &&
              ["preparando", "confirmado"].includes(o.status)
          )}
          drivers={drivers}
          onConfirmDispatch={handleConfirmDispatch}
        />

        {/* Modal de Fechamento de Caixa do Turno */}
        <ShiftClosingModal
          isOpen={shiftClosingOpen}
          onClose={() => setShiftClosingOpen(false)}
          orders={orders}
          drivers={drivers}
          tenantSettings={settings}
          storeName={settings?.restaurant_name || localStorage.getItem("current_tenant_name") || "Vruum Burguer"}
        />
      </div>
    </div>
  );
}