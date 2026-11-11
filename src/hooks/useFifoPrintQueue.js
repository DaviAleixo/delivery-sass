import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { useLocation } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { Order } from "@/entities/Order";
import { ProductionSector } from "@/entities/ProductionSector";
import { Product } from "@/entities/Product";
import { Category } from "@/entities/Category";
import { analyzeOrderPrintJobs, filterOrderItemsForSector } from "@/utils/sectorUtils";
import { toast } from "sonner";

const PrintQueueContext = createContext(null);

const NON_ADMIN_PAGES = new Set([
  "menu",
  "home",
  "myorders",
  "meus-pedidos",
  "adminlogin",
  "login",
  "admin",
  "superadmin",
  "printorder",
  "printshiftclosing",
]);

function isAdminPanelPath(pathname = "") {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  if (segments.length < 2) return false;
  return !NON_ADMIN_PAGES.has(segments[1]);
}

/**
 * Hook interno de Gerenciamento de Fila Sequencial de Impressão (FIFO)
 * com tolerância ativa a falhas e quedas de internet.
 */
function useFifoPrintQueueInternal({
  tenantId: propTenantId,
  onPrintSuccess,
  onPrintError,
} = {}) {
  const { isAdminAuthenticated, user } = useAuth();
  const location = useLocation();
  const isQueueActive = Boolean(isAdminAuthenticated) && isAdminPanelPath(location?.pathname);

  const [queue, setQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // Estado do Spooler Desktop Local (.exe)
  const SPOOLER_URL = "http://127.0.0.1:9100";
  const [isSpoolerOnline, setIsSpoolerOnline] = useState(false);
  const [spoolerConfig, setSpoolerConfig] = useState(null);
  const prevSpoolerOnlineRef = useRef(null);

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
  const isSpoolerCloudPaired = Boolean(spoolerConfig?.cloudConnected);
  const spoolerCloudPairedRef = useRef(isSpoolerCloudPaired);
  const spoolerOnlineRef = useRef(isSpoolerOnline);

  useEffect(() => {
    spoolerCloudPairedRef.current = isSpoolerCloudPaired;
  }, [isSpoolerCloudPaired]);

  useEffect(() => {
    spoolerOnlineRef.current = isSpoolerOnline;
  }, [isSpoolerOnline]);

  useEffect(() => {
    autoPrintRef.current = autoPrintEnabled;
  }, [autoPrintEnabled]);

  useEffect(() => {
    isPrintStationRef.current = isPrintStation;
  }, [isPrintStation]);

  // Monitora a conexão com o Spooler Desktop (.exe)
  const checkSpooler = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${SPOOLER_URL}/status`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        setIsSpoolerOnline(true);
        setSpoolerConfig(data);
        if (prevSpoolerOnlineRef.current === false) {
          toast.success(`🖨️ Spooler Conectado! Impressão silenciosa ativa na ${data.selectedPrinter || "impressora"}.`, {
            duration: 4000,
          });
        }
        prevSpoolerOnlineRef.current = true;
        return data;
      }
    } catch (_e) {
      if (prevSpoolerOnlineRef.current === true) {
        toast.info("⚪ Spooler Desktop desconectado. Modo janela do navegador ativado.", {
          duration: 4000,
        });
      }
      prevSpoolerOnlineRef.current = false;
      setIsSpoolerOnline(false);
    }
    return null;
  }, []);

  useEffect(() => {
    if (!isQueueActive) {
      prevSpoolerOnlineRef.current = null;
      setIsSpoolerOnline(false);
      setSpoolerConfig(null);
      return;
    }

    checkSpooler();
    const interval = setInterval(checkSpooler, 10000); // Checagem rápida a cada 10s
    return () => clearInterval(interval);
  }, [isQueueActive, checkSpooler]);

  const testSpoolerPrint = useCallback(async () => {
    try {
      const res = await fetch(`${SPOOLER_URL}/test`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("🖨️ Cupom de teste impresso com sucesso!");
        return true;
      } else {
        toast.error(`Falha no teste: ${data.error || "Erro desconhecido"}`);
        return false;
      }
    } catch (err) {
      toast.error("O Spooler Desktop (.exe) não está em execução nesta máquina.");
      return false;
    }
  }, []);

  const fetchSpoolerPrinters = useCallback(async () => {
    try {
      const res = await fetch(`${SPOOLER_URL}/printers`);
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (_e) {}
    return { printers: [], defaultPrinter: "" };
  }, []);

  const saveSpoolerConfig = useCallback(async (newConfig) => {
    try {
      const res = await fetch(`${SPOOLER_URL}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        const data = await res.json();
        setSpoolerConfig(data.config);
        await checkSpooler();
        toast.success("Configuração da impressora salva!");
        return true;
      }
    } catch (_e) {}
    toast.error("Erro ao salvar configuração do spooler");
    return false;
  }, [checkSpooler]);

  const pairSpoolerWithCloud = useCallback(async (pairingData) => {
    try {
      const res = await fetch(`${SPOOLER_URL}/cloud/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pairingData),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        await checkSpooler();
        toast.success("☁️ Spooler pareado com a loja! Agora imprime mesmo com o navegador fechado.");
        return true;
      }
      toast.error(data.error || "Falha ao parear Spooler na nuvem.");
      return false;
    } catch (_e) {
      toast.error("Não foi possível falar com o Spooler nesta máquina.");
      return false;
    }
  }, [checkSpooler]);

  const unpairSpoolerCloud = useCallback(async () => {
    try {
      const res = await fetch(`${SPOOLER_URL}/cloud/unpair`, { method: "POST" });
      if (res.ok) {
        await checkSpooler();
        toast.info("Pareamento autônomo desconectado desta máquina.");
        return true;
      }
    } catch (_e) {}
    return false;
  }, [checkSpooler]);

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
    if (user?.tenant_id) return user.tenant_id;
    if (typeof window !== "undefined") {
      return localStorage.getItem("current_tenant_id");
    }
    return null;
  }, [propTenantId, user?.tenant_id]);

  const manualPrintMetaRef = useRef(new Map());

  /**
   * Despacha um único job físico (via Spooler Desktop para térmica ou iframe PrintOrder para A4/navegador).
   */
  const dispatchSingleJob = useCallback(async (order, job) => {
    if (job.printer_type !== "a4_browser") {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(`${SPOOLER_URL}/print`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order: { ...order, items: job.items },
            items: job.items,
            printerName: job.printer_name || undefined,
            paperWidth: job.paper_width || undefined,
            sectorName: job.sector_id ? job.sector_name : undefined,
            contentMode: job.content_mode || "full_ticket",
            copies: job.copies || 1,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setIsSpoolerOnline(true);
            await new Promise((r) => setTimeout(r, 700));
            return { ok: true, error: null };
          }
          return { ok: false, error: data.error || "Falha no Spooler" };
        }
      } catch (_spoolerErr) {
        // Spooler offline ou timeout: segue para fallback do navegador abaixo
      }
    }

    // Fallback ou modo A4/Navegador via iframe oculto
    return new Promise((resolve) => {
      try {
        const params = new URLSearchParams({ id: String(order.id), auto: "true" });
        if (job.sector_id) params.set("sector", String(job.sector_id));
        if (job.content_mode) params.set("mode", String(job.content_mode));
        if (job.printer_type === "a4_browser" || job.paper_width === "a4") {
          params.set("paper", "a4");
        }
        const printUrl = `/PrintOrder?${params.toString()}`;

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
            setTimeout(() => {
              try {
                if (document.body.contains(iframe)) {
                  document.body.removeChild(iframe);
                }
              } catch (_e) {}
              resolve({ ok: true, error: null });
            }, 2200);
          }
        };

        iframe.onload = () => {
          setTimeout(cleanupAndResolve, 8000);
        };

        setTimeout(cleanupAndResolve, 10000);

        document.body.appendChild(iframe);
      } catch (err) {
        console.error("Erro ao despachar impressão do pedido:", err);
        resolve({ ok: false, error: err?.message || "Erro no navegador" });
      }
    });
  }, []);

  /**
   * Executa a impressão de um pedido roteando por Setores configurados + fila print_jobs.
   * Sem setores configurados, mantém comportamento legado (1 cupom completo).
   */
  const printOrderTicket = useCallback(async (order, printMeta = {}) => {
    const activeTenantId = order.tenant_id || getActiveTenantId();
    const [sectors, products, categories] = await Promise.all([
      ProductionSector.list("order_index").catch(() => []),
      Product.list().catch(() => []),
      Category.list("order_index").catch(() => []),
    ]);

    let jobs = [];
    let deferredCount = 0;

    if (printMeta?.deliverySlipOnly) {
      const caixaSector = (sectors || []).find(
        (s) =>
          s.is_active !== false &&
          s.content_mode === "full_ticket" &&
          s.operation_mode !== "kds_only"
      );
      jobs = [
        {
          sector_id: caixaSector?.id || null,
          sector_key: caixaSector ? String(caixaSector.id) : "general",
          sector_name: caixaSector?.name || "Via Motoboy",
          printer_name: caixaSector?.printer_name || null,
          printer_type: caixaSector?.printer_type || "thermal_raw",
          paper_width: caixaSector?.paper_width || null,
          content_mode: "full_ticket",
          copies: 1,
          items: Array.isArray(order.items) ? order.items : [],
        },
      ];
    } else if (printMeta?.sectorId) {
      const targetSector = (sectors || []).find((s) => String(s.id) === String(printMeta.sectorId));
      if (targetSector) {
        const items =
          targetSector.content_mode === "full_ticket"
            ? (Array.isArray(order.items) ? order.items : [])
            : filterOrderItemsForSector(order, targetSector, { sectors, products, categories });
        if (items.length === 0) {
          toast.info(`Nenhum item do setor "${targetSector.name}" neste pedido.`);
          return { success: true, deferredOnly: false, hasDeferred: false };
        }
        jobs = [
          {
            sector_id: targetSector.id,
            sector_key: String(targetSector.id),
            sector_name: targetSector.name,
            printer_name: targetSector.printer_name || null,
            printer_type: targetSector.printer_type || "thermal_raw",
            paper_width: targetSector.paper_width || "80mm",
            content_mode: targetSector.content_mode || "production_only",
            copies: Math.max(1, Math.min(5, Number(targetSector.copies) || 1)),
            items,
          },
        ];
      }
    } else {
      const analysis = analyzeOrderPrintJobs(order, {
        sectors,
        products,
        categories,
        ignoreDeliveryTrigger: Boolean(printMeta?.force),
      });

      deferredCount = analysis.deferredJobs.length;

      if (analysis.hasActivePrintSectors) {
        jobs = analysis.jobs;
        if (jobs.length === 0 && deferredCount > 0) {
          return { success: true, deferredOnly: true, hasDeferred: true };
        }
        if (jobs.length === 0) {
          return { success: true, deferredOnly: true, hasDeferred: false };
        }
      } else {
        jobs = [
          {
            sector_id: null,
            sector_key: "general",
            sector_name: "Geral",
            printer_name: null,
            printer_type: "thermal_raw",
            paper_width: null,
            content_mode: "full_ticket",
            copies: 1,
            items: Array.isArray(order.items) ? order.items : [],
          },
        ];
      }
    }

    // Quando o .exe está pareado em nuvem (Etapa 2), ele já consome jobs térmicos sozinho.
    // O navegador só assume jobs térmicos quando é reimpressão manual (force) ou jobs A4 de navegador.
    if (!printMeta?.force && spoolerOnlineRef.current && spoolerCloudPairedRef.current) {
      jobs = jobs.filter((j) => j.printer_type === "a4_browser");
      if (jobs.length === 0) {
        return { success: true, deferredOnly: true, hasDeferred: true };
      }
    }

    let allSucceeded = true;

    for (const job of jobs) {
      let existingJob = null;
      if (activeTenantId && isSupabaseConfigured() && supabase) {
        try {
          const { data: foundJob } = await supabase
            .from("print_jobs")
            .select("id,status,attempts")
            .eq("order_id", String(order.id))
            .eq("sector_key", String(job.sector_key))
            .maybeSingle();

          existingJob = foundJob || null;

          if (!printMeta?.force && existingJob?.status === "printed") {
            continue;
          }

          await supabase.from("print_jobs").upsert(
            {
              tenant_id: activeTenantId,
              order_id: String(order.id),
              sector_id: job.sector_id || null,
              sector_key: String(job.sector_key),
              sector_name: job.sector_name || "Geral",
              printer_name: job.printer_name || null,
              printer_type: job.printer_type || "thermal_raw",
              paper_width: job.paper_width || "80mm",
              content_mode: job.content_mode || "full_ticket",
              copies: job.copies || 1,
              items_payload: job.items || [],
              status: "printing",
              attempts: (existingJob?.attempts || 0) + 1,
              updated_date: new Date().toISOString(),
            },
            { onConflict: "order_id,sector_key" }
          );
        } catch (_pjErr) {
          // Segue imprimindo mesmo se registro auxiliar falhar
        }
      }

      const result = await dispatchSingleJob(order, job);
      if (!result.ok) {
        allSucceeded = false;
      }

      if (activeTenantId && isSupabaseConfigured() && supabase) {
        try {
          await supabase
            .from("print_jobs")
            .update({
              status: result.ok ? "printed" : "failed",
              printed_at: result.ok ? new Date().toISOString() : null,
              error_message: result.error || null,
              updated_date: new Date().toISOString(),
            })
            .eq("order_id", String(order.id))
            .eq("sector_key", String(job.sector_key));
        } catch (_pjUpdErr) {}
      }

      if (jobs.length > 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    return {
      success: allSucceeded,
      deferredOnly: false,
      hasDeferred: deferredCount > 0,
    };
  }, [getActiveTenantId, dispatchSingleJob]);

  /**
   * Processador de Fila Sequencial (Worker FIFO)
   */
  const processNextInQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (queueRef.current.length === 0) return;

    const nextOrder = queueRef.current[0];
    const printMeta = manualPrintMetaRef.current.get(nextOrder.id) || {};
    if (!printMeta.force && (!autoPrintRef.current || !isPrintStationRef.current)) return;

    isProcessingRef.current = true;
    setIsProcessing(true);
    manualPrintMetaRef.current.delete(nextOrder.id);

    try {
      // 1. Dispara a impressão física (ou detecta se setores de delivery aguardam aceite)
      const outcome = await printOrderTicket(nextOrder, printMeta);
      const { success, deferredOnly, hasDeferred } = outcome || { success: false, deferredOnly: false, hasDeferred: false };

      // Se nenhum job rodou porque o Delivery ainda está pendente aguardando aceite, mantém pendente sem ruído
      if (deferredOnly && hasDeferred) {
        return;
      }

      // 2. Atualiza o status definitivo no banco de dados (mantém pending se houver outro setor aguardando aceite)
      if (isSupabaseConfigured() && supabase) {
        const finalPrintStatus = success
          ? (hasDeferred ? "pending" : "printed")
          : "failed";
        await supabase
          .from("orders")
          .update({
            print_status: finalPrintStatus,
            printed_at: success && !hasDeferred ? new Date().toISOString() : null,
            print_count: (Number(nextOrder.print_count) || 0) + (success && !deferredOnly ? 1 : 0),
            updated_date: new Date().toISOString(),
          })
          .eq("id", nextOrder.id);
      }

      const orderNumber = nextOrder.order_number || nextOrder.id?.slice(-4);
      if (deferredOnly) {
        // Nenhum setor elegível para este canal (ex: somente print_only em outro canal)
      } else if (success) {
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
  const enqueueOrders = useCallback((newOrders, options = {}) => {
    if (!Array.isArray(newOrders) || newOrders.length === 0) return;

    const existingIds = new Set(queueRef.current.map((o) => o.id));
    const toAdd = newOrders.filter(
      (o) =>
        o &&
        o.id &&
        !existingIds.has(o.id) &&
        (options.force || o.print_status !== "printed") &&
        o.status !== "aguardando_pagamento"
    );

    if (toAdd.length === 0) return;

    if (options.force || options.sectorId || options.deliverySlipOnly) {
      toAdd.forEach((o) => {
        manualPrintMetaRef.current.set(o.id, {
          force: Boolean(options.force),
          sectorId: options.sectorId || null,
          deliverySlipOnly: Boolean(options.deliverySlipOnly),
        });
      });
    }

    // Unifica e ordena toda a fila por created_date ASC (First In, First Out)
    const updatedQueue = [...queueRef.current, ...toAdd].sort((a, b) => {
      const timeA = new Date(a.created_date || a.created_at || 0).getTime();
      const timeB = new Date(b.created_date || b.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (Number(a.order_number) || 0) - (Number(b.order_number) || 0);
    });

    queueRef.current = updatedQueue;
    setQueue([...updatedQueue]);

    // Inicia o processamento se estiver habilitado (ou forçado manualmente)
    if ((options.force || (autoPrintRef.current && isPrintStationRef.current)) && !isProcessingRef.current) {
      processNextInQueue();
    }
  }, [processNextInQueue]);

  /**
   * Sincronização de Recuperação (Catch-up Sync)
   * Busca no Supabase pedidos recentes pendentes que entraram durante a queda da internet.
   */
  const syncPendingOrders = useCallback(async () => {
    if (!isQueueActive) return;
    const tenantId = getActiveTenantId();
    if (!tenantId || !isSupabaseConfigured() || !supabase) return;

    try {
      // Busca apenas pedidos das últimas 12h que estejam 'pending'/'failed' e ainda ativos
      const recentCutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("print_status", ["pending", "failed"])
        .neq("status", "aguardando_pagamento")
        .gte("created_date", recentCutoff)
        .order("created_date", { ascending: true }); // FIFO: O mais antigo primeiro!

      const eligibleOrders = Array.isArray(data)
        ? data.filter((o) => o.status !== "cancelado" && o.status !== "entregue")
        : [];

      if (!error && eligibleOrders.length > 0) {
        const delayedCount = eligibleOrders.filter((o) => {
          const elapsed = Date.now() - new Date(o.created_date || 0).getTime();
          return elapsed > 10 * 60 * 1000;
        }).length;

        if (delayedCount > 0) {
          toast.warning(
            `⚠️ Reconectado! ${eligibleOrders.length} pedidos na fila (${delayedCount} retidos durante a queda da rede).`,
            { duration: 6000 }
          );
        } else {
          toast.info(`🔄 Fila sincronizada: ${eligibleOrders.length} pedidos pendentes.`);
        }

        enqueueOrders(eligibleOrders);
      }
    } catch (err) {
      console.error("Erro no Catch-up Sync de pedidos:", err);
    }
  }, [isQueueActive, getActiveTenantId, enqueueOrders]);

  /**
   * Efeito: Monitora status online/offline do navegador apenas no painel administrativo
   */
  useEffect(() => {
    if (!isQueueActive) return;

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

    // Na inicialização do painel, faz a checagem inicial
    if (navigator.onLine) {
      syncPendingOrders();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [isQueueActive, syncPendingOrders]);

  /**
   * Função para imprimir manualmente qualquer pedido pela fila sem conflito (suporta reimpressão por setor)
   */
  const manualPrintOrder = useCallback((order, options = {}) => {
    if (!order) return;
    toast.info(`Enfileirando pedido #${order.order_number || order.id?.slice(-4)} para impressão...`);
    enqueueOrders([order], {
      force: true,
      sectorId: options?.sectorId || null,
      deliverySlipOnly: Boolean(options?.deliverySlipOnly),
    });
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
    // Spooler Desktop Local (.exe)
    isSpoolerOnline,
    isSpoolerCloudPaired,
    spoolerConfig,
    checkSpooler,
    testSpoolerPrint,
    fetchSpoolerPrinters,
    saveSpoolerConfig,
    pairSpoolerWithCloud,
    unpairSpoolerCloud,
  };
}

export function PrintQueueProvider({ children }) {
  const value = useFifoPrintQueueInternal();
  return React.createElement(PrintQueueContext.Provider, { value }, children);
}

export function useFifoPrintQueue(props) {
  const context = useContext(PrintQueueContext);
  if (context) return context;
  return useFifoPrintQueueInternal(props);
}

