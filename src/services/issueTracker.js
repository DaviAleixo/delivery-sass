import * as Sentry from "@sentry/react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// Cache em memória para anti-spam / deduplicação de erros automáticos (5 minutos)
const recentErrorSignatures = new Map();
const DEDUPLICATION_WINDOW_MS = 5 * 60 * 1000;

/**
 * Cadastra uma pendência no sistema (Manualmente ou via Integrações / Sentry)
 */
export async function reportIssue({
  title,
  description = "",
  severity = "urgent", // 'urgent', 'warning', 'info'
  source = "manual",   // 'manual', 'sentry', 'checkout', 'webhook', 'printer'
  path = null,
  tenant_id = null,
  tenant_name = null,
  metadata = {},
  error = null,
}) {
  let sentryEventId = null;

  // 1. Conexão direta com Sentry (envia erro / mensagem com contexto)
  try {
    Sentry.withScope((scope) => {
      scope.setLevel(severity === "urgent" ? "error" : severity === "warning" ? "warning" : "info");
      scope.setTag("source", source);
      if (path) scope.setTag("path", path);
      if (tenant_id) scope.setTag("tenant_id", tenant_id);
      if (tenant_name) scope.setTag("tenant_name", tenant_name);
      scope.setExtra("custom_metadata", metadata);

      if (error && (error instanceof Error || typeof error === "object")) {
        sentryEventId = Sentry.captureException(error);
      } else {
        sentryEventId = Sentry.captureMessage(`[${source.toUpperCase()}] ${title}`);
      }
    });
  } catch (sentryErr) {
    console.warn("[Sentry] Falha ao despachar evento:", sentryErr);
  }

  // 2. Persistência no Supabase (Tabela public.system_issues)
  let savedIssue = null;
  if (isSupabaseConfigured() && supabase) {
    try {
      const payload = {
        p_title: title.trim(),
        p_description: description?.trim() || null,
        p_severity: severity,
        p_source: source,
        p_path: path?.trim() || null,
        p_tenant_id: tenant_id || null,
        p_tenant_name: tenant_name || null,
        p_sentry_event_id: sentryEventId || metadata?.sentry_event_id || null,
        p_metadata: metadata || {},
      };

      const { data, error: rpcError } = await supabase.rpc("report_system_issue", payload);
      if (!rpcError && data) {
        savedIssue = data;
      } else {
        // Fallback para inserção direta
        const { data: inserted, error: insertError } = await supabase
          .from("system_issues")
          .insert([{
            title: title.trim(),
            description: description?.trim() || null,
            severity,
            source,
            status: "open",
            path: path?.trim() || null,
            tenant_id: tenant_id || null,
            tenant_name: tenant_name || null,
            sentry_event_id: sentryEventId || metadata?.sentry_event_id || null,
            metadata: metadata || {},
          }])
          .select()
          .single();

        if (!insertError && inserted) {
          savedIssue = inserted;
        }
      }
    } catch (dbErr) {
      console.error("[IssueTracker] Erro ao salvar pendência no banco:", dbErr);
    }
  }

  // Fallback local se estiver offline
  if (!savedIssue) {
    savedIssue = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `issue_${Date.now()}`,
      title,
      description,
      severity,
      source,
      status: "open",
      path,
      tenant_id,
      tenant_name,
      sentry_event_id: sentryEventId,
      metadata,
      created_at: new Date().toISOString(),
    };
  }

  // Notifica ouvintes locais (ex: tela do SuperAdmin em tempo real)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("system_issue_reported", { detail: savedIssue }));
  }

  return savedIssue;
}

/**
 * Captura automática disparada pelo hook beforeSend do Sentry
 */
export async function autoCaptureSentryEvent(event, hint) {
  try {
    const error = hint?.originalException;
    const message = event?.message || error?.message || "Erro detectado no sistema";
    const path = typeof window !== "undefined" ? window.location.pathname : null;
    const currentTenantId = typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null;
    const currentTenantName = typeof window !== "undefined" ? localStorage.getItem("current_tenant_name") : null;

    // Assinatura única para deduplicação
    const signature = `${message}_${path}_${currentTenantId}`;
    const lastReported = recentErrorSignatures.get(signature);
    if (lastReported && Date.now() - lastReported < DEDUPLICATION_WINDOW_MS) {
      return; // Ignora duplicatas na mesma janela de 5 min
    }
    recentErrorSignatures.set(signature, Date.now());

    // Determina a categoria do erro
    let source = "sentry";
    let severity = "urgent";
    const lowerMsg = (message + " " + (path || "")).toLowerCase();

    if (lowerMsg.includes("checkout") || lowerMsg.includes("pix") || lowerMsg.includes("mercadopago") || lowerMsg.includes("order")) {
      source = "checkout";
      severity = "urgent";
    } else if (lowerMsg.includes("webhook") || lowerMsg.includes("asaas")) {
      source = "webhook";
      severity = "urgent";
    } else if (lowerMsg.includes("print") || lowerMsg.includes("impressora")) {
      source = "printer";
      severity = "warning";
    }

    await reportIssue({
      title: `[${source.toUpperCase()}] ${message.slice(0, 100)}`,
      description: error?.stack || event?.exception?.values?.[0]?.value || message,
      severity,
      source,
      path,
      tenant_id: currentTenantId,
      tenant_name: currentTenantName,
      metadata: {
        sentry_event_id: event?.event_id,
        level: event?.level,
        browser: navigator?.userAgent,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn("[IssueTracker] Falha no auto-capture:", err);
  }
}

/**
 * Lista pendências com filtros
 */
export async function fetchSystemIssues({ status = null, severity = null, source = null, search = "" } = {}) {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  try {
    let query = supabase
      .from("system_issues")
      .select("*")
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (severity && severity !== "all") {
      query = query.eq("severity", severity);
    }
    if (source && source !== "all") {
      query = query.eq("source", source);
    }

    const { data, error } = await query;
    if (error) throw error;

    let list = Array.isArray(data) ? data : [];
    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      list = list.filter((i) =>
        i.title?.toLowerCase().includes(term) ||
        i.description?.toLowerCase().includes(term) ||
        i.path?.toLowerCase().includes(term) ||
        i.tenant_name?.toLowerCase().includes(term)
      );
    }

    return list;
  } catch (err) {
    console.error("[IssueTracker] Erro ao listar pendências:", err);
    return [];
  }
}

/**
 * Marca uma pendência como resolvida
 */
export async function resolveSystemIssue(issueId, resolvedBy = "SuperAdmin") {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    const { data, error } = await supabase.rpc("resolve_system_issue", {
      p_issue_id: issueId,
      p_resolved_by: resolvedBy,
    });
    if (!error && data) return true;

    // Fallback
    const { error: directErr } = await supabase
      .from("system_issues")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
      })
      .eq("id", issueId);

    return !directErr;
  } catch (err) {
    console.error("[IssueTracker] Erro ao resolver pendência:", err);
    return false;
  }
}

/**
 * Reabre uma pendência resolvida
 */
export async function reopenSystemIssue(issueId) {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    const { data, error } = await supabase.rpc("reopen_system_issue", {
      p_issue_id: issueId,
    });
    if (!error && data) return true;

    // Fallback
    const { error: directErr } = await supabase
      .from("system_issues")
      .update({
        status: "open",
        resolved_at: null,
        resolved_by: null,
      })
      .eq("id", issueId);

    return !directErr;
  } catch (err) {
    console.error("[IssueTracker] Erro ao reabrir pendência:", err);
    return false;
  }
}

/**
 * Altera status intermediário (ex: 'in_progress')
 */
export async function updateSystemIssueStatus(issueId, newStatus) {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    const { error } = await supabase
      .from("system_issues")
      .update({ status: newStatus })
      .eq("id", issueId);
    return !error;
  } catch (err) {
    console.error("[IssueTracker] Erro ao mudar status da pendência:", err);
    return false;
  }
}

/**
 * Exclui uma pendência
 */
export async function deleteSystemIssue(issueId) {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    const { error } = await supabase
      .from("system_issues")
      .delete()
      .eq("id", issueId);
    return !error;
  } catch (err) {
    console.error("[IssueTracker] Erro ao excluir pendência:", err);
    return false;
  }
}

/**
 * Utilitário de Simulação para Teste do Davi:
 * Dispara uma exceção no Sentry e cadastra uma pendência de teste
 */
export async function simulateSentryTestIssue(type = "checkout") {
  const simulatedErrors = {
    checkout: {
      title: "Falha na geração de PIX Mercado Pago (Gateway Timeout)",
      description: "Error: Request failed with status code 504. The payment gateway did not return the QR Code copia-e-cola in time for order ord_982312.",
      severity: "urgent",
      source: "checkout",
      path: "/texas-grill/menu/checkout",
      tenant_name: "Texas Grill Burgers",
    },
    webhook: {
      title: "Webhook do Asaas rejeitado: Falha de autenticação do token",
      description: "Error: Invalid webhook signature. Token header 'asaas-access-token' was rejected by Edge Function asaas. Event PAYMENT_OVERDUE missed.",
      severity: "urgent",
      source: "webhook",
      path: "/functions/v1/asaas",
      tenant_name: "Vruum Burguer",
    },
    printer: {
      title: "Impressora Térmica travada: 6 pedidos acumulados na fila há 15 min",
      description: "Warning: Fifo print queue has 6 orders pending print. The printer in store 'Pizzaria Bella' is offline or out of paper roll.",
      severity: "warning",
      source: "printer",
      path: "/pizzaria-bella/Orders",
      tenant_name: "Pizzaria Bella",
    },
  };

  const chosen = simulatedErrors[type] || simulatedErrors.checkout;
  const simulatedErr = new Error(`[SENTRY_SIMULATION] ${chosen.title}`);

  return await reportIssue({
    ...chosen,
    error: simulatedErr,
    metadata: {
      simulated: true,
      tested_at: new Date().toISOString(),
    },
  });
}
