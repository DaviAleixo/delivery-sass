import React, { useState, useEffect, useRef, useMemo } from "react";
import { Order } from "@/entities/Order";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Printer,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Flame,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Wifi,
  WifiOff
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useOrdersRealtime } from "@/hooks/useOrdersRealtime";
import { useFifoPrintQueue } from "@/hooks/useFifoPrintQueue";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

// Som de sino de cozinha sintético via Web Audio API
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

// Componente do Cronômetro de Cozinha
function KDSTimer({ createdAt }) {
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

  // Cores de urgência na cozinha
  let colorClass = "text-emerald-400 bg-emerald-950/60 border-emerald-800";
  if (minutes >= 20) {
    colorClass = "text-rose-400 bg-rose-950/80 border-rose-700 animate-pulse";
  } else if (minutes >= 12) {
    colorClass = "text-amber-400 bg-amber-950/70 border-amber-800";
  }

  return (
    <div className={`px-2.5 py-1 rounded-lg border font-mono font-bold text-xs flex items-center gap-1.5 ${colorClass}`}>
      <Clock className="w-3.5 h-3.5" />
      <span>{formatted}</span>
      {minutes >= 20 && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
    </div>
  );
}

export default function KDSPage() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [channelFilter, setChannelFilter] = useState("all"); // "all" | "mesa" | "delivery" | "balcao"
  const [isFullscreen, setIsFullscreen] = useState(false);
  const knownIdsRef = useRef(new Set());

  // Fila Sequencial de Impressão FIFO tolerante a quedas de internet
  const {
    queue: printQueue,
    isProcessing: isPrinting,
    isOnline,
    autoPrintEnabled,
    setAutoPrintEnabled,
    enqueueOrders,
    manualPrintOrder,
  } = useFifoPrintQueue();

  // WebSocket Realtime Instantâneo com Reconciliação Automática
  useOrdersRealtime({
    onInsert: (newOrder) => {
      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });

      // Enfileira automaticamente na fila FIFO de impressão
      enqueueOrders([newOrder]);

      if (soundEnabled) {
        playKitchenChime();
      }

      const num = String(newOrder.id).slice(-4).toUpperCase();
      toast.success(`🍳 Novo Pedido #${num} na cozinha!`, {
        description: `${newOrder.items?.length || 0} item(ns) a preparar`,
        duration: 5000,
      });
    },
    onUpdate: (updatedOrder) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o))
      );
    },
    onDelete: (deletedOrder) => {
      setOrders((prev) => prev.filter((o) => o.id !== deletedOrder.id));
    },
    onReconnected: () => {
      // Reconciliação imediata quando o WebSocket restabelece conexão
      loadOrders();
    },
  });

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30000);

    // Reconciliação ativa: ao voltar para a aba ou restabelecer a rede
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
  }, []);

  const loadOrders = async () => {
    try {
      const data = await Order.list("-created_date", 60);
      const safe = Array.isArray(data) ? data : [];
      setOrders(safe);
      knownIdsRef.current = new Set(safe.map((o) => o.id));
    } catch (_err) {
      console.error("Erro ao carregar pedidos no KDS:", _err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    // Atualização otimista local
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );

    try {
      await Order.update(orderId, { status: newStatus });
      toast.success(`Pedido atualizado para "${newStatus}"`);
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

  // Filtragem de pedidos ativos na cozinha
  const activeOrders = useMemo(() => {
    return orders.filter((o) => {
      // Cozinha foca em pendentes, confirmados e preparando (e prontos recentes)
      const isKitchenRelevant = ["pendente", "confirmado", "preparando", "pronto"].includes(o.status);
      if (!isKitchenRelevant) return false;

      if (channelFilter === "mesa") {
        return o.order_type === "dine_in" || o.order_type === "mesa" || (o.table_number && o.table_number.toLowerCase().includes("mesa"));
      }
      if (channelFilter === "delivery") {
        return o.order_type === "delivery";
      }
      if (channelFilter === "balcao") {
        return o.order_type === "pickup" || o.order_type === "balcao";
      }
      return true;
    });
  }, [orders, channelFilter]);

  // Colunas do KDS ordenadas cronologicamente (FIFO: O mais antigo primeiro a ser preparado!)
  const todoOrders = useMemo(() => {
    return activeOrders
      .filter((o) => o.status === "pendente" || o.status === "confirmado")
      .sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());
  }, [activeOrders]);

  const preparingOrders = useMemo(() => {
    return activeOrders
      .filter((o) => o.status === "preparando")
      .sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());
  }, [activeOrders]);

  const readyOrders = useMemo(() => {
    return activeOrders
      .filter((o) => o.status === "pronto")
      .sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime());
  }, [activeOrders]);

  const renderOrderCard = (order) => {
    const isMesa = order.order_type === "dine_in" || order.order_type === "mesa" || (order.table_number && order.table_number.toLowerCase().includes("mesa"));
    const isDelivery = order.order_type === "delivery";
    const num = String(order.id).slice(-4).toUpperCase();

    const orderCreatedAt = order.created_date ? new Date(order.created_date).getTime() : Date.now();
    const minutesDelayed = Math.floor((Date.now() - orderCreatedAt) / 60000);
    const isDelayedOffline = minutesDelayed >= 10 && (order.status === "pendente" || order.status === "confirmado");

    return (
      <motion.div
        key={order.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`bg-stone-900 border rounded-2xl p-4 shadow-xl flex flex-col justify-between space-y-4 text-stone-100 ${
          isDelayedOffline ? "border-rose-600/80 shadow-rose-950/40 ring-1 ring-rose-500/50" : "border-stone-800"
        }`}
      >
        {/* Topo do Card: Número, Mesa/Canal e Timer */}
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-stone-800 gap-2">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-lg font-black text-amber-400 font-mono tracking-wider">
                  #{num}
                </span>
                {isDelayedOffline && (
                  <Badge className="bg-rose-950 text-rose-300 border border-rose-700 animate-pulse text-[10px] font-black tracking-wide">
                    ⚠️ RETIDO ({minutesDelayed}m)
                  </Badge>
                )}
                {isMesa ? (
                  <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-xs font-bold">
                    🍽️ {order.table_number || "Mesa"}
                  </Badge>
                ) : isDelivery ? (
                  <Badge className="bg-rose-950 text-rose-300 border-rose-800 text-xs font-bold">
                    🛵 Delivery
                  </Badge>
                ) : (
                  <Badge className="bg-blue-950 text-blue-300 border-blue-800 text-xs font-bold">
                    🏪 Balcão
                  </Badge>
                )}
              </div>
              <p className="text-xs text-stone-400 font-medium mt-0.5 truncate max-w-[180px]">
                {order.customer_name || "Cliente"}
              </p>
            </div>

            <KDSTimer createdAt={order.created_date} />
          </div>

          {/* Lista de Itens do Pedido */}
          <div className="py-3 space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {order.items?.map((item, idx) => (
              <div key={idx} className="border-b border-stone-800/60 pb-2 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-sm text-white">
                    <span className="text-amber-400 font-extrabold mr-1.5">{item.quantity}x</span>
                    {item.product_name || item.name}
                  </span>
                </div>

                {/* Adicionais */}
                {item.additionals && item.additionals.length > 0 && (
                  <div className="pl-5 text-xs text-stone-400 space-y-0.5 mt-0.5">
                    {item.additionals.map((ad, i) => (
                      <div key={i}>+ {ad.name}</div>
                    ))}
                  </div>
                )}

                {/* Observação por Item */}
                {item.notes && (
                  <div className="pl-5 text-xs text-amber-300 font-semibold bg-amber-950/40 p-1 rounded mt-1">
                    ⚠️ {item.notes}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Observação Geral do Pedido */}
          {order.notes && (
            <div className="p-2.5 bg-rose-950/50 border border-rose-900 rounded-xl text-xs text-rose-200 font-bold">
              Obs: {order.notes}
            </div>
          )}
        </div>

        {/* Rodapé com Botões de Ação Rápida */}
        <div className="pt-3 border-t border-stone-800 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => manualPrintOrder(order)}
            className="h-10 w-10 border-stone-700 bg-stone-800/80 text-stone-300 hover:text-white hover:bg-stone-700 shrink-0 cursor-pointer"
            title="Imprimir comanda na fila FIFO"
          >
            <Printer className="w-4 h-4" />
          </Button>

          {order.status === "pendente" || order.status === "confirmado" ? (
            <Button
              type="button"
              onClick={() => handleUpdateStatus(order.id, "preparando")}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs h-10 rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
            >
              <Flame className="w-4 h-4" />
              <span>Iniciar Preparo</span>
            </Button>
          ) : order.status === "preparando" ? (
            <Button
              type="button"
              onClick={() => handleUpdateStatus(order.id, "pronto")}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs h-10 rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Marcar Pronto</span>
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => handleUpdateStatus(order.id, "enviado")}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs h-10 rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
            >
              <span>Despachar / Entregar</span>
            </Button>
          )}
        </div>
      </motion.div>
    );
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-stone-400 font-bold text-sm">Carregando monitor da cozinha...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-4 sm:p-6 flex flex-col space-y-6">
      {/* Barra Superior do KDS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase">
                Monitor KDS Cozinha
              </h1>
              {isOnline ? (
                <span
                  className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5"
                  title="Internet Conectada (Realtime Ativo)"
                >
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  Online
                </span>
              ) : (
                <span
                  className="text-[10px] bg-rose-500/30 text-rose-300 border border-rose-500/50 px-2.5 py-0.5 rounded-full font-black flex items-center gap-1.5 animate-pulse"
                  title="Sem conexão com a internet! Pedidos sincronizarão ao reconectar."
                >
                  <WifiOff className="w-3 h-3 text-rose-400" />
                  Offline
                </span>
              )}
            </div>
            <p className="text-xs text-stone-400">
              {activeOrders.length} pedido(s) ativos na cozinha
            </p>
          </div>
        </div>

        {/* Controles: Auto-Imprimir, Filtro de Canal, Som, Fullscreen e Atualizar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Botão de Auto-Impressão com Badge de Fila FIFO */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAutoPrintEnabled(!autoPrintEnabled)}
            className={`text-xs h-9 px-3 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
              autoPrintEnabled
                ? "border-emerald-600 bg-emerald-950/70 text-emerald-300 hover:bg-emerald-900"
                : "border-stone-800 bg-stone-900 text-stone-400 hover:text-white"
            }`}
            title={autoPrintEnabled ? "Auto-impressão ATIVADA: novos pedidos imprimem na fila FIFO" : "Auto-impressão DESATIVADA"}
          >
            <Printer className={`w-3.5 h-3.5 ${autoPrintEnabled ? "text-emerald-400" : ""}`} />
            <span className="hidden md:inline">Auto-Imprimir</span>
            {printQueue.length > 0 && (
              <span className="bg-amber-500 text-stone-950 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {printQueue.length}
              </span>
            )}
          </Button>
          {/* Seletor de Canal */}
          <div className="flex items-center bg-stone-900 border border-stone-800 rounded-xl p-1 text-xs">
            <button
              onClick={() => setChannelFilter("all")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                channelFilter === "all" ? "bg-amber-500 text-stone-950" : "text-stone-400 hover:text-white"
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setChannelFilter("mesa")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                channelFilter === "mesa" ? "bg-amber-500 text-stone-950" : "text-stone-400 hover:text-white"
              }`}
            >
              🍽️ Salão
            </button>
            <button
              onClick={() => setChannelFilter("delivery")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                channelFilter === "delivery" ? "bg-amber-500 text-stone-950" : "text-stone-400 hover:text-white"
              }`}
            >
              🛵 Delivery
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="border-stone-800 bg-stone-900 text-stone-300 hover:text-white text-xs h-9 px-3 rounded-xl"
            title={soundEnabled ? "Silenciar sons" : "Ativar alarme sonoro"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-stone-500" />}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            className="border-stone-800 bg-stone-900 text-stone-300 hover:text-white text-xs h-9 px-3 rounded-xl"
            title="Alternar tela cheia"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadOrders}
            className="border-stone-800 bg-stone-900 text-stone-300 hover:text-white text-xs h-9 px-3 rounded-xl"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Grid de 3 Colunas Kanban do KDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 flex-1 min-h-0">
        {/* Coluna 1: A Fazer (Novos / Confirmados) */}
        <div className="bg-stone-900/40 border border-stone-800/80 rounded-3xl p-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-800">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              <h2 className="font-black text-sm uppercase tracking-wider text-stone-200">
                A Preparar
              </h2>
            </div>
            <span className="text-xs font-black bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-500/30">
              {todoOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <AnimatePresence>
              {todoOrders.length === 0 ? (
                <div className="py-20 text-center text-xs text-stone-600 font-medium">
                  Nenhum pedido aguardando preparo.
                </div>
              ) : (
                todoOrders.map(renderOrderCard)
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Coluna 2: Em Preparo (Chapa / Cozinha) */}
        <div className="bg-stone-900/40 border border-stone-800/80 rounded-3xl p-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-800">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
              <h2 className="font-black text-sm uppercase tracking-wider text-stone-200">
                Na Chapa / Preparando
              </h2>
            </div>
            <span className="text-xs font-black bg-orange-500/20 text-orange-300 px-2.5 py-0.5 rounded-full border border-orange-500/30">
              {preparingOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <AnimatePresence>
              {preparingOrders.length === 0 ? (
                <div className="py-20 text-center text-xs text-stone-600 font-medium">
                  Nenhum pedido em preparo no momento.
                </div>
              ) : (
                preparingOrders.map(renderOrderCard)
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Coluna 3: Pronto (Expedição / Entrega) */}
        <div className="bg-stone-900/40 border border-stone-800/80 rounded-3xl p-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-800">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <h2 className="font-black text-sm uppercase tracking-wider text-stone-200">
                Pronto (Expedição)
              </h2>
            </div>
            <span className="text-xs font-black bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              {readyOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <AnimatePresence>
              {readyOrders.length === 0 ? (
                <div className="py-20 text-center text-xs text-stone-600 font-medium">
                  Nenhum pedido pronto aguardando entrega.
                </div>
              ) : (
                readyOrders.map(renderOrderCard)
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
