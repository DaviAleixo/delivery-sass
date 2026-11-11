import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};

function getAsaasBaseUrl(): string {
  const customUrl = Deno.env.get("ASAAS_API_URL");
  if (customUrl) return customUrl.replace(/\/+$/, "");

  const env = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

function getAsaasApiKey(): string {
  return Deno.env.get("ASAAS_API_KEY") || "";
}

function getAsaasWebhookSecret(): string {
  return Deno.env.get("ASAAS_WEBHOOK_SECRET") || Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "";
}

async function requireSuperAdminOrTenantAdmin(req: Request, supabase: any, requireSuperAdminOnly = true) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Error("Autenticação obrigatória.");
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    throw new Error("Token de sessão inválido.");
  }

  const { data: member } = await supabase
    .from("tenant_admins")
    .select("tenant_id, role, is_active")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!member) {
    throw new Error("Usuário sem vínculo administrativo ativo.");
  }

  if (requireSuperAdminOnly && member.role !== "super_admin") {
    throw new Error("Acesso negado: restrito ao SuperAdmin.");
  }

  return member;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const asaasBaseUrl = getAsaasBaseUrl();
  const asaasApiKey = getAsaasApiKey();

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (_e) {
      body = {};
    }

    const url = new URL(req.url);
    const action = body.action || url.searchParams.get("action");

    // 1. ENDPOINT DE WEBHOOK DO ASAAS
    const isWebhookCall = Boolean(body.event || action === "webhook");

    if (isWebhookCall) {
      const incomingToken = req.headers.get("asaas-access-token") || "";
      const expectedSecret = getAsaasWebhookSecret();

      if (!expectedSecret || incomingToken !== expectedSecret) {
        console.warn("[Asaas Webhook] Token de webhook ausente, não configurado ou inválido.");
        return new Response(JSON.stringify({ error: "Token de webhook não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const eventType = body.event;
      const payment = body.payment || {};
      const subscriptionId = payment.subscription || body.subscription?.id;
      const customerId = payment.customer || body.customer?.id;

      if (!customerId && !subscriptionId) {
        return new Response(JSON.stringify({ received: true, note: "Sem identificador de cliente/assinatura" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      let tenantQuery = supabase.from("tenants").select("id, name, is_active, asaas_customer_id, asaas_subscription_id");
      if (subscriptionId) {
        tenantQuery = tenantQuery.eq("asaas_subscription_id", subscriptionId);
      } else {
        tenantQuery = tenantQuery.eq("asaas_customer_id", customerId);
      }

      const { data: matchedTenants, error: findErr } = await tenantQuery;
      if (findErr || !matchedTenants || matchedTenants.length === 0) {
        return new Response(JSON.stringify({ received: true, warning: "Restaurante não localizado no banco" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const targetTenant = matchedTenants[0];

      if (eventType === "PAYMENT_RECEIVED" || eventType === "PAYMENT_CONFIRMED") {
        await supabase
          .from("tenants")
          .update({
            is_active: true,
            subscription_status: "ACTIVE",
            last_payment_date: new Date().toISOString(),
            last_payment_id: payment.id || undefined,
            payment_link: payment.invoiceUrl || payment.bankSlipUrl || undefined,
            next_due_date: payment.dueDate || undefined,
            updated_date: new Date().toISOString()
          })
          .eq("id", targetTenant.id);

        return new Response(JSON.stringify({ success: true, action: "tenant_activated", tenantId: targetTenant.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (eventType === "PAYMENT_OVERDUE") {
        await supabase
          .from("tenants")
          .update({
            is_active: false,
            subscription_status: "OVERDUE",
            updated_date: new Date().toISOString()
          })
          .eq("id", targetTenant.id);

        return new Response(JSON.stringify({ success: true, action: "tenant_paused_overdue", tenantId: targetTenant.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (eventType === "PAYMENT_RESTORED") {
        await supabase
          .from("tenants")
          .update({
            is_active: true,
            subscription_status: "ACTIVE",
            updated_date: new Date().toISOString()
          })
          .eq("id", targetTenant.id);

        return new Response(JSON.stringify({ success: true, action: "tenant_restored" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (eventType === "SUBSCRIPTION_DELETED" || eventType === "SUBSCRIPTION_INACTIVATED") {
        await supabase
          .from("tenants")
          .update({
            is_active: false,
            subscription_status: "INACTIVE",
            updated_date: new Date().toISOString()
          })
          .eq("id", targetTenant.id);

        return new Response(JSON.stringify({ success: true, action: "tenant_inactivated" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ received: true, event: eventType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. CRIAÇÃO DE CLIENTE E ASSINATURA (Exige SuperAdmin autenticado)
    if (action === "create_customer_and_subscription") {
      await requireSuperAdminOrTenantAdmin(req, supabase, true);

      const { name, email, phone, cpfCnpj, monthlyPrice, dueDays = 3 } = body;
      const val = (monthlyPrice !== undefined && monthlyPrice !== null && monthlyPrice !== "")
        ? Number(monthlyPrice)
        : 99.00;

      if (isNaN(val) || val <= 0) {
        return new Response(JSON.stringify({
          success: true,
          skipped: true,
          value: 0,
          message: "Plano gratuito (R$ 0,00): assinatura Asaas dispensada."
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (!asaasApiKey) {
        return new Response(JSON.stringify({ error: "Chave ASAAS_API_KEY não configurada no Supabase" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const cleanPhone = String(phone || "").replace(/\D/g, "");
      const cleanCpfCnpj = String(cpfCnpj || "").replace(/\D/g, "");
      const cleanEmail = String(email || "").trim().toLowerCase();

      const customerPayload: any = {
        name: name || "Restaurante Parceiro",
        email: cleanEmail || "financeiro@restaurante.com",
        notificationDisabled: false
      };
      if (cleanPhone) {
        customerPayload.phone = cleanPhone;
        customerPayload.mobilePhone = cleanPhone;
      }
      if (cleanCpfCnpj) {
        customerPayload.cpfCnpj = cleanCpfCnpj;
      }

      const custRes = await fetch(`${asaasBaseUrl}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": asaasApiKey
        },
        body: JSON.stringify(customerPayload)
      });

      const custData = await custRes.json();
      if (!custRes.ok) {
        return new Response(JSON.stringify({
          error: custData.errors?.[0]?.description || custData.message || "Erro ao criar cliente no Asaas"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const customerId = custData.id;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + Number(dueDays || 3));
      const nextDueDate = dueDate.toISOString().split("T")[0];

      const subPayload = {
        customer: customerId,
        billingType: "UNDEFINED",
        value: val,
        nextDueDate,
        cycle: "MONTHLY",
        description: `Mensalidade Plataforma Delivery - ${name || "Restaurante"}`
      };

      const subRes = await fetch(`${asaasBaseUrl}/subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": asaasApiKey
        },
        body: JSON.stringify(subPayload)
      });

      const subData = await subRes.json();
      if (!subRes.ok) {
        return new Response(JSON.stringify({
          error: subData.errors?.[0]?.description || subData.message || "Erro ao criar assinatura no Asaas"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const subscriptionId = subData.id;
      let paymentLink = "";
      let paymentId = "";

      try {
        const payRes = await fetch(`${asaasBaseUrl}/subscriptions/${subscriptionId}/payments`, {
          headers: { "access_token": asaasApiKey }
        });
        const payData = await payRes.json();
        if (payData?.data && payData.data.length > 0) {
          const firstPay = payData.data[0];
          paymentId = firstPay.id;
          paymentLink = firstPay.invoiceUrl || firstPay.bankSlipUrl || "";
        }
      } catch (_e) {}

      return new Response(JSON.stringify({
        success: true,
        customerId,
        subscriptionId,
        paymentId,
        paymentLink,
        nextDueDate,
        value: val
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. ATUALIZAÇÃO DOS DADOS FISCAIS DO CLIENTE (Admin da própria loja ou SuperAdmin)
    if (action === "update_customer") {
      const member = await requireSuperAdminOrTenantAdmin(req, supabase, false);
      const { customerId, name, email, phone, cpfCnpj } = body;
      if (!customerId) {
        return new Response(JSON.stringify({ error: "customerId é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (member.role !== "super_admin") {
        const { data: ownTenant } = await supabase
          .from("tenants")
          .select("asaas_customer_id")
          .eq("id", member.tenant_id)
          .maybeSingle();
        if (!ownTenant || ownTenant.asaas_customer_id !== customerId) {
          return new Response(JSON.stringify({ error: "Acesso negado ao customerId informado." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      const cleanPhone = String(phone || "").replace(/\D/g, "");
      const cleanCpfCnpj = String(cpfCnpj || "").replace(/\D/g, "");

      const updatePayload: any = {};
      if (name) updatePayload.name = name;
      if (email) updatePayload.email = email.trim().toLowerCase();
      if (cleanPhone) {
        updatePayload.phone = cleanPhone;
        updatePayload.mobilePhone = cleanPhone;
      }
      if (cleanCpfCnpj) updatePayload.cpfCnpj = cleanCpfCnpj;

      const res = await fetch(`${asaasBaseUrl}/customers/${customerId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": asaasApiKey
        },
        body: JSON.stringify(updatePayload)
      });

      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.errors?.[0]?.description || "Erro ao atualizar no Asaas" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ success: true, customer: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4. CONSULTA DE STATUS DA ASSINATURA (Exige SuperAdmin ou Admin da loja dona da assinatura)
    if (action === "get_subscription") {
      const member = await requireSuperAdminOrTenantAdmin(req, supabase, false);
      const { subscriptionId } = body;
      if (!subscriptionId) {
        return new Response(JSON.stringify({ error: "subscriptionId é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (member.role !== "super_admin") {
        const { data: ownTenant } = await supabase
          .from("tenants")
          .select("asaas_subscription_id")
          .eq("id", member.tenant_id)
          .maybeSingle();
        if (!ownTenant || ownTenant.asaas_subscription_id !== subscriptionId) {
          return new Response(JSON.stringify({ error: "Acesso negado à assinatura informada." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      const subRes = await fetch(`${asaasBaseUrl}/subscriptions/${subscriptionId}`, {
        headers: { "access_token": asaasApiKey }
      });
      const subData = await subRes.json().catch(() => ({}));

      let payments: any[] = [];
      try {
        const payRes = await fetch(`${asaasBaseUrl}/subscriptions/${subscriptionId}/payments`, {
          headers: { "access_token": asaasApiKey }
        });
        const payData = await payRes.json().catch(() => ({}));
        payments = payData.data || [];
      } catch (_e) {}

      return new Response(JSON.stringify({
        subscription: subData,
        payments
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Ação não suportada: " + action }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    const msg = String(err.message || "Erro interno do servidor");
    const status = msg.includes("Autenticação") || msg.includes("Token")
      ? 401
      : msg.includes("Acesso negado") || msg.includes("vínculo")
      ? 403
      : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
