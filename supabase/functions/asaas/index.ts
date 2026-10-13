import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};

// Determina a URL base da API do Asaas (Sandbox ou Produção)
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
  return Deno.env.get("ASAAS_WEBHOOK_SECRET") || Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "whsec_czkgRzSl_Eyqu-Y8ivl57bwty_EnEKo5tO3pqW7uObs";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
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

    // =========================================================================
    // 1. ENDPOINT DE WEBHOOK DO ASAAS (Recebimento de eventos financeiros)
    // =========================================================================
    // O Asaas envia requisições POST com campo "event" no payload
    const isWebhookCall = Boolean(body.event || action === "webhook");

    if (isWebhookCall) {
      const incomingToken = req.headers.get("asaas-access-token") || "";
      const expectedSecret = getAsaasWebhookSecret();

      // Validação do Token Secreto se configurado nas variáveis de ambiente
      if (expectedSecret && incomingToken !== expectedSecret) {
        console.warn("[Asaas Webhook] Tentativa de acesso com token inválido rejeitada.");
        return new Response(JSON.stringify({ error: "Token de webhook não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const eventType = body.event;
      const payment = body.payment || {};
      const subscriptionId = payment.subscription || body.subscription?.id;
      const customerId = payment.customer || body.customer?.id;

      console.log(`[Asaas Webhook] Evento recebido: ${eventType} | Cliente: ${customerId} | Assinatura: ${subscriptionId} | Fatura: ${payment.id}`);

      if (!customerId && !subscriptionId) {
        return new Response(JSON.stringify({ received: true, note: "Sem identificador de cliente/assinatura" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Busca o restaurante (tenant) no Supabase vinculado ao Asaas
      let tenantQuery = supabase.from("tenants").select("id, name, is_active, asaas_customer_id, asaas_subscription_id");
      if (subscriptionId) {
        tenantQuery = tenantQuery.eq("asaas_subscription_id", subscriptionId);
      } else {
        tenantQuery = tenantQuery.eq("asaas_customer_id", customerId);
      }

      const { data: matchedTenants, error: findErr } = await tenantQuery;

      if (findErr || !matchedTenants || matchedTenants.length === 0) {
        console.warn(`[Asaas Webhook] Nenhum restaurante encontrado para o cliente Asaas: ${customerId} / Assinatura: ${subscriptionId}`);
        return new Response(JSON.stringify({ received: true, warning: "Restaurante não localizado no banco" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const targetTenant = matchedTenants[0];

      // A. Pagamento Confirmado / Recebido (Ativação Automática da Loja)
      if (eventType === "PAYMENT_RECEIVED" || eventType === "PAYMENT_CONFIRMED") {
        console.log(`[Asaas Webhook] 💰 Pagamento recebido para a loja "${targetTenant.name}" (${targetTenant.id}). Reativando loja!`);
        
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

        return new Response(JSON.stringify({ 
          success: true, 
          action: "tenant_activated", 
          tenantId: targetTenant.id 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // B. Fatura Vencida e Não Paga (Pausa Automática por Inadimplência)
      if (eventType === "PAYMENT_OVERDUE") {
        console.warn(`[Asaas Webhook] ⚠️ Fatura vencida para a loja "${targetTenant.name}" (${targetTenant.id}). Pausando loja!`);

        await supabase
          .from("tenants")
          .update({
            is_active: false,
            subscription_status: "OVERDUE",
            updated_date: new Date().toISOString()
          })
          .eq("id", targetTenant.id);

        return new Response(JSON.stringify({ 
          success: true, 
          action: "tenant_paused_overdue", 
          tenantId: targetTenant.id 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // C. Pagamento Restaurado / Estornado Regularizado
      if (eventType === "PAYMENT_RESTORED") {
        console.log(`[Asaas Webhook] Pagamento restaurado para a loja "${targetTenant.name}".`);
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

      // D. Assinatura Deletada / Cancelada
      if (eventType === "SUBSCRIPTION_DELETED" || eventType === "SUBSCRIPTION_INACTIVATED") {
        console.log(`[Asaas Webhook] Assinatura cancelada para a loja "${targetTenant.name}". Desativando loja.`);
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

    // =========================================================================
    // 2. CRIAÇÃO DE CLIENTE E ASSINATURA EM 1 CLIQUE (SuperAdmin)
    // =========================================================================
    if (action === "create_customer_and_subscription") {
      if (!asaasApiKey) {
        return new Response(JSON.stringify({ error: "Chave ASAAS_API_KEY não configurada no Supabase" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { name, email, phone, cpfCnpj, monthlyPrice, dueDays = 3 } = body;

      const cleanPhone = String(phone || "").replace(/\D/g, "");
      const cleanCpfCnpj = String(cpfCnpj || "").replace(/\D/g, "");
      const cleanEmail = String(email || "").trim().toLowerCase();

      // 1. Cria ou Busca o Cliente no Asaas
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

      console.log(`[Asaas API] Criando cliente: ${customerPayload.name}`);

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
        console.error("[Asaas Error - Criar Cliente]", custData);
        return new Response(JSON.stringify({ 
          error: custData.errors?.[0]?.description || custData.message || "Erro ao criar cliente no Asaas" 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const customerId = custData.id;

      // 2. Calcula data de primeiro vencimento (hoje + dueDays dias)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + Number(dueDays || 3));
      const nextDueDate = dueDate.toISOString().split("T")[0];

      const val = Number(monthlyPrice || 99.00);

      // 3. Cria a Assinatura Mensal Recorrente
      const subPayload = {
        customer: customerId,
        billingType: "UNDEFINED", // Permite PIX, Boleto e Cartão de Crédito
        value: val,
        nextDueDate,
        cycle: "MONTHLY",
        description: `Mensalidade Plataforma Delivery - ${name || "Restaurante"}`
      };

      console.log(`[Asaas API] Criando assinatura mensal para ${customerId}: R$ ${val}`);

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
        console.error("[Asaas Error - Criar Assinatura]", subData);
        return new Response(JSON.stringify({ 
          error: subData.errors?.[0]?.description || subData.message || "Erro ao criar assinatura no Asaas" 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const subscriptionId = subData.id;

      // 4. Busca a 1ª fatura gerada para obter o link de pagamento imediato
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
      } catch (_e) {
        console.warn("[Asaas] Não foi possível capturar link imediato da 1ª fatura");
      }

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

    // =========================================================================
    // 3. ATUALIZAÇÃO DOS DADOS FISCAIS DO CLIENTE (Autoatendimento Lojista)
    // =========================================================================
    if (action === "update_customer") {
      const { customerId, name, email, phone, cpfCnpj } = body;
      if (!customerId) {
        return new Response(JSON.stringify({ error: "customerId é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
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

    // =========================================================================
    // 4. CONSULTA DE STATUS DA ASSINATURA (Raio-X no SuperAdmin)
    // =========================================================================
    if (action === "get_subscription") {
      const { subscriptionId } = body;
      if (!subscriptionId) {
        return new Response(JSON.stringify({ error: "subscriptionId é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const subRes = await fetch(`${asaasBaseUrl}/subscriptions/${subscriptionId}`, {
        headers: { "access_token": asaasApiKey }
      });
      const subData = await subRes.json();

      let payments: any[] = [];
      try {
        const payRes = await fetch(`${asaasBaseUrl}/subscriptions/${subscriptionId}/payments`, {
          headers: { "access_token": asaasApiKey }
        });
        const payData = await payRes.json();
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
    console.error("[Asaas Edge Function Error]", err);
    return new Response(JSON.stringify({ error: err.message || "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
