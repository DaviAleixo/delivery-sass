import { useState, useEffect, useCallback, useRef } from "react";
import { getActiveTenantId } from "@/entities/storage";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  UUID_REGEX,
  CASH_SESSION_EVENT,
  fetchActiveCashSessionState,
  openCashSessionAction,
  attachOrphanOrdersAction,
  resolveLoggedOperatorName,
} from "@/utils/cashSessionService";

/**
 * Hook reativo para consultar e gerenciar o estado da gaveta de caixa
 * e pedidos órfãos em qualquer tela operacional (PDV, Mesas, Pedidos).
 */
export function useCashSession(explicitTenantId = null) {
  const tenantId =
    explicitTenantId ||
    getActiveTenantId() ||
    (typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null) ||
    "a0000000-0000-0000-0000-000000000001";

  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isCashDrawerOpen, setIsCashDrawerOpen] = useState(false);
  const [cashDrawerInfo, setCashDrawerInfo] = useState({
    sessionId: null,
    openedAt: null,
    closedAt: null,
    operator: resolveLoggedOperatorName(),
    initialFloat: 0,
    notes: "",
    blindClosing: false,
  });
  const [orphanOrders, setOrphanOrders] = useState([]);
  const mountedRef = useRef(true);

  const refreshCashSession = useCallback(async () => {
    try {
      const state = await fetchActiveCashSessionState(tenantId);
      if (!mountedRef.current) return state;
      setIsCashDrawerOpen(Boolean(state.isCashDrawerOpen));
      setCashDrawerInfo(state.cashDrawerInfo);
      setOrphanOrders(Array.isArray(state.orphanOrders) ? state.orphanOrders : []);
      return state;
    } catch (err) {
      console.warn("[useCashSession] Erro ao atualizar estado do caixa:", err);
      return null;
    } finally {
      if (mountedRef.current) {
        setIsLoadingSession(false);
      }
    }
  }, [tenantId]);

  useEffect(() => {
    mountedRef.current = true;
    refreshCashSession();

    const handleSessionEvent = () => refreshCashSession();
    const handleFocus = () => refreshCashSession();

    if (typeof window !== "undefined") {
      window.addEventListener(CASH_SESSION_EVENT, handleSessionEvent);
      window.addEventListener("db_event_orders", handleSessionEvent);
      window.addEventListener("focus", handleFocus);
    }

    let channel = null;
    if (isSupabaseConfigured() && supabase && UUID_REGEX.test(String(tenantId || ""))) {
      channel = supabase
        .channel(`cash_session_watch_${tenantId}_${Math.random().toString(36).slice(2, 7)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "cash_sessions",
            filter: `tenant_id=eq.${tenantId}`,
          },
          () => refreshCashSession()
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: `tenant_id=eq.${tenantId}`,
          },
          () => refreshCashSession()
        )
        .subscribe();
    }

    return () => {
      mountedRef.current = false;
      if (typeof window !== "undefined") {
        window.removeEventListener(CASH_SESSION_EVENT, handleSessionEvent);
        window.removeEventListener("db_event_orders", handleSessionEvent);
        window.removeEventListener("focus", handleFocus);
      }
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [tenantId, refreshCashSession]);

  const openCashSession = useCallback(
    async ({ operator, initialFloat, notes, openedAt, attachOrderIds }) => {
      const result = await openCashSessionAction({
        tenantId,
        initialFloat,
        operator,
        notes,
        openedAt,
        attachOrderIds,
        blindClosing: cashDrawerInfo.blindClosing,
      });
      await refreshCashSession();
      return result;
    },
    [tenantId, cashDrawerInfo.blindClosing, refreshCashSession]
  );

  const attachOrphans = useCallback(
    async (orderIds = null) => {
      const res = await attachOrphanOrdersAction({
        tenantId,
        sessionId: cashDrawerInfo.sessionId,
        orderIds,
      });
      await refreshCashSession();
      return res;
    },
    [tenantId, cashDrawerInfo.sessionId, refreshCashSession]
  );

  return {
    tenantId,
    isLoadingSession,
    isCashDrawerOpen,
    cashDrawerInfo,
    orphanOrders,
    refreshCashSession,
    openCashSession,
    attachOrphans,
  };
}

