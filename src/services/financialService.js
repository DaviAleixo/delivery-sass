import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { UUID_REGEX, resolveLoggedOperatorName } from "@/utils/cashSessionService";

export const FINANCIAL_CATEGORIES = [
  "Fornecedores / Insumos",
  "Embalagens",
  "Gás / Energia / Água",
  "Aluguel / Condomínio",
  "Equipe / Motoboys",
  "Marketing / Sistemas",
  "Impostos / Taxas",
  "Manutenção",
  "Retirada / Pró-labore",
  "Outros",
];

export const ACCOUNT_LABELS = {
  drawer: "Gaveta (PDV)",
  safe: "Cofre",
  bank: "Banco / Conta",
};

function assertSupabaseTenant(tenantId) {
  if (!isSupabaseConfigured() || !supabase || !UUID_REGEX.test(String(tenantId || ""))) {
    throw new Error("Loja ou conexão Supabase não configurada.");
  }
}

export async function fetchFinancialOverview(tenantId, { startDate, endDate } = {}) {
  assertSupabaseTenant(tenantId);
  const { data, error } = await supabase.rpc("get_financial_overview", {
    p_tenant_id: tenantId,
    p_start_date: startDate || undefined,
    p_end_date: endDate || undefined,
  });
  if (error) throw error;
  return {
    accounts: data?.accounts || {
      drawer: { balance: 0, is_open: false },
      safe: { balance: 0 },
      bank: { balance: 0 },
    },
    summary: data?.summary || {
      income_total: 0,
      expense_total: 0,
      net_total: 0,
      pending_expense_total: 0,
    },
    entries: Array.isArray(data?.entries) ? data.entries : [],
  };
}

export async function createFinancialEntry({
  tenantId,
  entryType,
  description,
  category = "Outros",
  amount,
  accountCode = "safe",
  targetAccountCode = null,
  status = "paid",
  dueDate = null,
  operatorName = null,
  notes = "",
  sourceType = "manual",
  sourceId = null,
  idempotencyKey = null,
  accountId = null,
  targetAccountId = null,
}) {
  assertSupabaseTenant(tenantId);
  const { data, error } = await supabase.rpc("create_financial_entry", {
    p_tenant_id: tenantId,
    p_entry_type: entryType,
    p_description: description,
    p_category: category,
    p_amount: Number(amount || 0),
    p_account_code: accountCode,
    p_target_account_code: targetAccountCode,
    p_status: status,
    p_due_date: dueDate || undefined,
    p_operator_name: operatorName || resolveLoggedOperatorName(),
    p_notes: notes || "",
    p_source_type: sourceType || "manual",
    p_source_id: sourceId || null,
    p_idempotency_key: idempotencyKey || null,
    p_account_id: accountId || null,
    p_target_account_id: targetAccountId || null,
  });
  if (error) throw error;
  return data;
}

export async function markFinancialEntryPaid({
  tenantId,
  entryId,
  accountCode = null,
  accountId = null,
}) {
  assertSupabaseTenant(tenantId);
  const { data, error } = await supabase.rpc("mark_financial_entry_paid", {
    p_tenant_id: tenantId,
    p_entry_id: entryId,
    p_account_code: accountCode || null,
    p_account_id: accountId || null,
  });
  if (error) throw error;
  return data;
}

export async function deleteFinancialEntry({ tenantId, entryId }) {
  assertSupabaseTenant(tenantId);
  const { data, error } = await supabase.rpc("delete_financial_entry", {
    p_tenant_id: tenantId,
    p_entry_id: entryId,
  });
  if (error) throw error;
  return data;
}

export async function fetchPayablesReceivablesOverview(tenantId) {
  assertSupabaseTenant(tenantId);
  const { data, error } = await supabase.rpc("get_payables_receivables_overview", {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
  return {
    today: data?.today || null,
    kpis: data?.kpis || {
      overdue_payable_total: 0,
      overdue_payable_count: 0,
      due_today_payable_total: 0,
      due_today_payable_count: 0,
      upcoming_30d_payable_total: 0,
      upcoming_30d_payable_count: 0,
      pending_receivable_total: 0,
      pending_receivable_count: 0,
    },
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

export async function createFinancialInstallments({
  tenantId,
  entryType,
  description,
  counterparty = "",
  category = "Outros",
  amount,
  accountCode = "bank",
  firstDueDate = null,
  installments = 1,
  markFirstPaid = false,
  operatorName = null,
  notes = "",
  accountId = null,
}) {
  assertSupabaseTenant(tenantId);
  const { data, error } = await supabase.rpc("create_financial_installments", {
    p_tenant_id: tenantId,
    p_entry_type: entryType,
    p_description: description,
    p_counterparty: counterparty || "",
    p_category: category,
    p_amount: Number(amount || 0),
    p_account_code: accountCode,
    p_first_due_date: firstDueDate || undefined,
    p_installments: Math.max(1, Math.min(24, Number(installments || 1))),
    p_mark_first_paid: Boolean(markFirstPaid),
    p_operator_name: operatorName || resolveLoggedOperatorName(),
    p_notes: notes || "",
    p_account_id: accountId || null,
  });
  if (error) throw error;
  return data;
}

/**
 * Busca a última sessão de caixa fechada para sugerir o troco inicial na abertura.
 * Respeita blind_closing: se o último turno foi fechado em modo cego e não informou
 * troco retido explícito, sugere apenas o initial_float padrão sem expor o contado.
 */
export async function fetchLastClosedFloatSuggestion(tenantId) {
  if (!isSupabaseConfigured() || !supabase || !UUID_REGEX.test(String(tenantId || ""))) {
    return null;
  }
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("id, closed_at, initial_float, counted_cash, retained_float, collected_to_safe, blind_closing")
    .eq("tenant_id", tenantId)
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  if (data.retained_float !== null && data.retained_float !== undefined) {
    return {
      amount: Number(data.retained_float || 0),
      source: "retained_float",
      label: "Troco deixado na gaveta no último fechamento",
      closedAt: data.closed_at,
    };
  }

  if (!data.blind_closing && data.counted_cash !== null && data.counted_cash !== undefined) {
    return {
      amount: Number(data.counted_cash || 0),
      source: "counted_cash",
      label: "Saldo contado no último fechamento",
      closedAt: data.closed_at,
    };
  }

  return {
    amount: Number(data.initial_float || 100),
    source: "initial_float",
    label: "Troco inicial padrão do último turno",
    closedAt: data.closed_at,
  };
}

export const BANK_ACCOUNT_KINDS = [
  { id: "checking", label: "Conta Bancária (Banco / Digital)" },
  { id: "acquirer", label: "Maquininha / App (Repasse)" },
  { id: "savings", label: "Reserva / Poupança" },
];

export async function createBankAccount({
  tenantId,
  name,
  accountKind = "checking",
  initialBalance = 0,
  isDefault = false,
}) {
  assertSupabaseTenant(tenantId);
  const { data, error } = await supabase.rpc("create_financial_bank_account", {
    p_tenant_id: tenantId,
    p_name: name,
    p_account_kind: accountKind,
    p_initial_balance: Number(initialBalance || 0),
    p_is_default: Boolean(isDefault),
  });
  if (error) throw error;
  return data;
}

export async function updateBankAccount({
  tenantId,
  accountId,
  name,
  accountKind = null,
  isDefault = null,
}) {
  assertSupabaseTenant(tenantId);
  const { data, error } = await supabase.rpc("update_financial_bank_account", {
    p_tenant_id: tenantId,
    p_account_id: accountId,
    p_name: name,
    p_account_kind: accountKind,
    p_is_default: isDefault,
  });
  if (error) throw error;
  return data;
}

export async function archiveBankAccount({ tenantId, accountId }) {
  assertSupabaseTenant(tenantId);
  const { data, error } = await supabase.rpc("archive_financial_bank_account", {
    p_tenant_id: tenantId,
    p_account_id: accountId,
  });
  if (error) throw error;
  return data;
}

export async function updateFinancialAccountName({ tenantId, code, name }) {
  if (!tenantId) throw new Error("Loja não identificada.");
  const { data, error } = await supabase.rpc("update_financial_account_name", {
    p_tenant_id: tenantId,
    p_code: code,
    p_name: name,
  });
  if (error) throw error;
  return data;
}

