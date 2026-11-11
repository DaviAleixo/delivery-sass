import { useEffect, useRef } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { subscribeTableRealtime } from "@/lib/realtimeHub";
import { Order } from "@/entities/Order";

/**
 * Hook de conexão WebSocket Realtime com Supabase para pedidos.
 * Substitui o polling lento e entrega novos pedidos em milissegundos.
 *
 * @param {Object} options
 * @param {string} [options.tenantId] - ID do restaurante (se omitido, busca no localStorage)
 * @param {Function} [options.onInsert] - Callback disparado quando entra um novo pedido (INSERT)
 * @param {Function} [options.onUpdate] - Callback disparado quando um pedido muda de status (UPDATE)
 * @param {Function} [options.onDelete] - Callback disparado quando um pedido é deletado (DELETE)
 */
export function useOrdersRealtime({
  tenantId: propTenantId,
  onInsert,
  onUpdate,
  onDelete,
  onReconnected,
} = {}) {
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);
  const onReconnectedRef = useRef(onReconnected);

  useEffect(() => {
    onInsertRef.current = onInsert;
    onUpdateRef.current = onUpdate;
    onDeleteRef.current = onDelete;
    onReconnectedRef.current = onReconnected;
  }, [onInsert, onUpdate, onDelete, onReconnected]);

  useEffect(() => {
    const activeTenantId =
      propTenantId ||
      (typeof window !== "undefined"
        ? localStorage.getItem("current_tenant_id")
        : null);

    // 1. Fallback / Sincronização entre abas do mesmo navegador
    let unsubscribeLocal;
    try {
      unsubscribeLocal = Order.subscribe((event, data) => {
        if (event === "create" && onInsertRef.current) {
          onInsertRef.current(data);
        } else if (event === "update" && onUpdateRef.current) {
          onUpdateRef.current(data);
        } else if (event === "delete" && onDeleteRef.current) {
          onDeleteRef.current(data);
        }
      });
    } catch (_e) {}

    // 2. Conexão Nativa WebSocket Realtime do Supabase (Multiplexada por tenant_id via realtimeHub)
    if (!isSupabaseConfigured()) {
      return () => {
        if (unsubscribeLocal) unsubscribeLocal();
      };
    }

    const filter = activeTenantId ? `tenant_id=eq.${activeTenantId}` : null;
    const unsubscribeHub = subscribeTableRealtime({
      table: "orders",
      filter,
      onEvent: (payload) => {
        if (payload.eventType === "INSERT" && onInsertRef.current && payload.new) {
          onInsertRef.current(payload.new);
        } else if (payload.eventType === "UPDATE" && onUpdateRef.current && payload.new) {
          onUpdateRef.current(payload.new);
        } else if (payload.eventType === "DELETE" && onDeleteRef.current && payload.old) {
          onDeleteRef.current(payload.old);
        }
      },
      onSubscribed: () => {
        if (onReconnectedRef.current) {
          onReconnectedRef.current();
        }
      },
    });

    return () => {
      if (unsubscribeLocal) unsubscribeLocal();
      if (unsubscribeHub) unsubscribeHub();
    };
  }, [propTenantId]);
}
