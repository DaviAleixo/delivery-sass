import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { invalidateCache } from "@/entities/storage";
import { findOrphanShiftOrders } from "@/utils/shiftClosingCalculator";
import { Order } from "@/entities/Order";

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CASH_SESSION_EVENT = "pedemuleke_cash_session_changed";

export function resolveLoggedOperatorName() {
  if (typeof window === "undefined") return "Operador Principal";
  try {
    const raw = localStorage.getItem("admin_user");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.name || parsed?.username) return parsed.name || parsed.username;
    }
  } catch {}
  return "Operador Principal";
}

export function mapDbCashMovement(m) {
  return {
    id: m.id,
    type: m.type,
    title: m.title,
    category: m.category,
    amount: Number(m.amount || 0),
    direction: m.direction,
    operator: m.operator_name || "Operador Principal",
    timestamp: m.created_at,
    notes: m.notes || "",
  };
}

export function getDrawerStorageKey(tenantId) {
  const tid =
    tenantId ||
    (typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null) ||
    "default";
  return `pedemuleke_cash_drawer_${tid}`;
}

export function notifyCashSessionChanged(detail = {}) {
  if (typeof window === "undefined") return;
  invalidateCache("orders");
  window.dispatchEvent(new CustomEvent(CASH_SESSION_EVENT, { detail }));
  if (detail?.invalidateOrders) {
    window.dispatchEvent(new CustomEvent("db_event_orders", { detail: { type: "update" } }));
  }
}

function readOfflineDrawerState(tenantId) {
  if (typeof window === "undefined") {
    return { isCashDrawerOpen: false, cashDrawerInfo: null, manualMovements: [] };
  }
  try {
    const raw = localStorage.getItem(getDrawerStorageKey(tenantId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        isCashDrawerOpen: Boolean(parsed?.isCashDrawerOpen),
        cashDrawerInfo: parsed?.cashDrawerInfo || null,
        manualMovements: Array.isArray(parsed?.manualMovements) ? parsed.manualMovements : [],
      };
    }
  } catch {}
  return { isCashDrawerOpen: false, cashDrawerInfo: null, manualMovements: [] };
}

function writeOfflineDrawerState(tenantId, state) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getDrawerStorageKey(tenantId), JSON.stringify(state));
  } catch {}
}

export async function fetchOrphanOrdersSummary(tenantId, localOrdersHint = null, lastClosedAt = null) {
  if (isSupabaseConfigured() && supabase && UUID_REGEX.test(String(tenantId || ""))) {
    const { data, error } = await supabase.rpc("get_orphan_orders_for_tenant", {
      p_tenant_id: tenantId,
    });
    if (!error && data) {
      return {
        count: Number(data.count || 0),
        totalAmount: Number(data.total_amount || 0),
        cashTotal: Number(data.cash_total || 0),
        orders: Array.isArray(data.orders) ? data.orders : [],
      };
    }
  }

  const ordersSource = Array.isArray(localOrdersHint)
    ? localOrdersHint
    : await Order.list("-created_date", 120).catch(() => []);
  const orphans = findOrphanShiftOrders(ordersSource, lastClosedAt);
  let totalAmount = 0;
  let cashTotal = 0;

  for (const ord of orphans) {
    const amt = Number(ord.total_amount ?? ord.total ?? 0);
    totalAmount += amt;
    const pm = String(ord.payment_method || "").toLowerCase();
    if (pm.includes("dinheiro") || pm === "cash") cashTotal += amt;
  }

  return {
    count: orphans.length,
    totalAmount,
    cashTotal,
    orders: orphans,
  };
}

export async function fetchActiveCashSessionState(tenantId) {
  if (isSupabaseConfigured() && supabase && UUID_REGEX.test(String(tenantId || ""))) {
    const [tenantRes, openRes, lastClosedRes, orphansSummary] = await Promise.all([
      supabase
        .from("tenants")
        .select("id,name,opening_time,closing_time,open_days,blind_cash_closing")
        .eq("id", tenantId)
        .maybeSingle(),
      supabase
        .from("cash_sessions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("cash_sessions")
        .select("id,closed_at")
        .eq("tenant_id", tenantId)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      fetchOrphanOrdersSummary(tenantId).catch(() => ({
        count: 0,
        totalAmount: 0,
        cashTotal: 0,
        orders: [],
      })),
    ]);

    const tenantRow = tenantRes?.data || null;
    const openSession = !openRes?.error ? openRes?.data : null;
    const lastClosedAt = lastClosedRes?.data?.closed_at || null;
    const lastClosedSessionId = lastClosedRes?.data?.id || null;

    if (openSession) {
      const { data: sessMovs } = await supabase
        .from("cash_movements")
        .select("*")
        .eq("cash_session_id", openSession.id)
        .order("created_at", { ascending: false });

      return {
        isCashDrawerOpen: true,
        tenantRow,
        lastClosedAt,
        lastClosedSessionId,
        cashDrawerInfo: {
          sessionId: openSession.id,
          openedAt: openSession.opened_at,
          closedAt: null,
          operator: openSession.opened_by || resolveLoggedOperatorName(),
          initialFloat: Number(openSession.initial_float || 0),
          notes: openSession.notes || "",
          blindClosing: Boolean(openSession.blind_closing),
          lastClosedSessionId,
        },
        manualMovements: Array.isArray(sessMovs) ? sessMovs.map(mapDbCashMovement) : [],
        orphanOrders: orphansSummary.orders,
        orphanSummary: orphansSummary,
      };
    }

    return {
      isCashDrawerOpen: false,
      tenantRow,
      lastClosedAt,
      lastClosedSessionId,
      cashDrawerInfo: {
        sessionId: null,
        openedAt: null,
        closedAt: lastClosedAt,
        operator: resolveLoggedOperatorName(),
        initialFloat: 0,
        notes: "",
        blindClosing: Boolean(tenantRow?.blind_cash_closing),
        lastClosedSessionId,
      },
      manualMovements: [],
      orphanOrders: orphansSummary.orders,
      orphanSummary: orphansSummary,
    };
  }

  // Fallback offline (LocalStorage)
  const localState = readOfflineDrawerState(tenantId);
  const lastClosedAt = localState.cashDrawerInfo?.closedAt || null;
  const orphansSummary = await fetchOrphanOrdersSummary(tenantId, null, lastClosedAt);

  return {
    isCashDrawerOpen: localState.isCashDrawerOpen,
    tenantRow: null,
    lastClosedAt,
    lastClosedSessionId: localState.cashDrawerInfo?.lastClosedSessionId || null,
    cashDrawerInfo: localState.cashDrawerInfo || {
      sessionId: null,
      openedAt: null,
      closedAt: null,
      operator: resolveLoggedOperatorName(),
      initialFloat: 0,
      notes: "",
      blindClosing: false,
      lastClosedSessionId: null,
    },
    manualMovements: localState.manualMovements,
    orphanOrders: orphansSummary.orders,
    orphanSummary: orphansSummary,
  };
}

export async function openCashSessionAction({
  tenantId,
  initialFloat,
  operator,
  notes = "",
  openedAt = new Date().toISOString(),
  attachOrderIds = null,
  blindClosing = false,
}) {
  if (isSupabaseConfigured() && supabase && UUID_REGEX.test(String(tenantId || ""))) {
    const cleanAttachIds =
      Array.isArray(attachOrderIds) && attachOrderIds.length > 0
        ? attachOrderIds.map(String)
        : null;

    const { data, error } = await supabase.rpc("open_cash_session", {
      p_tenant_id: tenantId,
      p_initial_float: initialFloat,
      p_operator: operator,
      p_notes: notes || "",
      p_attach_order_ids: cleanAttachIds,
    });
    if (error) {
      throw new Error(error.message || "Falha ao abrir sessão de caixa no servidor.");
    }

    const session = data?.session || {};
    const movements = Array.isArray(data?.movements)
      ? data.movements.map(mapDbCashMovement)
      : [];
    const attachedCount = Number(data?.attached_orders_count || 0);
    const attachedTotal = Number(data?.attached_orders_total || 0);

    notifyCashSessionChanged({
      type: "open",
      sessionId: session.id,
      invalidateOrders: attachedCount > 0,
    });

    return {
      sessionId: session.id,
      openedAt: session.opened_at || openedAt,
      operator: session.opened_by || operator,
      initialFloat: Number(session.initial_float ?? initialFloat),
      notes: session.notes || notes || "",
      blindClosing: Boolean(session.blind_closing ?? blindClosing),
      movements,
      attachedOrdersCount: attachedCount,
      attachedOrdersTotal: attachedTotal,
    };
  }

  // Fallback offline
  const localSessionId = `local-session-${Date.now()}`;
  const info = {
    sessionId: localSessionId,
    operator,
    initialFloat,
    notes,
    openedAt,
    closedAt: null,
    blindClosing: Boolean(blindClosing),
  };
  const openMovement = {
    id: `mov-open-${Date.now()}`,
    type: "open",
    title: "Abertura de Caixa (Troco Inicial)",
    category: "abertura",
    amount: initialFloat,
    direction: "in",
    operator,
    timestamp: openedAt,
    notes,
  };

  let attachedCount = 0;
  let attachedTotal = 0;
  if (Array.isArray(attachOrderIds) && attachOrderIds.length > 0) {
    for (const ordId of attachOrderIds) {
      const updated = await Order.update(ordId, { cash_session_id: localSessionId }).catch(() => null);
      if (updated) {
        attachedCount += 1;
        attachedTotal += Number(updated.total_amount ?? updated.total ?? 0);
      }
    }
  }

  writeOfflineDrawerState(tenantId, {
    isCashDrawerOpen: true,
    cashDrawerInfo: info,
    manualMovements: [openMovement],
  });

  notifyCashSessionChanged({
    type: "open",
    sessionId: localSessionId,
    invalidateOrders: attachedCount > 0,
  });

  return {
    ...info,
    movements: [openMovement],
    attachedOrdersCount: attachedCount,
    attachedOrdersTotal: attachedTotal,
  };
}

export async function attachOrphanOrdersAction({
  tenantId,
  sessionId = null,
  orderIds = null,
}) {
  const cleanOrderIds =
    Array.isArray(orderIds) && orderIds.length > 0 ? orderIds.map(String) : null;

  if (isSupabaseConfigured() && supabase && UUID_REGEX.test(String(tenantId || ""))) {
    const { data, error } = await supabase.rpc("attach_orphan_orders_to_session", {
      p_tenant_id: tenantId,
      p_session_id: sessionId || null,
      p_order_ids: cleanOrderIds,
    });
    if (error) {
      throw new Error(error.message || "Falha ao vincular pedidos órfãos ao caixa.");
    }
    notifyCashSessionChanged({
      type: "attach_orphans",
      sessionId: data?.session_id || sessionId,
      invalidateOrders: true,
    });
    return {
      attachedCount: Number(data?.attached_count || 0),
      attachedTotal: Number(data?.attached_total || 0),
      attachedOrderIds: Array.isArray(data?.attached_order_ids) ? data.attached_order_ids : [],
    };
  }

  // Fallback offline
  const localState = readOfflineDrawerState(tenantId);
  const targetId = sessionId || localState.cashDrawerInfo?.sessionId;
  if (!targetId) {
    throw new Error("Nenhuma sessão de caixa aberta encontrada.");
  }

  let idsToAttach = cleanOrderIds;
  if (!idsToAttach) {
    const summary = await fetchOrphanOrdersSummary(tenantId, null, localState.cashDrawerInfo?.closedAt);
    idsToAttach = summary.orders.map((o) => o.id);
  }

  let attachedCount = 0;
  let attachedTotal = 0;
  for (const id of idsToAttach) {
    const updated = await Order.update(id, { cash_session_id: targetId }).catch(() => null);
    if (updated) {
      attachedCount += 1;
      attachedTotal += Number(updated.total_amount ?? updated.total ?? 0);
    }
  }

  notifyCashSessionChanged({
    type: "attach_orphans",
    sessionId: targetId,
    invalidateOrders: attachedCount > 0,
  });

  return {
    attachedCount,
    attachedTotal,
    attachedOrderIds: idsToAttach,
  };
}

