import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { UUID_REGEX } from "@/utils/cashSessionService";

function assertSupabaseTenant(tenantId) {
  if (!isSupabaseConfigured() || !supabase || !UUID_REGEX.test(String(tenantId || ""))) {
    throw new Error("Loja ou conexão Supabase não configurada.");
  }
}

export function cleanPhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function formatPhoneBR(phone) {
  const digits = cleanPhoneDigits(phone);
  if (!digits) return "-";
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return String(phone || "-");
}

export function formatMoneyBRL(val) {
  return `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;
}

export function formatPaymentMethodLabel(method) {
  if (!method) return "";
  const k = String(method).toLowerCase().trim();
  if (k.includes("pix") || k === "mercadopago") return "Pix";
  if (k.includes("crédito") || k.includes("credito") || k === "credit") {
    return "Cartão de Crédito";
  }
  if (k.includes("débito") || k.includes("debito") || k === "debit") {
    return "Cartão de Débito";
  }
  if (k.includes("dinheiro") || k === "cash") return "Dinheiro";
  if (k.includes("vale") || k.includes("refei") || k.includes("alimenta") || k === "voucher") {
    return "Vale Refeição";
  }
  const cleaned = String(method).replace(/_/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function getRecencyInfo(lastOrderDate) {
  if (!lastOrderDate) {
    return { daysAgo: null, label: "Sem pedidos", tone: "muted", isAtRisk: false };
  }
  const now = new Date();
  const diffMs = now.getTime() - lastOrderDate.getTime();
  const daysAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (daysAgo === 0) {
    return { daysAgo, label: "Hoje", tone: "emerald", isAtRisk: false };
  }
  if (daysAgo === 1) {
    return { daysAgo, label: "Ontem", tone: "emerald", isAtRisk: false };
  }
  if (daysAgo <= 7) {
    return { daysAgo, label: `Há ${daysAgo} dias`, tone: "emerald", isAtRisk: false };
  }
  if (daysAgo <= 30) {
    return { daysAgo, label: `Há ${daysAgo} dias`, tone: "stone", isAtRisk: false };
  }
  return { daysAgo, label: `Sumido há ${daysAgo}d`, tone: "amber", isAtRisk: true };
}

export function computeVipSpentThreshold(clients) {
  const spentList = clients
    .map((c) => Number(c.totalSpent || 0))
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  if (spentList.length === 0) return 150;
  const topIndex = Math.max(0, Math.floor(spentList.length * 0.2) - 1);
  return Math.max(150, spentList[topIndex] || 150);
}

export function classifyClientSegment(client, vipSpentThreshold = 150) {
  const recency = getRecencyInfo(client.lastOrderDate);
  const totalOrders = Number(client.totalOrders || 0);
  const totalSpent = Number(client.totalSpent || 0);
  const firstDaysAgo = client.firstOrderDate
    ? Math.max(0, Math.floor((Date.now() - client.firstOrderDate.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const isVip = totalOrders >= 10 || (totalSpent > 0 && totalSpent >= vipSpentThreshold && totalOrders >= 2);
  const isRecurring = totalOrders >= 3;
  const isAtRisk = recency.isAtRisk && totalOrders > 0;
  const isNew = firstDaysAgo !== null && firstDaysAgo <= 7 && totalOrders <= 2;

  let primaryBadge = null;
  if (isVip) {
    primaryBadge = { key: "vip", label: "VIP", className: "bg-amber-50 text-amber-800 border-amber-200" };
  } else if (isAtRisk) {
    primaryBadge = { key: "at_risk", label: "Sumido", className: "bg-rose-50 text-rose-700 border-rose-200" };
  } else if (isRecurring) {
    primaryBadge = { key: "recurring", label: "Recorrente", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  } else if (isNew) {
    primaryBadge = { key: "new", label: "Novo", className: "bg-sky-50 text-sky-700 border-sky-200" };
  }

  return {
    recency,
    isVip,
    isRecurring,
    isAtRisk,
    isNew,
    primaryBadge,
  };
}

export function buildWhatsAppUrl(phone, message = "") {
  const digits = cleanPhoneDigits(phone);
  if (!digits) return null;
  const withCountry = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
  const textParam = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${withCountry}${textParam}`;
}

export function buildWhatsAppTemplates(client) {
  const firstName = String(client?.full_name || "Cliente").trim().split(/\s+/)[0] || "Cliente";
  const cashback = Number(client?.cashbackBalance || 0);

  const templates = [
    {
      id: "reactivate",
      label: "Reativar cliente",
      description: "Convidar para pedir novamente",
      message: `Oi ${firstName}, tudo bem? Faz um tempinho que você não pede com a gente! Passando para avisar que hoje estamos com o cardápio aberto e caprichado. Se quiser pedir, é só responder por aqui!`,
    },
  ];

  if (cashback > 0) {
    templates.push({
      id: "cashback",
      label: `Avisar cashback (${formatMoneyBRL(cashback)})`,
      description: "Lembrar saldo disponível na loja",
      message: `Oi ${firstName}! Você tem ${formatMoneyBRL(cashback)} de cashback acumulado aqui na loja esperando para ser usado no seu próximo pedido. Aproveite antes que expire!`,
    });
  }

  templates.push({
    id: "vip",
    label: "Agradecimento / Novidade",
    description: "Mensagem de relacionamento",
    message: `Oi ${firstName}, tudo certo? Obrigado por pedir sempre com a gente! Qualquer dúvida ou pedido especial, estamos à disposição por aqui.`,
  });

  templates.push({
    id: "blank",
    label: "Abrir conversa livre",
    description: "Sem texto preenchido",
    message: "",
  });

  return templates;
}

export async function fetchClientsSummary(tenantId) {
  assertSupabaseTenant(tenantId);
  const { data, error } = await supabase.rpc("get_clients_summary", {
    p_tenant_id: tenantId,
  });
  if (error) throw error;

  return (Array.isArray(data) ? data : []).map((c) => ({
    id: c.id || c.customer_phone,
    full_name: c.customer_name || "Cliente",
    email: c.customer_email || "",
    phone: c.customer_phone || "",
    lastAddress: c.last_address || "",
    totalOrders: Number(c.total_orders || 0),
    totalSpent: Number(c.total_spent || 0),
    firstOrderDate: c.first_order_at ? new Date(c.first_order_at) : null,
    lastOrderDate: c.last_order_at ? new Date(c.last_order_at) : null,
    cashbackBalance: Number(c.cashback_balance || 0),
    cashbackExpiresAt: c.cashback_expires_at ? new Date(c.cashback_expires_at) : null,
    crmNotes: c.crm_notes || "",
    lastOrderType: c.last_order_type || "",
    lastPaymentMethod: c.last_payment_method || "",
  }));
}

export async function fetchClientsSummaryPaged(tenantId, {
  page = 1,
  pageSize = 25,
  search = "",
  segment = "all",
  sortBy = "last_order_at",
  sortDir = "desc",
} = {}) {
  assertSupabaseTenant(tenantId);

  try {
    const { data, error } = await supabase.rpc("get_clients_summary_paged", {
      p_tenant_id: tenantId,
      p_page: page,
      p_page_size: pageSize,
      p_search: search && search.trim() !== "" ? search.trim() : null,
      p_segment: segment || "all",
      p_sort_by: sortBy || "last_order_at",
      p_sort_dir: sortDir || "desc",
    });

    if (error) throw error;

    if (data && typeof data === "object") {
      const items = (Array.isArray(data.items) ? data.items : []).map((c) => ({
        id: c.id || c.customer_phone,
        full_name: c.customer_name || "Cliente",
        email: c.customer_email || "",
        phone: c.customer_phone || "",
        lastAddress: c.last_address || "",
        totalOrders: Number(c.total_orders || 0),
        totalSpent: Number(c.total_spent || 0),
        firstOrderDate: c.first_order_at ? new Date(c.first_order_at) : null,
        lastOrderDate: c.last_order_at ? new Date(c.last_order_at) : null,
        cashbackBalance: Number(c.cashback_balance || 0),
        cashbackExpiresAt: c.cashback_expires_at ? new Date(c.cashback_expires_at) : null,
        crmNotes: c.crm_notes || "",
        lastOrderType: c.last_order_type || "",
        lastPaymentMethod: c.last_payment_method || "",
        isVip: Boolean(c.is_vip),
        isRecurring: Boolean(c.is_recurring),
        isAtRisk: Boolean(c.is_at_risk),
        isNew: Boolean(c.is_new),
      }));

      return {
        page: Number(data.page || 1),
        pageSize: Number(data.page_size || pageSize),
        totalCount: Number(data.total_count || 0),
        totalPages: Number(data.total_pages || 1),
        vipThreshold: Number(data.vip_threshold || 150),
        metrics: {
          totalClients: Number(data.metrics?.total_clients || 0),
          totalOrders: Number(data.metrics?.total_orders || 0),
          totalRevenue: Number(data.metrics?.total_spent || 0),
          vipCount: Number(data.metrics?.vip_count || 0),
          recurringCount: Number(data.metrics?.recurring_count || 0),
          atRiskCount: Number(data.metrics?.at_risk_count || 0),
          newCount: Number(data.metrics?.new_count || 0),
          active30dCount: Number(data.metrics?.active_30d_count || 0),
        },
        items,
      };
    }
  } catch (rpcErr) {
    console.warn("[clientsService] Fallback para get_clients_summary:", rpcErr);
  }

  // Fallback offline / unmigrated RPC
  const all = await fetchClientsSummary(tenantId);
  const vipSpentThreshold = computeVipSpentThreshold(all);
  const enriched = all.map((c) => ({
    ...c,
    segment: classifyClientSegment(c, vipSpentThreshold),
  }));

  const q = (search || "").toLowerCase().trim();
  const qDigits = cleanPhoneDigits(q);
  const filtered = enriched.filter((client) => {
    if (segment === "vip" && !client.segment.isVip) return false;
    if (segment === "recurring" && !client.segment.isRecurring) return false;
    if (segment === "at_risk" && !client.segment.isAtRisk) return false;
    if (segment === "new" && !client.segment.isNew) return false;
    if (!q) return true;
    const nameMatch = (client.full_name || "").toLowerCase().includes(q);
    const phoneDigits = cleanPhoneDigits(client.phone);
    const phoneMatch =
      (client.phone || "").includes(q) ||
      (qDigits.length > 0 && phoneDigits.includes(qDigits));
    return nameMatch || phoneMatch;
  });

  const dir = sortDir === "asc" ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "total_orders" || sortBy === "totalOrders") {
      return (a.totalOrders - b.totalOrders) * dir;
    }
    if (sortBy === "total_spent" || sortBy === "totalSpent") {
      return (a.totalSpent - b.totalSpent) * dir;
    }
    const timeA = a.lastOrderDate ? a.lastOrderDate.getTime() : 0;
    const timeB = b.lastOrderDate ? b.lastOrderDate.getTime() : 0;
    return (timeA - timeB) * dir;
  });

  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const sliceStart = (page - 1) * pageSize;
  const items = sorted.slice(sliceStart, sliceStart + pageSize);

  const totalClients = enriched.length;
  const totalOrders = enriched.reduce((sum, c) => sum + c.totalOrders, 0);
  const totalRevenue = enriched.reduce((sum, c) => sum + c.totalSpent, 0);

  return {
    page,
    pageSize,
    totalCount,
    totalPages,
    vipThreshold: vipSpentThreshold,
    metrics: {
      totalClients,
      totalOrders,
      totalRevenue,
      vipCount: enriched.filter((c) => c.segment.isVip).length,
      recurringCount: enriched.filter((c) => c.segment.isRecurring).length,
      atRiskCount: enriched.filter((c) => c.segment.isAtRisk).length,
      newCount: enriched.filter((c) => c.segment.isNew).length,
      active30dCount: enriched.filter((c) => c.totalOrders > 0 && !c.segment.isAtRisk).length,
    },
    items,
  };
}

export async function fetchClientDetail(tenantId, phone) {
  assertSupabaseTenant(tenantId);
  const { data, error } = await supabase.rpc("get_client_crm_detail", {
    p_tenant_id: tenantId,
    p_phone: phone,
  });
  if (error) throw error;
  return {
    orders: Array.isArray(data?.orders) ? data.orders : [],
    topItems: Array.isArray(data?.top_items) ? data.top_items : [],
    notes: data?.notes || "",
    cashbackBalance: Number(data?.cashback_balance || 0),
    cashbackExpiresAt: data?.cashback_expires_at ? new Date(data.cashback_expires_at) : null,
  };
}

export async function saveClientNote(tenantId, phone, notes) {
  assertSupabaseTenant(tenantId);
  const { data, error } = await supabase.rpc("upsert_client_crm_note", {
    p_tenant_id: tenantId,
    p_phone: phone,
    p_notes: notes,
  });
  if (error) throw error;
  return data;
}

