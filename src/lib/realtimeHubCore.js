// Núcleo puro de multiplexação WebSocket Realtime (compatível com browser e Node)
export function createRealtimeHub({ getClient, isConfigured }) {
  const channelRegistry = new Map();

  function buildHubKey(table, filter) {
    return `${table}:${filter || "global"}`;
  }

  function isRealtimeChannelActive(table, filter = null) {
    const entry = channelRegistry.get(buildHubKey(table, filter));
    return Boolean(entry?.isSubscribed);
  }

  function getActiveRealtimeChannelCount() {
    return channelRegistry.size;
  }

  function subscribeTableRealtime({
    table,
    filter = null,
    onEvent,
    onSubscribed,
  } = {}) {
    const client = getClient?.();
    if (typeof window === "undefined" || !table || !isConfigured?.() || !client) {
      return () => {};
    }

    const key = buildHubKey(table, filter);
    const listener = { onEvent, onSubscribed };
    let entry = channelRegistry.get(key);

    if (!entry) {
      entry = {
        key,
        isSubscribed: false,
        listeners: new Set([listener]),
        channel: null,
      };

      channelRegistry.set(key, entry);

      const channelFilter = filter ? { filter } : {};
      const channelName = `hub_${table}_${filter ? filter.replace(/[^a-zA-Z0-9_-]/g, "_") : "global"}`;

      entry.channel = client
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, ...channelFilter },
          (payload) => {
            const current = channelRegistry.get(key);
            if (!current) return;
            for (const sub of current.listeners) {
              try {
                sub.onEvent?.(payload);
              } catch (err) {
                console.warn(`[RealtimeHub] Erro ao processar evento em ${table}:`, err);
              }
            }
          }
        )
        .subscribe((status) => {
          const current = channelRegistry.get(key);
          if (!current) return;
          if (status === "SUBSCRIBED") {
            current.isSubscribed = true;
            for (const sub of current.listeners) {
              try {
                sub.onSubscribed?.();
              } catch {}
            }
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            current.isSubscribed = false;
          }
        });
    } else {
      entry.listeners.add(listener);
      if (entry.isSubscribed && typeof onSubscribed === "function") {
        queueMicrotask(() => {
          if (entry.listeners.has(listener)) {
            try {
              onSubscribed();
            } catch {}
          }
        });
      }
    }

    return () => {
      const current = channelRegistry.get(key);
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size === 0) {
        channelRegistry.delete(key);
        const activeClient = getClient?.();
        if (activeClient && current.channel) {
          activeClient.removeChannel(current.channel);
        }
      }
    };
  }

  return {
    subscribeTableRealtime,
    isRealtimeChannelActive,
    getActiveRealtimeChannelCount,
  };
}
