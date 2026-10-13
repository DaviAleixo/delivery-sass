import { useEffect, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
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

    // 2. Conexão Nativa WebSocket Realtime do Supabase
    if (!isSupabaseConfigured() || !supabase) {
      return () => {
        if (unsubscribeLocal) unsubscribeLocal();
      };
    }

    const channelName = `realtime:orders:${activeTenantId || "global"}_${Date.now()}`;
    const filter = activeTenantId ? `tenant_id=eq.${activeTenantId}` : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          if (onInsertRef.current && payload.new) {
            onInsertRef.current(payload.new);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          if (onUpdateRef.current && payload.new) {
            onUpdateRef.current(payload.new);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "orders",
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          if (onDeleteRef.current && payload.old) {
            onDeleteRef.current(payload.old);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Conectado com sucesso ao WebSocket - dispara reconciliação para fechar brechas
          if (onReconnectedRef.current) {
            onReconnectedRef.current();
          }
        }
      });

    return () => {
      if (unsubscribeLocal) unsubscribeLocal();
      if (supabase && channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [propTenantId]);
}
