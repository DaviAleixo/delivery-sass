import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Order } from "@/entities/Order";
import { toast } from "sonner";

/**
 * Hook de Gerenciamento de Fila Sequencial de Impressão (FIFO)
 * com tolerância ativa a falhas e quedas de internet.
 *
 * Garante que:
 * 1. Pedidos represados durante quedas de internet sejam impressos na ordem cronológica exata (FIFO).
 * 2. Somente um pedido é enviado à impressora por vez (com delay seguro para corte de bobina).
 * 3. Previne duplicação de impressão através das colunas `print_status` e `printed_at`.
 * 4. Permite que apenas a máquina designada como "Estação de Impressão" execute o processo automático.
 */
export function useFifoPrintQueue({
  tenantId: propTenantId,
  onPrintSuccess,
  onPrintError,
} = {}) {
  const [queue, setQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // Preferências locais do terminal
  const [autoPrintEnabled, setAutoPrintEnabledState] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("delivery_auto_print_enabled") === "true";
  });

  const [isPrintStation, setIsPrintStationState] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("delivery_is_print_station");
    return stored === null ? true : stored === "true";
  });

  const isProcessingRef = useRef(false);
  const queueRef = useRef([]);
  const autoPrintRef = useRef(autoPrintEnabled);
  const isPrintStationRef = useRef(isPrintStation);

  useEffect(() => {
    autoPrintRef.current = autoPrintEnabled;
  }, [autoPrintEnabled]);

  useEffect(() => {
    isPrintStationRef.current = isPrintStation;
  }, [isPrintStation]);

  const setAutoPrintEnabled = (value) => {
    setAutoPrintEnabledState(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("delivery_auto_print_enabled", value ? "true" : "false");
    }
  };

  const setIsPrintStation = (value) => {
    setIsPrintStationState(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("delivery_is_print_station", value ? "true" : "false");
    }
  };

  const getActiveTenantId = useCallback(() => {
    if (propTenantId) return propTenantId;
    if (typeof window !== "undefined") {
      return localStorage.getItem("current_tenant_id");
    }
    return null;
  }, [propTenantId]);

  /**
   * Executa a impressão física de um pedido através de um iframe oculto
   * ou abrindo janela com comando print, aguardando término e cooldown.
   */
  const printOrderTicket = useCallback(async (order) => {
    return new Promise((resolve) => {
      try {
        const printUrl = `/PrintOrder?id=${order.id}&auto=true`;
        
        // Cria um iframe oculto temporário para carregar o cupom e disparar a impressão
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "none";
        iframe.style.opacity = "0";
        iframe.src = printUrl;

        let hasResolved = false;
        const cleanupAndResolve = () => {
          if (!hasResolved) {
            hasResolved = true;
            // Delay de segurança de 2.2 segundos para a impressora térmica cortar a bobina
            setTimeout(() => {
              try {
                if (document.body.contains(iframe)) {
                  document.body.removeChild(iframe);
                }
              } catch (_e) {}
              resolve(true);
            }, 2200);
          }
        };

        iframe.onload = () => {
          // Timeout de segurança caso o diálogo seja cancelado ou demore
          setTimeout(cleanupAndResolve, 8000);
        };

        // Fallback para timeout total
        setTimeout(cleanupAndResolve, 10000);

        document.body.appendChild(iframe);
      } catch (err) {
        console.error("Erro ao despachar impressão do pedido:", err);
        resolve(false);
      }
    });
  }, []);

  /**
   * Processador de Fila Sequencial (Worker FIFO)
   */
  const processNextInQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (queueRef.current.length === 0) return;
    if (!autoPrintRef.current || !isPrintStationRef.current) return;

    isProcessingRef.current = true;
    setIsProcessing(true);

    const nextOrder = queueRef.current[0];

    try {
      // 1. Marca no banco que o pedido está sendo impresso para evitar duplicidade
      if (isSupabaseConfigured() && supabase) {
        await supabase
          .from("orders")
          .update({
            print_status: "printing",
            updated_date: new Date().toISOString(),
          })
          .eq("id", nextOrder.id);
      }

      // 2. Dispara a impressão física (aguarda conclusão + delay de corte)
      const success = await printOrderTicket(nextOrder);

      // 3. Atualiza o status definitivo no banco de dados
      if (isSupabaseConfigured() && supabase) {
        await supabase
          .from("orders")
          .update({
            print_status: success ? "printed" : "failed",
            printed_at: success ? new Date().toISOString() : null,
            print_count: (Number(nextOrder.print_count) || 0) + (success ? 1 : 0),
            updated_date: new Date().toISOString(),
          })
          .eq("id", nextOrder.id);
      }

      const orderNumber = nextOrder.order_number || nextOrder.id?.slice(-4);
      if (success) {
        toast.success(`🖨️ Comanda #${orderNumber} impressa com sucesso!`);
        if (onPrintSuccess) onPrintSuccess(nextOrder);
      } else {
        toast.error(`⚠️ Falha ao imprimir comanda #${orderNumber}`);
        if (onPrintError) onPrintError(nextOrder);
      }
    } catch (error) {
      console.error("Erro no processamento da fila de impressão:", error);
    } finally {
      // Remove o item processado da fila
      queueRef.current = queueRef.current.filter((item) => item.id !== nextOrder.id);
      setQueue([...queueRef.current]);
      isProcessingRef.current = false;
      setIsProcessing(false);

      // Se ainda houver itens na fila, processa o próximo imediatamente
      if (queueRef.current.length > 0) {
        setTimeout(() => {
          processNextInQueue();
        }, 300);
      }
    }
  }, [printOrderTicket, onPrintSuccess, onPrintError]);

  /**
   * Adiciona novos pedidos à fila FIFO respeitando a ordem cronológica estrita (created_date ASC)
   */
  const enqueueOrders = useCallback((newOrders) => {
    if (!Array.isArray(newOrders) || newOrders.length === 0) return;

    const existingIds = new Set(queueRef.current.map((o) => o.id));
    const toAdd = newOrders.filter(
      (o) => o && o.id && !existingIds.has(o.id) && o.print_status !== "printed" && o.status !== "aguardando_pagamento"
    );

    if (toAdd.length === 0) return;

    // Unifica e ordena toda a fila por created_date ASC (First In, First Out)
    const updatedQueue = [...queueRef.current, ...toAdd].sort((a, b) => {
      const timeA = new Date(a.created_date || a.created_at || 0).getTime();
      const timeB = new Date(b.created_date || b.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (Number(a.order_number) || 0) - (Number(b.order_number) || 0);
    });

    queueRef.current = updatedQueue;
    setQueue([...updatedQueue]);

    // Inicia o processamento se estiver habilitado
    if (autoPrintRef.current && isPrintStationRef.current && !isProcessingRef.current) {
      processNextInQueue();
    }
  }, [processNextInQueue]);

  /**
   * Sincronização de Recuperação (Catch-up Sync)
   * Busca no Supabase todos os pedidos pendentes que entraram durante a queda da internet.
   */
  const syncPendingOrders = useCallback(async () => {
    const tenantId = getActiveTenantId();
    if (!tenantId || !isSupabaseConfigured() || !supabase) return;

    try {
      // Busca apenas pedidos de hoje/recentes que estejam 'pending' de impressão
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("print_status", ["pending", "failed"])
        .neq("status", "aguardando_pagamento")
        .order("created_date", { ascending: true }); // FIFO: O mais antigo primeiro!

      if (!error && Array.isArray(data) && data.length > 0) {
        const delayedCount = data.filter((o) => {
          const elapsed = Date.now() - new Date(o.created_date || 0).getTime();
          return elapsed > 10 * 60 * 1000;
        }).length;

        if (delayedCount > 0) {
          toast.warning(
            `⚠️ Reconectado! ${data.length} pedidos na fila (${delayedCount} retidos durante a queda da rede).`,
            { duration: 6000 }
          );
        } else {
          toast.info(`🔄 Fila sincronizada: ${data.length} pedidos pendentes.`);
        }

        enqueueOrders(data);
      }
    } catch (err) {
      console.error("Erro no Catch-up Sync de pedidos:", err);
    }
  }, [getActiveTenantId, enqueueOrders]);

  /**
   * Efeito: Monitora status online/offline do navegador
   */
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("🌐 Conexão com a internet restabelecida! Sincronizando pedidos...");
      syncPendingOrders();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.error("⚠️ Atenção: Conexão com a internet caiu! O sistema sincronizará ao retornar.", {
        duration: 8000,
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Na inicialização do componente, faz a checagem inicial
    if (navigator.onLine) {
      syncPendingOrders();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPendingOrders]);

  /**
   * Função para imprimir manualmente qualquer pedido pela fila sem conflito
   */
  const manualPrintOrder = useCallback((order) => {
    if (!order) return;
    toast.info(`Enfileirando pedido #${order.order_number || order.id?.slice(-4)} para impressão...`);
    enqueueOrders([order]);
  }, [enqueueOrders]);

  return {
    queue,
    isProcessing,
    isOnline,
    autoPrintEnabled,
    setAutoPrintEnabled,
    isPrintStation,
    setIsPrintStation,
    enqueueOrders,
    syncPendingOrders,
    manualPrintOrder,
  };
}
