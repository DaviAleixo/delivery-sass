import React, { useState, useEffect, useRef, useMemo } from "react";
import { Order } from "@/entities/Order";
import { ProductionSector } from "@/entities/ProductionSector";
import { Product } from "@/entities/Product";
import { Category } from "@/entities/Category";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Printer,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Play,
  MessageSquare,
  Inbox,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  UtensilsCrossed,
  Bike,
  Store,
  Undo2,
  Check,
  LogOut,
  Copy,
  ExternalLink,
  Layers,
  Link2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useTenant } from "@/lib/TenantContext";
import { invalidateCache } from "@/entities/storage";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { createPageUrl } from "@/utils";
import { useOrdersRealtime } from "@/hooks/useOrdersRealtime";
import { isRealtimeChannelActive } from "@/lib/realtimeHub";
import { useFifoPrintQueue } from "@/hooks/useFifoPrintQueue";
import {
  findSectorByParam,
  filterOrderItemsForSector,
  buildSectorKdsLinks,
  getDefaultKdsFallbackSector,
  normalizeOrderChannel,
  parseOrderItems,
  resolveItemSector,
} from "@/utils/sectorUtils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Som de sino de cozinha sintético via Web Audio API (sem arquivos externos)
const playKitchenChime = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "triangle";

    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc2.frequency.setValueAtTime(1760, ctx.currentTime); // A6

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 1.2);
    osc2.stop(ctx.currentTime + 1.2);
  } catch (_e) {}
};

// Componente do Cronômetro de Cozinha (Priorização Visual por Urgência em Fundo Claro)
function KDSTimer({ createdAt, isReady = false }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!createdAt) return;
    const start = new Date(createdAt).getTime();

    const update = () => {
      const now = Date.now();
      setElapsed(Math.max(0, Math.floor((now - start) / 1000)));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  if (isReady) {
    return (
      <div className="px-2.5 py-1 rounded-lg border font-mono font-bold text-xs tabular-nums flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border-emerald-200/90">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>Pronto há {minutes}m</span>
      </div>
    );
  }

  // 3 Níveis Claros de Urgência Operacional:
  // Normal (<15 min) | Atenção (15 a 25 min) | Crítico (>25 min)
  let badgeStyle = "bg-stone-100 text-stone-700 border-stone-200";
  if (minutes >= 25) {
    badgeStyle = "bg-rose-600 text-white border-rose-600 shadow-xs";
  } else if (minutes >= 15) {
    badgeStyle = "bg-amber-50 text-amber-800 border-amber-300";
  }

  return (
    <div className={`px-2.5 py-1 rounded-lg border font-mono font-bold text-xs tabular-nums flex items-center gap-1.5 ${badgeStyle}`}>
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>{formatted}</span>
      {minutes >= 25 && (
        <span className="text-[10px] font-sans font-extrabold uppercase tracking-wide bg-white/20 px-1.5 py-0.2 rounded">
          Atraso
        </span>
      )}
    </div>
  );
}

export default function KDSPage() {
  const { slug } = useParams();
  const [orders, setOrders] = useState([]);
  const [productionSectors, setProductionSectors] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [copiedSectorId, setCopiedSectorId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [channelFilter, setChannelFilter] = useState("all"); // "all" | "mesa" | "delivery" | "balcao"
  const [isFullscreen, setIsFullscreen] = useState(false);
  const knownIdsRef = useRef(new Set());

  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { tenant } = useTenant();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isKioskParam = searchParams.get("kiosk") === "true" || searchParams.get("mode") === "kiosk";
  const sectorParam = searchParams.get("sector") || "";

  const kdsSectors = useMemo(() => {
    return (Array.isArray(productionSectors) ? productionSectors : [])
      .filter((s) => s.is_active !== false && s.operation_mode !== "print_only")
      .sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
  }, [productionSectors]);

  const defaultKdsFallbackSector = useMemo(
    () => getDefaultKdsFallbackSector(productionSectors),
    [productionSectors]
  );

  const selectedSector = useMemo(() => {
    return findSectorByParam(productionSectors, sectorParam);
  }, [productionSectors, sectorParam]);

  const sectorLookup = useMemo(
    () => ({
      sectors: productionSectors,
      products,
      categories,
      fallbackSectorId: defaultKdsFallbackSector?.id || null,
    }),
    [productionSectors, products, categories, defaultKdsFallbackSector]
  );
  const selectedSectorRef = useRef(null);
  const sectorLookupRef = useRef(sectorLookup);
  useEffect(() => {
    selectedSectorRef.current = selectedSector;
    sectorLookupRef.current = sectorLookup;
  }, [selectedSector, sectorLookup]);

  const selectSectorFilter = (sector) => {
    const next = new URLSearchParams(location.search);
    if (sector) {
      next.set("sector", sector.slug || sector.id);
    } else {
      next.delete("sector");
    }
    const qs = next.toString();
    navigate(`${location.pathname}${qs ? `?${qs}` : ""}`, { replace: true });
  };

  const handleCopySectorLink = async (sector) => {
    const { absoluteUrl } = buildSectorKdsLinks(slug, sector, { kiosk: true });
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopiedSectorId(sector ? sector.id : "__all__");
      toast.success(
        sector
          ? `Link KDS do setor "${sector.name}" copiado!`
          : "Link KDS Geral copiado!"
      );
      setTimeout(() => setCopiedSectorId(null), 2000);
    } catch {
      toast.info(absoluteUrl);
    }
  };

  const storedUser = useMemo(() => {
    try {
      const raw = localStorage.getItem("admin_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const isKitchenOnly = Boolean(
    storedUser &&
    Array.isArray(storedUser.permissions) &&
    storedUser.permissions.length === 1 &&
    storedUser.permissions[0] === "KDS"
  );

  const isKiosk = isKioskParam || isKitchenOnly;
  const isLockedSectorView = isKiosk && Boolean(sectorParam);
  const hasInvalidSectorParam = Boolean(sectorParam) && (!selectedSector || selectedSector.is_active === false);

  // Relógio digital em tempo real
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = useMemo(() => {
    return currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }, [currentTime]);

  const formattedDate = useMemo(() => {
    return currentTime.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  }, [currentTime]);

  const handleLogout = async () => {
    try {
      if (logout) await logout();
      localStorage.removeItem("admin_auth");
      localStorage.removeItem("admin_user");
      navigate(createPageUrl("AdminLogin"));
    } catch (_e) {
      window.location.href = "/login";
    }
  };

  // Fila Sequencial de Impressão FIFO tolerante a quedas de internet
  const {
    queue: printQueue,
    autoPrintEnabled,
    setAutoPrintEnabled,
    enqueueOrders,
    manualPrintOrder,
  } = useFifoPrintQueue();

  // WebSocket Realtime Instantâneo com Reconciliação Automática
  useOrdersRealtime({
    tenantId: tenant?.id || undefined,
    onInsert: (newOrder) => {
      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });

      const statusNorm = String(newOrder?.status || "").toLowerCase().trim();
      if (!["pendente", "confirmado", "preparando"].includes(statusNorm)) {
        return;
      }

      enqueueOrders([newOrder]);

      const activeSector = selectedSectorRef.current;
      const relevantItems =
        activeSector && activeSector.content_mode !== "full_ticket"
          ? filterOrderItemsForSector(newOrder, activeSector, sectorLookupRef.current)
          : parseOrderItems(newOrder);

      if (activeSector && activeSector.content_mode !== "full_ticket" && relevantItems.length === 0) {
        return;
      }

      if (soundEnabled) {
        playKitchenChime();
      }

      const num = String(newOrder.id).slice(-4).toUpperCase();
      toast.success(
        activeSector
          ? `🍳 Novo Pedido #${num} — ${activeSector.name}`
          : `🍳 Novo Pedido #${num} na cozinha!`,
        {
          description: `${relevantItems.length} item(ns) a preparar`,
          duration: 5000,
        }
      );
    },
    onUpdate: (updatedOrder) => {
      let becameActiveFromPayment = false;
      setOrders((prev) => {
        const existing = prev.find((o) => o.id === updatedOrder.id);
        if (
          existing?.status === "aguardando_pagamento" &&
          ["pendente", "confirmado", "preparando"].includes(String(updatedOrder.status || "").toLowerCase().trim())
        ) {
          becameActiveFromPayment = true;
        }
        if (!existing) {
          return [updatedOrder, ...prev];
        }
        return prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o));
      });
      if (becameActiveFromPayment) {
        const activeSector = selectedSectorRef.current;
        const relevantItems =
          activeSector && activeSector.content_mode !== "full_ticket"
            ? filterOrderItemsForSector(updatedOrder, activeSector, sectorLookupRef.current)
            : parseOrderItems(updatedOrder);
        if (!(activeSector && activeSector.content_mode !== "full_ticket" && relevantItems.length === 0)) {
          if (soundEnabled) playKitchenChime();
          const num = String(updatedOrder.id).slice(-4).toUpperCase();
          toast.success(
            activeSector ? `💰 Pedido #${num} liberado — ${activeSector.name}` : `💰 Pedido #${num} liberado na cozinha!`,
            { duration: 5000 }
          );
        }
      }
      if (
        updatedOrder &&
        updatedOrder.print_status !== "printed" &&
        ["confirmado", "preparando"].includes(updatedOrder.status)
      ) {
        enqueueOrders([updatedOrder]);
      }
    },
    onDelete: (deletedOrder) => {
      setOrders((prev) => prev.filter((o) => o.id !== deletedOrder.id));
    },
    onReconnected: () => {
      loadOrders();
    },
  });

  useEffect(() => {
    loadOrders();
    const activeTenantId = tenant?.id || (typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null);
    const rtFilter = activeTenantId ? `tenant_id=eq.${activeTenantId}` : null;
    let tickCount = 0;

    // Quando Realtime está ativo, reduz fallback para 60s apenas em aba visível
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      tickCount += 1;
      if (rtFilter && isRealtimeChannelActive("orders", rtFilter) && tickCount % 2 !== 0) return;
      loadOrders();
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadOrders();
      }
    };
    const handleOnline = () => {
      loadOrders();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", loadOrders);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", loadOrders);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [tenant?.id]);

  const handleManualRefresh = () => {
    invalidateCache("orders");
    invalidateCache("production_sectors");
    invalidateCache("products");
    invalidateCache("categories");
    loadOrders();
  };

  const loadOrders = async () => {
    try {
      const [data, secs, prods, cats] = await Promise.all([
        Order.list("-created_date", 80),
        ProductionSector.list("order_index").catch(() => []),
        Product.list().catch(() => []),
        Category.list("order_index").catch(() => []),
      ]);
      const safe = Array.isArray(data) ? data : [];
      setOrders(safe);
      setProductionSectors(Array.isArray(secs) ? secs : []);
      setProducts(Array.isArray(prods) ? prods : []);
      setCategories(Array.isArray(cats) ? cats : []);
      knownIdsRef.current = new Set(safe.map((o) => o.id));
    } catch (_err) {
      console.error("Erro ao carregar pedidos no KDS:", _err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    const updatePayload = { status: newStatus };
    if (newStatus === "entregue") {
      updatePayload.delivered_at = new Date().toISOString();
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, ...updatePayload } : o))
    );

    try {
      await Order.update(orderId, updatePayload);
      const num = String(orderId).slice(-4).toUpperCase();
      if (newStatus === "entregue") {
        toast.success(`Pedido #${num} finalizado como entregue!`);
        try {
          if (isSupabaseConfigured() && supabase) {
            const { data: cbResult } = await supabase.rpc("process_order_cashback", {
              p_order_id: String(orderId),
              p_action: "credit_only",
            });
            if (cbResult && Number(cbResult.credited_now || 0) > 0) {
              toast.info(`🎁 R$ ${Number(cbResult.credited_now).toFixed(2).replace(".", ",")} de cashback liberado para o cliente!`);
            }
          }
        } catch (cbErr) {
          console.warn("Erro ao processar cashback do pedido entregue no KDS:", cbErr);
        }
      } else {
        toast.success(`Pedido #${num} atualizado para "${newStatus}"`);
      }
    } catch (_err) {
      toast.error("Erro ao atualizar status");
      loadOrders();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Filtragem de pedidos ativos na cozinha (por status, setor e canal)
  // Todos os canais fluem para o KDS, respeitando kds_show_dine_in e separados por setor.
  const kdsShowDineIn = useMemo(() => {
    if (tenant?.kds_show_dine_in !== undefined) return tenant.kds_show_dine_in !== false;
    return tenant?.payment_methods?.kds_show_dine_in !== false;
  }, [tenant]);

  const activeOrders = useMemo(() => {
    return orders.filter((o) => {
      const normalizedStatus = String(o.status || "").trim().toLowerCase();
      const isKitchenRelevant = ["pendente", "confirmado", "preparando", "pronto"].includes(normalizedStatus);
      if (!isKitchenRelevant) return false;

      if (selectedSector && selectedSector.content_mode !== "full_ticket") {
        const sectorItems = filterOrderItemsForSector(o, selectedSector, sectorLookup);
        if (sectorItems.length === 0) return false;
      }

      const channel = normalizeOrderChannel(o);
      if (channel === "dine_in" && !kdsShowDineIn) {
        return false;
      }
      if (channelFilter === "mesa") {
        return channel === "dine_in";
      }
      if (channelFilter === "delivery") {
        return channel === "delivery";
      }
      if (channelFilter === "balcao") {
        return channel === "pickup";
      }
      return true;
    });
  }, [orders, channelFilter, selectedSector, sectorLookup, kdsShowDineIn]);

  // Coluna 1: A Preparar (Novos / Confirmados) - Ordenado por FIFO (mais antigo primeiro)
  const todoOrders = useMemo(() => {
    return activeOrders
      .filter((o) => {
        const st = String(o.status || "").trim().toLowerCase();
        return st === "pendente" || st === "confirmado";
      })
      .sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());
  }, [activeOrders]);

  // Coluna 2: Em Preparo (somente status "preparando"; ao marcar pronto vai exclusivamente para a Coluna 3)
  const preparingOrders = useMemo(() => {
    return activeOrders
      .filter((o) => String(o.status || "").trim().toLowerCase() === "preparando")
      .sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());
  }, [activeOrders]);

  // Coluna 3: Expedição & Retirada (Pedidos Prontos aguardando motoboy, garçom ou retirada no balcão)
  const expeditionOrders = useMemo(() => {
    return activeOrders
      .filter((o) => String(o.status || "").trim().toLowerCase() === "pronto")
      .sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());
  }, [activeOrders]);

  // Renderizador do Card de Pedido no KDS (Design Claro Executivo)
  const renderOrderCard = (order) => {
    const channel = normalizeOrderChannel(order);
    const isMesa = channel === "dine_in";
    const isDelivery = channel === "delivery";
    const normalizedStatus = String(order.status || "").trim().toLowerCase();
    const isPreparing = normalizedStatus === "preparando";
    const isReady = normalizedStatus === "pronto";
    const num = String(order.id).slice(-4).toUpperCase();

    const rawTable = String(order.table_number || "").trim();
    const mesaLabel = rawTable
      ? /^mesa\b/i.test(rawTable)
        ? rawTable
        : `Mesa ${rawTable}`
      : "Mesa";

    const orderCreatedAt = order.created_date ? new Date(order.created_date).getTime() : Date.now();
    const minutesDelayed = Math.floor((Date.now() - orderCreatedAt) / 60000);
    const isUrgent = minutesDelayed >= 25 && !isReady;
    const isWarning = minutesDelayed >= 15 && !isUrgent && !isReady;
    const visibleItems =
      selectedSector && selectedSector.content_mode !== "full_ticket"
        ? filterOrderItemsForSector(order, selectedSector, sectorLookup)
        : parseOrderItems(order);

    return (
      <motion.div
        key={order.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className={cn(
          "bg-white rounded-2xl border transition-all duration-150 shadow-sm hover:shadow-md flex flex-col justify-between select-none relative overflow-hidden",
          isReady
            ? "border-emerald-300/90 ring-1 ring-emerald-500/15"
            : isUrgent
            ? "border-stone-200 border-l-4 border-l-rose-500"
            : isWarning
            ? "border-stone-200 border-l-4 border-l-amber-400"
            : isPreparing
            ? "border-stone-200 border-l-4 border-l-blue-500"
            : "border-stone-200 border-l-4 border-l-amber-500"
        )}
      >
        {/* Banner Superior Exclusivo da Coluna de Prontos */}
        {isReady && (
          <div className="bg-[#047857] text-white px-4 py-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
              {selectedSector ? `Pronto • ${selectedSector.name}` : "Pedido Pronto"}
            </span>
            <span className="text-[10px] font-bold text-emerald-50 bg-[#036348] px-2 py-0.5 rounded-md">
              {isDelivery ? "Aguardando Motoboy" : isMesa ? "Pronto p/ Servir" : "Aguardando Retirada"}
            </span>
          </div>
        )}

        <div className="p-4 flex-1 flex flex-col justify-between space-y-3.5">
          <div>
            {/* Topo do Card: Número do Pedido, Canal e Cronômetro */}
            <div className="pb-3 border-b border-stone-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-lg font-black font-mono tracking-tight text-stone-900 tabular-nums">
                    #{num}
                  </span>

                  {isMesa ? (
                    <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[11px] font-bold px-2 py-0.5 gap-1 rounded-md shadow-none">
                      <UtensilsCrossed className="w-3 h-3 text-emerald-600" />
                      <span>{mesaLabel}</span>
                    </Badge>
                  ) : isDelivery ? (
                    <Badge className="bg-sky-50 text-sky-800 border border-sky-200/80 text-[11px] font-bold px-2 py-0.5 gap-1 rounded-md shadow-none">
                      <Bike className="w-3 h-3 text-sky-600" />
                      <span>Delivery</span>
                    </Badge>
                  ) : (
                    <Badge className="bg-stone-100 text-stone-700 border border-stone-200/90 text-[11px] font-bold px-2 py-0.5 gap-1 rounded-md shadow-none">
                      <Store className="w-3 h-3 text-stone-500" />
                      <span>Balcão</span>
                    </Badge>
                  )}
                </div>

                <KDSTimer createdAt={order.created_date} isReady={isReady} />
              </div>

              <p className="text-xs font-semibold text-stone-700 mt-1.5 truncate">
                {order.customer_name || "Cliente Balcão"}
                {order.customer_phone && (
                  <span className="font-normal text-stone-400 text-[11px] ml-1.5">
                    • {order.customer_phone}
                  </span>
                )}
              </p>
            </div>

            {/* Lista de Itens do Pedido */}
            <div className="py-3 space-y-2.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
              {visibleItems.map((item, idx) => (
                <div key={idx} className="border-b border-stone-100/90 pb-2.5 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <span className="min-w-[28px] h-6 px-1.5 inline-flex items-center justify-center font-mono font-bold text-xs tabular-nums bg-stone-900 text-white rounded-md shrink-0">
                        {item.quantity}x
                      </span>
                      <span className="font-bold text-sm text-stone-900 leading-snug pt-0.5">
                        {item.product_name || item.name}
                      </span>
                    </div>
                    {!selectedSector && (() => {
                      const resolvedName = item.sector_name || resolveItemSector(item, sectorLookup).sectorName;
                      return resolvedName ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200 shrink-0">
                          {resolvedName}
                        </span>
                      ) : null;
                    })()}
                  </div>

                  {/* Adicionais / Complementos */}
                  {item.additionals && item.additionals.length > 0 && (
                    <div className="pl-9 text-xs text-stone-600 space-y-0.5 mt-1 font-medium border-l-2 border-stone-100 ml-3">
                      {item.additionals.map((ad, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="text-emerald-700 font-bold">+</span>
                          <span>{ad.name || ad.title}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Observação por Item */}
                  {item.notes && (
                    <div className="ml-9 mt-1.5 px-2.5 py-1.5 bg-amber-50/90 border border-amber-200/80 rounded-lg text-xs text-amber-950 font-semibold flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <span>Obs: {item.notes}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Observação Geral do Pedido */}
            {order.notes && (
              <div className="mt-1 px-3 py-2 bg-amber-50/90 border border-amber-200/90 rounded-xl text-xs text-amber-950 font-medium flex items-start gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <strong className="font-bold text-amber-900">Obs Geral:</strong> {order.notes}
                </span>
              </div>
            )}
          </div>

          {/* Rodapé do Card com Ações Operacionais */}
          <div className="pt-3 border-t border-stone-100 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => manualPrintOrder(order, selectedSector ? { sectorId: selectedSector.id } : undefined)}
              className="h-10 w-10 border-stone-200 bg-stone-50/70 hover:bg-stone-100 text-stone-600 hover:text-stone-900 rounded-xl shrink-0 cursor-pointer"
              title={selectedSector ? `Reimprimir comanda (${selectedSector.name})` : "Reimprimir comanda"}
            >
              <Printer className="w-4 h-4" />
            </Button>

            {/* Botão de Transição de Status */}
            {normalizedStatus === "pendente" || normalizedStatus === "confirmado" ? (
              <Button
                type="button"
                onClick={() => handleUpdateStatus(order.id, "preparando")}
                className="flex-1 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs h-10 rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Iniciar Preparo</span>
              </Button>
            ) : normalizedStatus === "preparando" ? (
              <Button
                type="button"
                onClick={() => handleUpdateStatus(order.id, "pronto")}
                className="flex-1 bg-[#047857] hover:bg-[#036348] text-white font-bold text-xs h-10 rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider transition-colors"
              >
                <Check className="w-4 h-4 text-white" />
                <span>Marcar Pronto</span>
              </Button>
            ) : (
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                {/* Botão para retornar ao preparo se o cozinheiro clicou por engano */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleUpdateStatus(order.id, "preparando")}
                  className="h-10 px-2.5 rounded-xl border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 text-xs font-semibold cursor-pointer shrink-0"
                  title="Voltar pedido para a etapa de preparo"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </Button>

                {isDelivery ? (
                  <div className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-emerald-50 border border-emerald-200/90 text-[#047857] text-xs font-bold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">Aguardando Motoboy</span>
                  </div>
                ) : (
                  <Button
                    type="button"
                    onClick={() => handleUpdateStatus(order.id, "entregue")}
                    className="flex-1 min-w-0 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs h-10 px-3 rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider transition-colors"
                    title={isMesa ? `Finalizar entrega na ${mesaLabel}` : "Finalizar retirada no balcão"}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">Finalizar Entrega</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] text-stone-900 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#047857] border-t-transparent animate-spin mx-auto" />
          <p className="text-stone-600 font-bold text-sm">Carregando monitor KDS...</p>
        </div>
      </div>
    );
  }

  if (hasInvalidSectorParam) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] text-stone-900 flex items-center justify-center p-8">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 max-w-md w-full text-center space-y-3 shadow-2xs">
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h2 className="text-base font-black text-stone-900">Setor KDS não encontrado ou inativo</h2>
          <p className="text-xs text-stone-500">
            O setor solicitado (<code className="bg-stone-100 px-1.5 py-0.5 rounded">{sectorParam}</code>) não existe ou está desativado nas configurações.
          </p>
          {!isKiosk && (
            <Button
              type="button"
              onClick={() => selectSectorFilter(null)}
              className="bg-stone-900 hover:bg-black text-white text-xs font-bold h-9 px-4 rounded-xl cursor-pointer"
            >
              Ver Todos os Setores
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen bg-[#F7F9F8] text-stone-900 flex flex-col space-y-4",
      isKiosk ? "p-3 sm:p-5" : "p-4 sm:p-6"
    )}>
      {/* Barra Superior do KDS */}
      <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-stone-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50/70 border border-emerald-200/80 p-1 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
            <img
              src="/imgs/mascote.png"
              alt="Mascote PedeMuleke"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-stone-900">
              {selectedSector ? `KDS — ${selectedSector.name}` : "Monitor de Cozinha (KDS)"}
            </h1>
          </div>
        </div>

        {/* Relógio Digital Central (Visível nos links de tela dedicada) */}
        {isKiosk && (
          <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 bg-stone-50 rounded-xl border border-stone-200 shadow-2xs">
            <Clock className="w-4 h-4 text-stone-500" />
            <span className="font-mono font-black text-base text-stone-900 tracking-wider">
              {formattedTime}
            </span>
            <span className="text-xs text-stone-400 font-medium capitalize">
              • {formattedDate}
            </span>
          </div>
        )}

        {/* Controles do KDS */}
        <div className="flex items-center gap-2 flex-wrap">
      
          {/* Botão de Auto-Impressão com Badge de Fila FIFO */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAutoPrintEnabled(!autoPrintEnabled)}
            className={cn(
              "text-xs h-9 px-3 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer font-semibold shadow-2xs",
              autoPrintEnabled
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
            )}
            title={autoPrintEnabled ? "Auto-impressão ATIVADA: novos pedidos imprimem automaticamente" : "Auto-impressão DESATIVADA"}
          >
            <Printer className={cn("w-3.5 h-3.5", autoPrintEnabled ? "text-emerald-700" : "text-stone-500")} />
            <span className="hidden sm:inline">Auto-Imprimir</span>
            {printQueue.length > 0 && (
              <span className="bg-[#047857] text-white text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full">
                {printQueue.length}
              </span>
            )}
          </Button>

          {/* Seletor de Canal (Filtro Rápido) */}
          <div className="flex items-center bg-stone-100 border border-stone-200 rounded-lg p-1 text-xs">
            <button
              onClick={() => setChannelFilter("all")}
              className={cn(
                "px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer",
                channelFilter === "all" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
              )}
            >
              Todos
            </button>
            <button
              onClick={() => setChannelFilter("mesa")}
              className={cn(
                "px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer",
                channelFilter === "mesa" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
              )}
            >
              Mesa
            </button>
            <button
              onClick={() => setChannelFilter("delivery")}
              className={cn(
                "px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer",
                channelFilter === "delivery" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
              )}
            >
              Delivery
            </button>
            <button
              onClick={() => setChannelFilter("balcao")}
              className={cn(
                "px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer",
                channelFilter === "balcao" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
              )}
            >
              Balcão
            </button>
          </div>

          {/* Alarme Sonoro */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="border-stone-200 bg-white text-stone-700 hover:bg-stone-50 text-xs h-9 px-2.5 rounded-lg shadow-2xs cursor-pointer"
            title={soundEnabled ? "Som ativado (clique para silenciar)" : "Som desativado (clique para ativar)"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-700" /> : <VolumeX className="w-4 h-4 text-stone-400" />}
          </Button>

          {/* Tela Cheia */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            className="border-stone-200 bg-white text-stone-700 hover:bg-stone-50 text-xs h-9 px-2.5 rounded-lg shadow-2xs cursor-pointer"
            title="Alternar modo tela cheia"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>

          {/* Atualizar Manual */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            className="border-stone-200 bg-white text-stone-700 hover:bg-stone-50 text-xs h-9 px-2.5 rounded-lg shadow-2xs cursor-pointer"
            title="Atualizar pedidos"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>

          {/* Logout para usuário exclusivo de cozinha */}
          {isKitchenOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs h-9 px-2.5 rounded-lg shadow-2xs cursor-pointer"
              title="Sair da Conta de Cozinha"
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              <span>Sair</span>
            </Button>
          )}
        </div>
      </div>

      {/* Barra Dinâmica de Seções / Setores (oculta nos links exclusivos de setor) */}
      {!isLockedSectorView && (kdsSectors.length > 0 || !isKiosk) && (
        <div className="bg-white rounded-xl px-3.5 py-2.5 border border-stone-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-stone-400" />
              Seções:
            </span>

            <button
              type="button"
              onClick={() => selectSectorFilter(null)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                !selectedSector
                  ? "bg-stone-900 text-white border-stone-900 shadow-2xs"
                  : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
              )}
            >
              Todos
            </button>

            {kdsSectors.map((sec) => {
              const isSelected = selectedSector && String(selectedSector.id) === String(sec.id);
              const secLink = buildSectorKdsLinks(slug, sec, { kiosk: true });
              return (
                <div
                  key={sec.id}
                  className={cn(
                    "inline-flex items-center rounded-lg border transition-all overflow-hidden",
                    isSelected
                      ? "bg-[#047857] text-white border-[#047857] shadow-2xs"
                      : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => selectSectorFilter(sec)}
                    className="px-3 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    {sec.name}
                  </button>
                  {!isKitchenOnly && (
                    <div
                      className={cn(
                        "flex items-center border-l pr-1",
                        isSelected ? "border-white/25" : "border-stone-200"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleCopySectorLink(sec)}
                        className={cn(
                          "p-1.5 cursor-pointer transition-colors",
                          isSelected ? "text-white/90 hover:text-white" : "text-stone-500 hover:text-stone-900"
                        )}
                        title={`Copiar link da seção "${sec.name}" para TV/Tablet`}
                      >
                        {copiedSectorId === sec.id ? (
                          <Check className="w-3.5 h-3.5 text-amber-300" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => window.open(secLink.relativePath, "_blank", "noopener,noreferrer")}
                        className={cn(
                          "p-1.5 cursor-pointer transition-colors",
                          isSelected ? "text-white/90 hover:text-white" : "text-stone-500 hover:text-stone-900"
                        )}
                        title={`Abrir tela KDS de "${sec.name}" em nova aba`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!isKiosk && (
            <div className="flex items-center gap-2 shrink-0">
              {selectedSector && (
                <button
                  type="button"
                  onClick={() => handleCopySectorLink(selectedSector)}
                  className="text-xs font-bold text-sky-700 hover:text-sky-900 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Copiar Link de {selectedSector.name}
                </button>
              )}
              <Link
                to={`${createPageUrl("Settings", slug)}?tab=setores`}
                className="text-xs font-semibold text-stone-600 hover:text-[#047857] underline px-1"
              >
                Configurar Setores
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Grid de 3 Colunas Kanban do KDS (Fundo Claro Executivo) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 flex-1 min-h-0">
        {/* Coluna 1: A Preparar (Fila de Entrada) */}
        <div className="bg-stone-100/70 border border-stone-200/80 rounded-2xl p-4 flex flex-col space-y-3.5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-stone-200/90">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-amber-500/15" />
              <h2 className="font-bold text-xs uppercase tracking-wider text-stone-800">
                A Preparar
              </h2>
            </div>
            <span className="text-xs font-mono font-bold tabular-nums bg-white text-stone-800 px-2.5 py-0.5 rounded-lg border border-stone-200 shadow-2xs">
              {todoOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin">
            <AnimatePresence>
              {todoOrders.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center gap-2.5 text-stone-400">
                  <div className="w-10 h-10 rounded-xl bg-white/80 border border-stone-200/80 flex items-center justify-center shadow-2xs">
                    <Inbox className="w-4 h-4 text-stone-400" />
                  </div>
                  <p className="text-xs font-medium text-stone-500">
                    Nenhum pedido aguardando preparo
                  </p>
                </div>
              ) : (
                todoOrders.map((o) => renderOrderCard(o))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Coluna 2: Em Preparo */}
        <div className="bg-stone-100/70 border border-stone-200/80 rounded-2xl p-4 flex flex-col space-y-3.5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-stone-200/90">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-600/15" />
              <h2 className="font-bold text-xs uppercase tracking-wider text-stone-800">
                {selectedSector ? `${selectedSector.name} • Em Preparo` : "Em Preparo"}
              </h2>
            </div>
            <span className="text-xs font-mono font-bold tabular-nums bg-white text-stone-800 px-2.5 py-0.5 rounded-lg border border-stone-200 shadow-2xs">
              {preparingOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin">
            <AnimatePresence>
              {preparingOrders.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center gap-2.5 text-stone-400">
                  <div className="w-10 h-10 rounded-xl bg-white/80 border border-stone-200/80 flex items-center justify-center shadow-2xs">
                    <Clock className="w-4 h-4 text-stone-400" />
                  </div>
                  <p className="text-xs font-medium text-stone-500">
                    Nenhum pedido em preparo no momento
                  </p>
                </div>
              ) : (
                preparingOrders.map((o) => renderOrderCard(o))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Coluna 3: Prontos (Expedição & Retirada) */}
        <div className="bg-stone-100/70 border border-stone-200/80 rounded-2xl p-4 flex flex-col space-y-3.5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-stone-200/90">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 ring-4 ring-emerald-600/15" />
              <h2 className="font-bold text-xs uppercase tracking-wider text-stone-800">
                Prontos • Expedição &amp; Retirada
              </h2>
            </div>
            <span className="text-xs font-mono font-bold tabular-nums bg-white text-stone-800 px-2.5 py-0.5 rounded-lg border border-stone-200 shadow-2xs">
              {expeditionOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin">
            <AnimatePresence>
              {expeditionOrders.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center gap-2.5 text-stone-400">
                  <div className="w-10 h-10 rounded-xl bg-white/80 border border-stone-200/80 flex items-center justify-center shadow-2xs">
                    <CheckCircle2 className="w-4 h-4 text-stone-400" />
                  </div>
                  <p className="text-xs font-medium text-stone-500">
                    Nenhum pedido pronto aguardando saída
                  </p>
                </div>
              ) : (
                expeditionOrders.map((o) => renderOrderCard(o))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
