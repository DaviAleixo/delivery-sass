import React, { useState, useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Order } from "@/entities/Order";
import { Product } from "@/entities/Product";
import { Settings } from "@/entities/Settings";
import {
  Clock, X, Check,
  ChefHat, Bike, ShoppingBag, Pencil,
  Volume2, VolumeX, RefreshCw, Star
} from "lucide-react";
import { soundAlert } from "@/utils/soundAlert";
import OrderDetailPanel, { ChannelIcon } from "@/components/admin/orders/OrderDetailPanel";
import {
  getOrderChannelMeta,
  getOrderStatusMeta,
  getTotalItemsCount,
} from "@/components/admin/orders/orderDisplayHelpers";
import CancelOrderModal from "@/components/admin/orders/CancelOrderModal";
import EmptyOrdersIllustration from "@/components/admin/orders/EmptyOrdersIllustration";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useFifoPrintQueue } from "@/hooks/useFifoPrintQueue";
import { getBrasiliaParts } from "@/utils/dateTime";
import { useOrdersRealtime } from "@/hooks/useOrdersRealtime";
import { isRealtimeChannelActive } from "@/lib/realtimeHub";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import { refundPixPayment } from "@/services/mercadoPagoService";
import { useTenant } from "@/lib/TenantContext";
import { useCashSession } from "@/hooks/useCashSession";
import CashSessionBanner from "@/components/admin/cash/CashSessionBanner";
import OpenCashModal from "@/components/admin/cash/OpenCashModal";

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

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [deliveryTime, setDeliveryTime] = useState("60–80 min");
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pendente");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const detailDismissedRef = useRef(false);

  // Estados para Gestão de Entregadores
  const [_drivers, setDrivers] = useState([]);

  // Estado para Cancelamento Profissional de Pedido
  const [cancellingOrder, setCancellingOrder] = useState(null);
  const { tenant } = useTenant();
  const [showOpenCashModal, setShowOpenCashModal] = useState(false);
  const cashSession = useCashSession(tenant?.id);

  // Alarme Sonoro de Pedidos Pendentes
  const [soundEnabled, setSoundEnabled] = useState(() => soundAlert.isEnabled());

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundAlert.setEnabled(next);
    if (next) {
      soundAlert.playOrderChime();
      toast.success("🔔 Alarme sonoro ativado!");
    } else {
      toast.info("🔕 Alarme sonoro silenciado.");
    }
  };

  // Fila de Impressão
  const { manualPrintOrder, enqueueOrders } = useFifoPrintQueue();

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

      enqueueOrders([newOrder]);

      if (newOrder.status === "pendente") {
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
        } else if (existing && existing.status !== "pronto" && updatedOrder.status === "pronto") {
          const client = updatedOrder.customer_name || "Cliente";
          const num = String(updatedOrder.id).slice(-4).toUpperCase();
          toast.success(`🍳 Pedido #${num} pronto na cozinha!`, {
            description: `${client} • Já pode despachar ou entregar`,
            duration: 6000,
          });
        }
        return prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o));
      });
      if (
        updatedOrder &&
        updatedOrder.print_status !== "printed" &&
        ["pendente", "confirmado", "preparando"].includes(updatedOrder.status)
      ) {
        enqueueOrders([updatedOrder]);
      }
    },
    onDelete: (deletedOrder) => {
      setOrders((prev) => prev.filter((o) => o.id !== deletedOrder.id));
    },
  });

  useEffect(() => {
    loadData();
    const activeTenantId = typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null;
    const rtFilter = activeTenantId ? `tenant_id=eq.${activeTenantId}` : null;
    let tickCount = 0;

    // Fallback passivo em aba visível: 60s com WebSocket conectado, 30s apenas se desconectado
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      tickCount += 1;
      if (rtFilter && isRealtimeChannelActive("orders", rtFilter) && tickCount % 2 !== 0) return;
      loadOrdersOnly();
    }, 30000);

    return () => {
      clearInterval(interval);
      soundAlert.stopContinuousAlert();
      soundAlert.setPendingCount(0);
    };
  }, []);

  // Sincroniza ativamente o alarme sonoro com pedidos pendentes
  // Se houver qualquer pedido pendente (mesmo antigo) e o som estiver ativado, toca a campainha!
  useEffect(() => {
    if (!soundEnabled) {
      soundAlert.stopContinuousAlert();
      soundAlert.setPendingCount(0);
      return;
    }

    const showDineIn = settings?.kanban_show_dine_in !== undefined
      ? Boolean(settings.kanban_show_dine_in)
      : Boolean(settings?.payment_methods?.kanban_show_dine_in);
    const currentPending = orders.filter((o) => {
      if (o.status !== "pendente") return false;
      const ch = getOrderChannelMeta(o);
      if (ch.kind === "dine_in" && !showDineIn) return false;
      return true;
    });
    soundAlert.setPendingCount(currentPending.length);

    if (currentPending.length > 0) {
      soundAlert.startContinuousAlert();
    } else {
      soundAlert.stopContinuousAlert();
    }
  }, [orders, soundEnabled, settings]);

  const loadData = async () => {
    try {
      // Auto-finalização por tempo de pedidos despachados há mais de 2 horas (Fallback Inteligente)
      if (isSupabaseConfigured() && supabase) {
        try {
          const activeTenantId = localStorage.getItem("current_tenant_id");
          await supabase.rpc("auto_deliver_stale_orders", {
            p_tenant_id: activeTenantId || null,
            p_timeout_hours: 2
          });
        } catch (_errAuto) {}
      }

      const [ordersData, settingsData, productsData] = await Promise.all([
        Order.list("-created_date", 250),
        Settings.list(),
        Product.list().catch(() => [])
      ]);
      const safeOrders = Array.isArray(ordersData) ? ordersData : [];
      setOrders(safeOrders);
      setProducts(Array.isArray(productsData) ? productsData : []);

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
      const ordersData = await Order.list("-created_date", 250);
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
      const updatePayload = { status: newStatus };
      if (newStatus === "enviado") {
        updatePayload.dispatched_at = new Date().toISOString();
      } else if (newStatus === "entregue") {
        updatePayload.delivered_at = new Date().toISOString();
      }

      setOrders(prev => {
        const next = prev.map(o => o.id === orderId ? { ...o, ...updatePayload } : o);
        const remainingPending = next.filter(o => o.status === 'pendente');
        soundAlert.setPendingCount(remainingPending.length);
        return next;
      });
      await Order.update(orderId, updatePayload);
      const statusLabel =
        newStatus === "confirmado" ? "confirmado" :
        newStatus === "cancelado" ? "cancelado" :
        newStatus === "preparando" ? "em preparo" :
        newStatus === "enviado" ? "enviado" :
        newStatus === "entregue" ? "entregue" : newStatus;
      toast.success(`Pedido #${String(orderId).slice(-4).toUpperCase()} marcado como ${statusLabel}!`);

      if (
        !cashSession.isCashDrawerOpen &&
        ["confirmado", "preparando", "enviado", "entregue"].includes(newStatus)
      ) {
        toast.info("Caixa fechado: o pedido ficará aguardando abertura do turno para entrar na gaveta.");
      }

      // O cashback ganho pelo cliente SOMENTE é liberado na carteira quando o pedido for concluído ("entregue")
      if (newStatus === "entregue") {
        try {
          if (isSupabaseConfigured() && supabase) {
            const { data: cbResult } = await supabase.rpc("process_order_cashback", {
              p_order_id: String(orderId),
              p_action: "credit_only"
            });
            if (cbResult && Number(cbResult.credited_now || 0) > 0) {
              toast.info(`🎁 R$ ${Number(cbResult.credited_now).toFixed(2).replace('.', ',')} de cashback liberado para o cliente!`);
            }
          }
        } catch (cbErr) {
          console.warn("Erro ao processar cashback do pedido entregue:", cbErr);
        }
      }
      await loadOrdersOnly();
      cashSession.refreshCashSession();
    } catch (err) {
      console.error("Erro ao atualizar status do pedido:", err);
      toast.error(err?.message || "Erro ao atualizar status do pedido. Tente novamente.");
      loadOrdersOnly();
    }
  };

  const handleOrderStatusClick = (orderId, newStatus) => {
    if (newStatus === "cancelado") {
      const target = orders.find((o) => o.id === orderId);
      if (target) {
        setCancellingOrder(target);
        return;
      }
    }
    updateOrderStatus(orderId, newStatus);
  };

  const handleConfirmCancelOrder = async ({
    orderId,
    cancelReason,
    refundPix,
    refundPixAmount,
    revertCashback,
    mpAccessToken: _mpAccessToken
  }) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    let pixRefundStatus = targetOrder.pix_refund_status || "none";
    let pixRefundId = targetOrder.pix_refund_id || null;
    let pixRefundAmountDone = 0;

    // 1. Estorno do PIX Online Mercado Pago (o token é resolvido de forma segura no servidor)
    if (refundPix && targetOrder.mp_payment_id) {
      const targetRefundAmt = refundPixAmount || targetOrder.total_amount || targetOrder.total;
      const refundIdempotencyKey = `refund_${targetOrder.id}_${targetOrder.mp_payment_id}_${Number(targetRefundAmt || 0).toFixed(2)}`;
      try {
        const refundRes = await refundPixPayment({
          paymentId: targetOrder.mp_payment_id,
          amount: targetRefundAmt,
          orderId: targetOrder.id,
          tenantId: targetOrder.tenant_id || tenant?.id,
          idempotencyKey: refundIdempotencyKey,
        });

        if (refundRes.success) {
          pixRefundStatus = "refunded";
          pixRefundId = String(refundRes.refundId || "");
          pixRefundAmountDone = Number(refundPixAmount || targetOrder.total_amount || targetOrder.total);
          toast.success(`✓ Pix de R$ ${pixRefundAmountDone.toFixed(2).replace('.', ',')} estornado com sucesso ao cliente!`);
        } else {
          pixRefundStatus = "failed";
          toast.error(`Aviso Mercado Pago: ${refundRes.error}. Faça o estorno manual pelo app.`);
        }
      } catch (err) {
        console.error("Erro ao estornar PIX:", err);
        pixRefundStatus = "failed";
        toast.error("Erro ao conectar com Mercado Pago para estorno.");
      }
    }

    // 2. Reversão atômica de Cashback via RPC
    if (revertCashback && isSupabaseConfigured() && supabase) {
      try {
        const { data: revData, error: revErr } = await supabase.rpc("revert_order_cashback", {
          p_order_id: String(orderId)
        });

        if (!revErr && revData) {
          if (Number(revData.cashback_refunded || 0) > 0) {
            toast.success(`🪙 R$ ${Number(revData.cashback_refunded).toFixed(2).replace('.', ',')} de saldo de cashback devolvido à carteira do cliente.`);
          }
          if (Number(revData.cashback_reversed || 0) > 0) {
            toast.info(`Bônus de cashback de R$ ${Number(revData.cashback_reversed).toFixed(2).replace('.', ',')} revogado.`);
          }
        }
      } catch (cbErr) {
        console.warn("Erro ao reverter cashback:", cbErr);
      }
    }

    // 3. Atualizar status e dados do cancelamento na tabela orders
    const nowIso = new Date().toISOString();
    const updatePayload = {
      status: "cancelado",
      cancel_reason: cancelReason,
      cancelled_at: nowIso,
      ...(refundPix && targetOrder.mp_payment_id
        ? {
            pix_refund_status: pixRefundStatus,
            pix_refund_id: pixRefundId,
            pix_refund_amount: pixRefundAmountDone,
            ...(pixRefundStatus === "refunded" ? { payment_status: "refunded" } : {}),
          }
        : {}),
    };

    setOrders((prev) => {
      const next = prev.map((o) => (o.id === orderId ? { ...o, ...updatePayload } : o));
      const remainingPending = next.filter((o) => o.status === "pendente");
      soundAlert.setPendingCount(remainingPending.length);
      return next;
    });

    try {
      await Order.update(orderId, updatePayload);
      toast.success(`Pedido #${String(orderId).slice(-4).toUpperCase()} cancelado com sucesso.`);
      await loadOrdersOnly();
      cashSession.refreshCashSession();
    } catch (err) {
      console.error("Erro ao salvar cancelamento:", err);
      toast.error("Erro ao persistir cancelamento do pedido.");
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

  const getStatusText = (status) => getOrderStatusMeta(status).label;

  // Mapa rápido de fotos de produtos (por ID e por nome) para exibir miniaturas nos itens
  const productImageMap = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    for (const p of products || []) {
      if (!p?.image_url) continue;
      if (p.id) byId.set(p.id, p.image_url);
      if (p.name) byName.set(String(p.name).trim().toLowerCase(), p.image_url);
    }
    return { byId, byName };
  }, [products]);

  // Regras configuráveis de roteamento na esteira de Pedidos (Kanban)
  const showDineInInKanban = useMemo(() => {
    if (settings?.kanban_show_dine_in !== undefined) return Boolean(settings.kanban_show_dine_in);
    return Boolean(settings?.payment_methods?.kanban_show_dine_in);
  }, [settings]);

  const showPosInKanban = useMemo(() => {
    if (settings?.kanban_show_pos !== undefined) return Boolean(settings.kanban_show_pos);
    return Boolean(settings?.payment_methods?.kanban_show_pos);
  }, [settings]);

  // Mantém pedidos do turno aberto (e todos em andamento) respeitando a configuração de canais do Kanban
  const timeFilteredOrders = React.useMemo(() => {
    return (orders || [])
      .filter((o) => o.status !== "aguardando_pagamento")
      .filter((o) => isOrderInCurrentShift(o, settings))
      .filter((o) => {
        const ch = getOrderChannelMeta(o);
        if (ch.kind === "dine_in" && !showDineInInKanban) {
          return false;
        }
        const isPosSale = ch.kind === "pickup" && o.payment_status === "paid" && o.payment_method !== "pix_online";
        if (isPosSale && !showPosInKanban) {
          return false;
        }
        return true;
      });
  }, [orders, settings, showDineInInKanban, showPosInKanban]);

  const filteredOrders = React.useMemo(() => {
    if (activeTab === "all") return timeFilteredOrders;
    if (activeTab === "preparando") {
      return timeFilteredOrders
        .filter((order) => order.status === "preparando" || order.status === "pronto")
        .sort((a, b) => {
          if (a.status === "pronto" && b.status !== "pronto") return -1;
          if (b.status === "pronto" && a.status !== "pronto") return 1;
          return 0;
        });
    }
    return timeFilteredOrders.filter(order => order.status === activeTab);
  }, [timeFilteredOrders, activeTab]);

  const readyCount = timeFilteredOrders.filter((o) => o.status === "pronto").length;

  const statusCounts = {
    all: timeFilteredOrders.length,
    pendente: timeFilteredOrders.filter(o => o.status === "pendente").length,
    confirmado: timeFilteredOrders.filter(o => o.status === "confirmado").length,
    preparando: timeFilteredOrders.filter(o => o.status === "preparando" || o.status === "pronto").length,
    enviado: timeFilteredOrders.filter(o => o.status === "enviado").length,
    entregue: timeFilteredOrders.filter(o => o.status === "entregue").length,
    cancelado: timeFilteredOrders.filter(o => o.status === "cancelado").length,
  };

  // Mantém um pedido selecionado automaticamente ao trocar aba ou atualizar lista
  useEffect(() => {
    if (filteredOrders.length === 0) {
      setSelectedOrderId(null);
      setMobileDetailOpen(false);
      return;
    }

    const stillVisible = selectedOrderId && filteredOrders.some((o) => o.id === selectedOrderId);
    if (!stillVisible && !detailDismissedRef.current) {
      setSelectedOrderId(filteredOrders[0].id);
    }
  }, [filteredOrders, selectedOrderId]);

  const selectedOrder = useMemo(
    () => filteredOrders.find((o) => o.id === selectedOrderId) || null,
    [filteredOrders, selectedOrderId]
  );

  const handleSelectOrder = (order) => {
    detailDismissedRef.current = false;
    setSelectedOrderId(order.id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileDetailOpen(true);
    }
  };

  const handleTabChange = (tabId) => {
    detailDismissedRef.current = false;
    setActiveTab(tabId);
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
    <div className="p-3 md:p-4 lg:px-6 lg:py-4 bg-[#F7F9F8] min-h-screen">
      <div className="max-w-[1400px] mx-auto space-y-3.5">
        {/* Cabeçalho da Página com Título e Cards de Ações Rápidas */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-950 tracking-tight leading-tight">Pedidos</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Gerencie e acompanhe todos os pedidos do seu restaurante.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Card 1: Entrega média */}
            <div className="h-11 bg-white border border-stone-200 rounded-xl px-3 flex items-center gap-2.5 shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                <Clock className="w-3.5 h-3.5 text-stone-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-stone-400 font-medium leading-none">Entrega média</p>
                {!isEditingTime ? (
                  <p className="text-xs font-bold text-stone-900 leading-tight mt-0.5 whitespace-nowrap">
                    {deliveryTime}
                  </p>
                ) : (
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      type="text"
                      value={customTimeInput}
                      onChange={(e) => setCustomTimeInput(e.target.value)}
                      placeholder="60–80 min"
                      className="bg-stone-100 text-xs px-2 py-0.5 rounded-md w-20 border border-stone-300 outline-none font-bold"
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
                      className="bg-stone-200 text-stone-600 p-0.5 rounded text-xs cursor-pointer"
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
                  className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-md transition-colors cursor-pointer"
                  title="Alterar tempo médio"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Card 2: Alarme Sonoro (Ativar / Silenciar) */}
            <button
              type="button"
              onClick={handleToggleSound}
              className={`h-11 border rounded-xl px-3 flex items-center gap-2.5 shadow-2xs transition-all cursor-pointer text-left ${
                soundEnabled
                  ? "bg-emerald-50/90 border-emerald-200 text-emerald-950 hover:bg-emerald-100/80"
                  : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
              }`}
              title={soundEnabled ? "Alarme sonoro ativo (toque para silenciar)" : "Alarme silenciado (toque para ativar)"}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  soundEnabled ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-400"
                }`}
              >
                {soundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
              </div>
              <div>
                <p className="text-[10px] text-stone-400 font-medium leading-none">Alarme</p>
                <p
                  className={`text-xs font-bold leading-tight mt-0.5 whitespace-nowrap ${
                    soundEnabled ? "text-emerald-800" : "text-stone-600"
                  }`}
                >
                  {soundEnabled ? "Som Ativo" : "Silenciado"}
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Status do Caixa e Alerta de Pedidos Online Aguardando Turno */}
        {(!cashSession.isCashDrawerOpen || cashSession.orphanOrders.length > 0) && (
          <CashSessionBanner
            isLoading={cashSession.isLoadingSession}
            isCashDrawerOpen={cashSession.isCashDrawerOpen}
            cashDrawerInfo={cashSession.cashDrawerInfo}
            orphanOrders={cashSession.orphanOrders}
            onOpenCashClick={() => setShowOpenCashModal(true)}
            onAttachOrphans={cashSession.attachOrphans}
            compactWhenOpenWithoutOrphans={false}
          />
        )}

        {/* Abas de Status dos Pedidos (Barra Segmentada Arredondada igual à Referência) */}
        <div className="w-full bg-white border border-gray-200/90 rounded-2xl shadow-2xs overflow-hidden">
          <div className="flex items-stretch overflow-x-auto scrollbar-hide divide-x divide-gray-200/70">
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
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex-1 min-w-[130px] px-4 py-2.5 flex items-center justify-center gap-2 text-xs transition-colors shrink-0 cursor-pointer select-none border-b-2 ${
                    isActive
                      ? "bg-white font-bold text-gray-950 border-b-[#16a34a]"
                      : "bg-white font-medium text-gray-600 hover:text-gray-950 hover:bg-gray-50/70 border-b-transparent"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-[#16a34a]" : "text-gray-400"}`} />
                  <span>{tab.label}</span>
                  {tab.id !== "cancelado" && (
                    <>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full min-w-[24px] text-center font-bold ${
                          isActive
                            ? "bg-[#DCFCE7] text-[#15803d] border border-[#86EFAC]/80"
                            : "bg-gray-100 text-gray-600 font-semibold"
                        }`}
                      >
                        {tab.count}
                      </span>
                      {tab.id === "preparando" && readyCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
                          {readyCount} {readyCount === 1 ? "pronto" : "prontos"}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Layout Mestre-Detalhe (Lista à esquerda + Painel do Pedido à direita) */}
        {filteredOrders.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Lista Compacta em Tabela */}
            <div className="lg:col-span-6 space-y-3">
              <div className="bg-white border border-gray-200/90 rounded-2xl shadow-2xs overflow-hidden">
                {/* Cabeçalho da Tabela */}
                <div className="hidden sm:grid sm:grid-cols-12 gap-3 px-5 py-3 border-b border-gray-100 text-xs font-semibold text-gray-500 bg-white">
                  <div className="col-span-5">Pedido / Cliente</div>
                  <div className="col-span-2">Itens</div>
                  <div className="col-span-3">Origem</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>

                {/* Linhas de Pedidos */}
                <div className="divide-y divide-gray-100">
                  {filteredOrders.map((order) => {
                    const isSelected = selectedOrderId === order.id;
                    const isReady = order.status === "pronto";
                    const d = safeDate(order.created_date);
                    const total = Number(order.total_amount ?? order.total ?? 0);
                    const channel = getOrderChannelMeta(order);
                    const itemsCount = getTotalItemsCount(order.items);
                    const cashbackEarned = Number(order.cashback_earned || 0);

                    return (
                      <div
                        key={order.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectOrder(order)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSelectOrder(order);
                          }
                        }}
                        className={`px-5 py-3.5 transition-colors cursor-pointer select-none border-l-4 ${
                          isSelected
                            ? isReady
                              ? "bg-emerald-50/90 border-l-[#16a34a]"
                              : "bg-[#ECFDF5]/75 border-l-[#16a34a]"
                            : isReady
                            ? "bg-amber-50/75 hover:bg-amber-100/60 border-l-amber-500"
                            : "bg-white hover:bg-gray-50/80 border-l-transparent"
                        }`}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                          {/* Col 1: Pedido / Cliente / Horário */}
                          <div className="sm:col-span-5 flex items-center gap-3 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${channel.iconBoxClass}`}
                            >
                              <ChannelIcon kind={channel.kind} className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-bold text-gray-950 leading-tight truncate">
                                  #{String(order.id).slice(-6).toUpperCase()}
                                </p>
                                {isReady && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#15803d] text-white leading-none shrink-0">
                                    ✓ Pronto
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 mt-0.5 truncate">
                                {order.customer_name || "Cliente"}
                              </p>
                              <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
                                {d ? format(d, "dd/MM 'às' HH:mm", { locale: ptBR }) : "-"}
                              </p>
                            </div>
                          </div>

                          {/* Col 2: Itens */}
                          <div className="hidden sm:block sm:col-span-2 text-xs font-medium text-gray-700 whitespace-nowrap">
                            {itemsCount} {itemsCount === 1 ? "item" : "itens"}
                          </div>

                          {/* Col 3: Origem + Cashback */}
                          <div className="sm:col-span-3 flex sm:flex-col items-center sm:items-start justify-between sm:justify-center gap-1.5 min-w-0">
                            <div className="flex flex-col items-start gap-1 min-w-0">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${channel.pillClass}`}
                              >
                                <ChannelIcon kind={channel.kind} className="w-3 h-3 shrink-0" />
                                <span className="truncate max-w-[125px]">{channel.shortLabel}</span>
                              </span>
                              {cashbackEarned > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-lime-50 text-lime-800 border border-lime-200/80">
                                  <Star className="w-2.5 h-2.5 fill-lime-500/30 text-lime-600 shrink-0" />
                                  +R$ {safeMoney(cashbackEarned)} cashback
                                </span>
                              )}
                            </div>

                            <div className="sm:hidden text-right shrink-0">
                              <span className="block text-[11px] text-gray-500">
                                {itemsCount} {itemsCount === 1 ? "item" : "itens"}
                              </span>
                              <span className="text-sm font-black text-gray-950 tabular-nums whitespace-nowrap">
                                R$ {safeMoney(total)}
                              </span>
                            </div>
                          </div>

                          {/* Col 4: Total */}
                          <div className="hidden sm:block sm:col-span-2 text-right text-sm font-black text-gray-950 tabular-nums whitespace-nowrap">
                            R$ {safeMoney(total)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Painel Lateral Fixo de Detalhes (Desktop) */}
            <div className="hidden lg:block lg:col-span-6 lg:sticky lg:top-3">
              <OrderDetailPanel
                order={selectedOrder}
                deliveryTime={deliveryTime}
                productImageMap={productImageMap}
                safeDate={safeDate}
                safeMoney={safeMoney}
                onUpdateStatus={handleOrderStatusClick}
                onRequestCancel={(ord) => setCancellingOrder(ord)}
                onPrint={manualPrintOrder}
                onClose={() => {
                  detailDismissedRef.current = true;
                  setSelectedOrderId(null);
                }}
              />
            </div>
          </div>
        ) : (
          !isLoading && (
            <div className="text-center py-16 md:py-24 px-4">
              <EmptyOrdersIllustration className="w-72 sm:w-80 h-44 sm:h-48 mx-auto" />

              <h3 className="text-2xl font-black text-gray-950 mt-6 tracking-tight">
                Nenhum pedido encontrado
              </h3>
              <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto font-normal">
                {activeTab === "all"
                  ? "Não há pedidos no período selecionado."
                  : `Não há pedidos com o status "${getStatusText(activeTab)}" no período selecionado.`}
              </p>

              <button
                type="button"
                onClick={() => {
                  loadOrdersOnly();
                  toast.info("Atualizando pedidos...");
                }}
                className="bg-[#047857] hover:bg-[#065f46] text-white font-bold rounded-xl px-7 py-3 text-sm shadow-sm flex items-center gap-2 mx-auto mt-6 transition-all active:scale-95 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Atualizar pedidos</span>
              </button>
            </div>
          )
        )}

        {/* Drawer de Detalhes no Mobile / Tablet */}
        <Sheet open={mobileDetailOpen && Boolean(selectedOrder)} onOpenChange={setMobileDetailOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-lg p-3 bg-[#F7F9F8] overflow-y-auto [&>button:first-child]:hidden"
          >
            <OrderDetailPanel
              order={selectedOrder}
              deliveryTime={deliveryTime}
              productImageMap={productImageMap}
              safeDate={safeDate}
              safeMoney={safeMoney}
              onUpdateStatus={handleOrderStatusClick}
              onRequestCancel={(ord) => {
                setMobileDetailOpen(false);
                setCancellingOrder(ord);
              }}
              onPrint={manualPrintOrder}
              onClose={() => setMobileDetailOpen(false)}
            />
          </SheetContent>
        </Sheet>

        {/* Modal Profissional de Cancelamento de Pedido com Estorno Pix e Cashback */}
        <CancelOrderModal
          open={Boolean(cancellingOrder)}
          onOpenChange={(isOpen) => {
            if (!isOpen) setCancellingOrder(null);
          }}
          order={cancellingOrder}
          tenant={tenant || settings}
          settings={settings}
          onConfirmCancel={handleConfirmCancelOrder}
        />

        {/* Modal de Abertura Rápida de Caixa em 1 Clique */}
        <OpenCashModal
          isOpen={showOpenCashModal}
          onClose={() => setShowOpenCashModal(false)}
          currentOperator={cashSession.cashDrawerInfo?.operator}
          orphanOrders={cashSession.orphanOrders}
          onConfirmOpen={async (payload) => {
            const res = await cashSession.openCashSession(payload);
            await loadOrdersOnly();
            return res;
          }}
        />
      </div>
    </div>
  );
}