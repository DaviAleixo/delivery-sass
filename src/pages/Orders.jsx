import React, { useState, useEffect, useRef } from "react";
import { Order } from "@/entities/Order";
import { Settings } from "@/entities/Settings";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Clock, CheckCircle, X, Bell, BellOff, Volume2, Timer, Check,
  Calendar, Search
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
  const [deliveryTime, setDeliveryTime] = useState("40-50 min");
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
  }, [orders, timeFilter, settings, searchQuery]);

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
      <div className="p-8 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando pedidos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Pedidos</h1>
            <p className="text-sm md:text-base text-gray-600 mt-0.5">Gerencie e acompanhe todos os pedidos do seu restaurante</p>
          </div>

          {/* Barra de Ações Rápidas: Status da Loja, Tempo de Entrega, Som e QR Code */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Controle de Abrir / Fechar Restaurante (Manual / Automático) */}
            <div className="bg-white border border-stone-200 shadow-sm rounded-2xl p-1.5 flex items-center gap-2">
              <button
                type="button"
                disabled={isTogglingStore}
                onClick={handleToggleStoreStatus}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none active:scale-95 ${
                  storeStatus.isOpen
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300"
                    : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-300"
                }`}
                title={storeStatus.isOpen ? "Clique para Fechar a loja agora (Override manual hoje)" : "Clique para Abrir a loja agora (Override manual hoje)"}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${storeStatus.isOpen ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                <span className="font-extrabold">
                  {storeStatus.isOpen ? "Loja Aberta" : "Loja Fechada"}
                </span>
                {storeStatus.isManual ? (
                  <span className="text-[10px] bg-white/90 px-1.5 py-0.5 rounded text-stone-600 font-semibold border border-stone-200">
                    Manual (Hoje)
                  </span>
                ) : (
                  <span className="text-[10px] bg-stone-100 px-1.5 py-0.5 rounded text-stone-500 font-medium">
                    Horário Auto
                  </span>
                )}
              </button>

              {storeStatus.isManual && (
                <button
                  type="button"
                  disabled={isTogglingStore}
                  onClick={handleResetToAuto}
                  title="Restaurar para seguir o horário automático configurado"
                  className="text-[11px] text-amber-700 hover:text-amber-900 underline px-1 font-semibold transition-colors cursor-pointer"
                >
                  Voltar p/ Auto
                </button>
              )}
            </div>

            {/* Controle de Tempo de Entrega Rápido */}
            <div className="bg-white border border-stone-200 shadow-sm rounded-2xl p-1.5 flex items-center gap-1.5">
              <div className="flex items-center gap-1 text-xs font-bold text-stone-700 px-2">
                <Timer className="w-3.5 h-3.5 text-amber-600" />
                <span>Entrega:</span>
              </div>

              {!isEditingTime ? (
                <div className="flex items-center gap-1">
                  {["30-40 min", "40-50 min", "50-60 min", "60-80 min"].map((timeOption) => {
                    const isSelected = deliveryTime === timeOption;
                    return (
                      <button
                        key={timeOption}
                        type="button"
                        onClick={() => handleSetDeliveryTime(timeOption)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                          isSelected
                            ? "bg-amber-500 text-white shadow-sm scale-105"
                            : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                        }`}
                      >
                        {timeOption}
                      </button>
                    );
                  })}
                  
                  {/* Botão para digitar outro tempo se não for nenhum dos 4 */}
                  {!["30-40 min", "40-50 min", "50-60 min", "60-80 min"].includes(deliveryTime) && (
                    <span className="bg-amber-500 text-white font-bold text-xs px-2.5 py-1 rounded-xl shadow-sm">
                      {deliveryTime}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setCustomTimeInput(deliveryTime);
                      setIsEditingTime(true);
                    }}
                    title="Definir tempo personalizado"
                    className="p-1 text-stone-400 hover:text-stone-700 text-xs font-bold rounded-lg hover:bg-stone-100"
                  >
                    ✏️
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={customTimeInput}
                    onChange={(e) => setCustomTimeInput(e.target.value)}
                    placeholder="Ex: 45-60 min"
                    className="bg-stone-100 text-xs px-2 py-1 rounded-lg w-24 border border-stone-300 outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customTimeInput.trim()) handleSetDeliveryTime(customTimeInput.trim());
                      else setIsEditingTime(false);
                    }}
                    className="bg-emerald-600 text-white p-1 rounded-lg text-xs"
                    title="Salvar"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingTime(false)}
                    className="bg-stone-200 text-stone-600 p-1 rounded-lg text-xs"
                    title="Cancelar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Controle da Campainha de Pedidos */}
            <div className="flex items-center gap-1 bg-white border border-stone-200 shadow-sm rounded-2xl p-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleSoundAlert}
                className={`h-7 px-2.5 rounded-xl text-xs font-bold gap-1.5 cursor-pointer ${
                  soundEnabled 
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200" 
                    : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                }`}
              >
                {soundEnabled ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <Bell className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Som Ativado</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    <BellOff className="w-3.5 h-3.5 text-red-600" />
                    <span>Som Mudo</span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={testSound}
                title="Testar Campainha"
                className="h-7 px-2 text-stone-600 hover:text-stone-900 rounded-xl text-xs"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Plaquinhas QR Code das Mesas */}
            <TableQRCodeModal settings={settings} />

            {/* Botão de Fechamento de Caixa do Turno */}
            <Button
              type="button"
              onClick={() => setShiftClosingOpen(true)}
              className="h-9 px-3.5 bg-gradient-to-r from-stone-900 to-stone-800 hover:from-black hover:to-stone-900 text-white rounded-2xl text-xs font-black shadow-sm flex items-center gap-2 cursor-pointer border border-stone-700 transition-all active:scale-95"
              title="Abrir Fechamento de Caixa do Turno"
            >
              <Receipt className="w-4 h-4 text-amber-400" />
              <span>Fechamento de Caixa</span>
            </Button>
          </div>
        </div>

        {/* Barra de Filtro de Período e Busca de Pedidos */}
        <div className="bg-white border border-stone-200 rounded-2xl p-3 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
            <span className="text-xs font-bold text-stone-500 mr-1 flex items-center gap-1 shrink-0">
              <Calendar className="w-3.5 h-3.5 text-stone-400" />
              <span>Período:</span>
            </span>

            {[
              { id: "shift", label: "Turno Aberto (Ao Vivo)", isLive: true },
              { id: "today", label: "Hoje" },
              { id: "yesterday", label: "Ontem" },
              { id: "week", label: "Últimos 7 dias" },
              { id: "all", label: "Histórico Completo" },
            ].map((p) => {
              const isSelected = timeFilter === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTimeFilter(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? "bg-red-600 text-white shadow-sm scale-102"
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                  }`}
                >
                  {p.isLive && (
                    <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-emerald-300 animate-pulse" : "bg-emerald-500"}`} />
                  )}
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Campo de Busca Rápida de Pedidos */}
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar #pedido, cliente, mesa..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 outline-none focus:bg-white focus:border-red-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
          <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="bg-white border p-1 inline-flex w-max md:w-auto min-w-full md:min-w-0">
              <TabsTrigger value="pendente" className="text-xs md:text-sm whitespace-nowrap">
                Pendentes ({statusCounts.pendente})
              </TabsTrigger>
              <TabsTrigger value="confirmado" className="text-xs md:text-sm whitespace-nowrap">
                Confirmados ({statusCounts.confirmado})
              </TabsTrigger>
              <TabsTrigger value="preparando" className="text-xs md:text-sm whitespace-nowrap">
                Preparando ({statusCounts.preparando})
              </TabsTrigger>
              <TabsTrigger value="enviado" className="text-xs md:text-sm whitespace-nowrap">
                Enviados ({statusCounts.enviado})
              </TabsTrigger>
              <TabsTrigger value="entregue" className="text-xs md:text-sm whitespace-nowrap">
                Entregues ({statusCounts.entregue})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="space-y-4">
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
                    className="border-stone-700 bg-stone-900 text-stone-200 hover:bg-stone-800 hover:text-white"
                  >
                    {isLoadingMore ? "Carregando..." : `Carregar Mais Pedidos (+25)`}
                  </Button>
                </div>
              )}

              {filteredOrders.length === 0 && !isLoading && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">📦</div>
                  <h3 className="text-xl font-medium text-gray-900 mb-2">
                    Nenhum pedido encontrado
                  </h3>
                  <p className="text-gray-600">
                    {activeTab === "all" 
                      ? "Você ainda não recebeu nenhum pedido."
                      : `Nenhum pedido com status "${getStatusText(activeTab)}" encontrado.`}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

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