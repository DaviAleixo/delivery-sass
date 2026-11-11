import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-idempotency-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};

function isValidEmail(email: unknown): boolean {
  if (typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.endsWith(".internal") || trimmed.endsWith(".local") || trimmed.endsWith(".test") || !trimmed.includes("@")) {
    return false;
  }
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/.test(trimmed);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyMercadoPagoWebhookSignature(
  req: Request,
  dataId: string,
  secret: string
): Promise<boolean> {
  const sigHeader = req.headers.get("x-signature") || "";
  const reqIdHeader = req.headers.get("x-request-id") || "";
  if (!sigHeader) return false;

  const parts: Record<string, string> = {};
  for (const part of sigHeader.split(",")) {
    const [k, v] = part.split("=").map((s) => s.trim());
    if (k && v) parts[k] = v;
  }

  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const manifestSegments: string[] = [];
  if (dataId) manifestSegments.push(`id:${String(dataId).toLowerCase()};`);
  if (reqIdHeader) manifestSegments.push(`request-id:${reqIdHeader};`);
  manifestSegments.push(`ts:${ts};`);
  const manifest = manifestSegments.join("");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const computedHex = Array.from(new Uint8Array(signatureBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqualHex(computedHex, v1.toLowerCase());
}

async function reconcileMpPaymentStatus(
  supabase: any,
  order: any,
  tenant: any,
  mpData: any
): Promise<{ statusCode: number; payload: Record<string, unknown> }> {
  const mpPaymentId = String(mpData?.id || "");
  const mpExternalRef = String(mpData?.external_reference || "");

  const { data: rpcRes, error: rpcErr } = await supabase.rpc("reconcile_mp_payment_atomic", {
    p_order_id: String(order.id),
    p_mp_payment_id: mpPaymentId,
    p_mp_status: String(mpData?.status || "pending"),
    p_mp_status_detail: mpData?.status_detail ? String(mpData.status_detail) : null,
    p_mp_external_ref: mpExternalRef || null,
    p_transaction_amount: Number(mpData?.transaction_amount || 0),
    p_auto_accept_delivery: Boolean(tenant?.auto_accept_delivery),
  });

  if (rpcErr || !rpcRes) {
    console.error("[MercadoPago] Erro em reconcile_mp_payment_atomic:", rpcErr?.message);
    return {
      statusCode: 500,
      payload: {
        status: "reconcile_error",
        isApproved: false,
        error: rpcErr?.message || "Erro interno ao conciliar pagamento."
      }
    };
  }

  const statusCode = Number(rpcRes.status_code || 200);
  if (rpcRes.status === "reference_mismatch") {
    console.error(`[Fraude] external_reference ${mpExternalRef} não corresponde ao pedido ${order.id}`);
  } else if (rpcRes.status === "payment_mismatch") {
    console.error(`[Fraude] mp_payment_id ${mpPaymentId} divergente do esperado ${order.mp_payment_id} no pedido ${order.id}`);
  } else if (rpcRes.status === "fraud_detected") {
    console.error(`[Fraude] Pagamento ${mpPaymentId} aprovou R$ ${mpData?.transaction_amount}, pedido exige R$ ${order.total_amount}`);
  }

  return {
    statusCode,
    payload: {
      status: rpcRes.status || mpData?.status || "pending",
      statusDetail: rpcRes.status_detail ?? mpData?.status_detail ?? null,
      isApproved: Boolean(rpcRes.is_approved),
      resolvedOrderStatus: rpcRes.resolved_order_status,
      idempotentReplay: Boolean(rpcRes.idempotent_replay),
      staleIgnored: Boolean(rpcRes.stale_ignored),
      cancelledConflict: Boolean(rpcRes.cancelled_conflict),
      refundRequired: Boolean(rpcRes.refund_required),
      error: rpcRes.error || undefined
    }
  };
}

async function requireAuthenticatedAdmin(req: Request, supabase: any, targetTenantId?: string | null) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Error("Autenticação obrigatória para esta operação.");
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    throw new Error("Sessão administrativa inválida ou expirada.");
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

  if (member.role !== "super_admin" && targetTenantId && member.tenant_id !== targetTenantId) {
    throw new Error("Acesso negado para operar em outra empresa.");
  }

  return member;
}

/**
 * Recalcula com autoridade máxima o valor total oficial do pedido
 * consultando diretamente as tabelas do Supabase (Zero-Trust + Isolamento por tenant_id)
 */
async function verifyAndRecalculateOrderTotal(supabase: any, orderId: string): Promise<{
  officialTotal: number;
  order: any;
  tenant: any;
  tamperingDetected: boolean;
}> {
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order) {
    throw new Error(`Pedido não encontrado para validação de segurança: ${orderId}`);
  }

  let tenant: any = null;
  if (order.tenant_id) {
    const { data: tData } = await supabase
      .from("tenants")
      .select("id, delivery_fee, free_delivery_threshold, pizza_pricing_rule, auto_accept_delivery, payment_methods")
      .eq("id", order.tenant_id)
      .maybeSingle();
    tenant = tData;
  }

  const items = Array.isArray(order.items)
    ? order.items
    : (typeof order.items === "string" ? JSON.parse(order.items || "[]") : []);

  if (items.length === 0) {
    const fallbackTotal = Number(order.total_amount || 0);
    return { officialTotal: fallbackTotal > 0 ? fallbackTotal : 0.01, order, tenant, tamperingDetected: false };
  }

  const productIds = items.map((i: any) => i.product_id).filter(Boolean);
  const productsMap = new Map<string, any>();

  if (productIds.length > 0 && order.tenant_id) {
    const { data: dbProducts } = await supabase
      .from("products")
      .select("id, price, pizza_prices")
      .eq("tenant_id", order.tenant_id)
      .in("id", productIds);

    if (dbProducts) {
      for (const p of dbProducts) {
        productsMap.set(p.id, p);
      }
    }
  }

  // Coleta adicionais e complement_items apenas do tenant do pedido
  const additionalsMap = new Map<string, number>();
  const complementsById = new Map<string, number>();
  const complementsByName = new Map<string, number>();

  if (order.tenant_id) {
    if (productIds.length > 0) {
      const { data: dbAdditionals } = await supabase
        .from("product_additionals")
        .select("product_id, name, price")
        .eq("tenant_id", order.tenant_id)
        .in("product_id", productIds);

      if (dbAdditionals) {
        for (const add of dbAdditionals) {
          additionalsMap.set(`${add.product_id}_${String(add.name || "").toLowerCase().trim()}`, Number(add.price || 0));
        }
      }
    }

    const { data: dbComplements } = await supabase
      .from("complement_items")
      .select("id, name, price")
      .eq("tenant_id", order.tenant_id);

    if (dbComplements) {
      for (const ci of dbComplements) {
        complementsById.set(ci.id, Number(ci.price || 0));
        complementsByName.set(String(ci.name || "").toLowerCase().trim(), Number(ci.price || 0));
      }
    }
  }

  let officialSubtotal = 0;
  for (const item of items) {
    const qty = Math.max(1, Number(item.quantity || 1));
    const dbProd = productsMap.get(item.product_id);
    let officialItemPrice = dbProd ? Number(dbProd.price || 0) : Number(item.product_price || item.price || 0);

    const sizeKey = item.size_id || item.pizza_size_id;
    if (sizeKey && dbProd?.pizza_prices && dbProd.pizza_prices[sizeKey] !== undefined) {
      officialItemPrice = Number(dbProd.pizza_prices[sizeKey] || officialItemPrice);
    }

    let additionalsTotal = 0;
    if (Array.isArray(item.additionals)) {
      for (const add of item.additionals) {
        const addKey = `${item.product_id}_${String(add.name || "").toLowerCase().trim()}`;
        const addNameKey = String(add.name || "").toLowerCase().trim();
        let officialAddPrice = Number(add.price || 0);

        if (add.id && complementsById.has(add.id)) {
          officialAddPrice = complementsById.get(add.id)!;
        } else if (complementsByName.has(addNameKey)) {
          officialAddPrice = complementsByName.get(addNameKey)!;
        } else if (additionalsMap.has(addKey)) {
          officialAddPrice = additionalsMap.get(addKey)!;
        }

        const addQty = Math.max(1, Number(add.quantity || 1));
        additionalsTotal += officialAddPrice * addQty;
      }
    }

    officialSubtotal += (officialItemPrice + additionalsTotal) * qty;
  }

  // Taxa de entrega oficial (respeita frete de bairro já validado na create_public_order ou fixa)
  let officialDeliveryFee = 0;
  if (order.order_type === "delivery") {
    if (tenant) {
      const freeThreshold = tenant.free_delivery_threshold ? Number(tenant.free_delivery_threshold) : null;
      if (freeThreshold !== null && officialSubtotal >= freeThreshold) {
        officialDeliveryFee = 0;
      } else {
        officialDeliveryFee = Number(order.delivery_fee ?? tenant.delivery_fee ?? 0);
      }
    } else {
      officialDeliveryFee = Number(order.delivery_fee || 0);
    }
  }

  // Cupom filtrado obrigatoriamente por tenant_id!
  let officialDiscount = 0;
  if (order.coupon_code && order.tenant_id) {
    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .eq("tenant_id", order.tenant_id)
      .ilike("code", String(order.coupon_code).trim())
      .eq("active", true)
      .maybeSingle();

    if (coupon) {
      const discVal = Number(coupon.discount_value || 0);
      if (coupon.discount_type === "percentage") {
        officialDiscount = Math.round(((officialSubtotal * discVal) / 100) * 100) / 100;
      } else {
        officialDiscount = Math.min(discVal, officialSubtotal);
      }
    }
  }

  const officialCashbackDiscount = Math.max(0, Number(order.cashback_discount || 0));

  let calculatedTotal = Math.max(0.01, officialSubtotal + officialDeliveryFee - officialDiscount - officialCashbackDiscount);
  calculatedTotal = Math.round(calculatedTotal * 100) / 100;

  const currentOrderTotal = Number(order.total_amount || 0);
  const diff = Math.abs(calculatedTotal - currentOrderTotal);
  const tamperingDetected = diff > 0.05;

  if (tamperingDetected) {
    console.warn(`[Segurança] Divergência de preço detectada no pedido ${order.id}. Registrado: R$ ${currentOrderTotal}, Oficial: R$ ${calculatedTotal}`);
    await supabase
      .from("orders")
      .update({
        total_amount: calculatedTotal,
        total: calculatedTotal,
        subtotal: Math.round(officialSubtotal * 100) / 100,
        delivery_fee: Math.round(officialDeliveryFee * 100) / 100,
        discount_amount: Math.round(officialDiscount * 100) / 100,
        discount: Math.round(officialDiscount * 100) / 100,
        updated_date: new Date().toISOString()
      })
      .eq("id", order.id);
  }

  return { officialTotal: calculatedTotal, order, tenant, tamperingDetected };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const actionParam = url.searchParams.get("action");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    let body: any = {};
    if (req.method === "POST" || req.method === "PUT") {
      try {
        body = await req.json();
      } catch (_e) {
        body = {};
      }
    }

    const action = body.action || actionParam;

    // 0. Webhook / IPN oficial do Mercado Pago (atualiza pagamento mesmo se cliente fechar a aba)
    const isWebhookNotification =
      action === "webhook" ||
      body?.type === "payment" ||
      url.searchParams.get("topic") === "payment" ||
      url.searchParams.get("type") === "payment";

    if (isWebhookNotification) {
      const mpPaymentId = String(
        body?.data?.id ||
        url.searchParams.get("data.id") ||
        url.searchParams.get("id") ||
        ""
      ).trim();
      const orderIdHint = url.searchParams.get("orderId") || body?.orderId || null;

      if (!mpPaymentId || !/^\d+$/.test(mpPaymentId)) {
        return new Response(JSON.stringify({ received: true, ignored: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const webhookSecret = Deno.env.get("MP_WEBHOOK_SECRET") || "";
      if (webhookSecret) {
        const isValidSig = await verifyMercadoPagoWebhookSignature(req, mpPaymentId, webhookSecret);
        if (!isValidSig) {
          return new Response(JSON.stringify({ error: "Assinatura do webhook Mercado Pago inválida." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      let order: any = null;
      if (orderIdHint) {
        const { data: ordById } = await supabase
          .from("orders")
          .select("id, tenant_id, total_amount, order_type, status, payment_status, mp_payment_id, pix_refund_status")
          .eq("id", String(orderIdHint))
          .maybeSingle();
        order = ordById;
      }

      if (!order) {
        const { data: ordByMp } = await supabase
          .from("orders")
          .select("id, tenant_id, total_amount, order_type, status, payment_status, mp_payment_id, pix_refund_status")
          .eq("mp_payment_id", mpPaymentId)
          .maybeSingle();
        order = ordByMp;
      }

      if (!order) {
        return new Response(JSON.stringify({ received: true, matched: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (order.mp_payment_id && String(order.mp_payment_id) !== mpPaymentId) {
        return new Response(JSON.stringify({ error: "mp_payment_id divergente do pedido." }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { data: tenant } = await supabase
        .from("tenants")
        .select("auto_accept_delivery, payment_methods")
        .eq("id", order.tenant_id)
        .maybeSingle();

      const mpAccessToken = tenant?.payment_methods?.mp_access_token || "";
      if (!mpAccessToken) {
        return new Response(JSON.stringify({ received: true, ignored: "missing_store_token" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
        headers: { "Authorization": `Bearer ${mpAccessToken}` }
      });

      if (!mpRes.ok) {
        return new Response(JSON.stringify({ error: "Falha ao consultar pagamento no Mercado Pago" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const mpData = await mpRes.json();
      const result = await reconcileMpPaymentStatus(supabase, order, tenant, mpData);
      return new Response(JSON.stringify({ received: true, ...result.payload }), {
        status: result.statusCode,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1. Testar Credenciais do Lojista (exige Admin autenticado)
    if (action === "test_credentials") {
      await requireAuthenticatedAdmin(req, supabase, body.tenantId || null);

      const { accessToken } = body;
      if (!accessToken || (!accessToken.startsWith("APP_USR-") && !accessToken.startsWith("TEST-"))) {
        return new Response(JSON.stringify({
          success: false,
          error: "Token do Mercado Pago deve iniciar com APP_USR- ou TEST-"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const mpRes = await fetch("https://api.mercadopago.com/users/me", {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      const data = await mpRes.json();

      if (!mpRes.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: data.message || "Credenciais inválidas no Mercado Pago"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        nickname: data.nickname || data.first_name || "Conta Mercado Pago",
        email: data.email
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Criar Cobrança PIX (Token do lojista buscado exclusivamente no servidor via order.tenant_id!)
    if (action === "create_pix_payment") {
      const { orderId, orderNumber, description, payerEmail, payerName, payerPhone } = body;

      if (!orderId) {
        return new Response(JSON.stringify({ error: "Identificador do pedido (orderId) obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { officialTotal, order, tenant, tamperingDetected } = await verifyAndRecalculateOrderTotal(supabase, orderId);

      if (
        String(order?.status || "") === "cancelado" ||
        ["paid", "refunded"].includes(String(order?.payment_status || "").toLowerCase()) ||
        String(order?.pix_refund_status || "").toLowerCase() === "refunded"
      ) {
        return new Response(JSON.stringify({ error: "Este pedido já foi pago, estornado ou cancelado." }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const mpAccessToken = tenant?.payment_methods?.mp_access_token;

      if (!mpAccessToken) {
        return new Response(JSON.stringify({ error: "A loja não possui Access Token do Mercado Pago configurado." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const customerPhone = payerPhone || order?.customer_phone;
      const cleanPhone = String(customerPhone || "").replace(/\D/g, "");
      const fallbackEmail = cleanPhone && cleanPhone.length >= 10
        ? `pix.${cleanPhone}@vruum.com.br`
        : "pix.cliente@vruum.com.br";

      const safeEmail = isValidEmail(payerEmail || order?.customer_email)
        ? String(payerEmail || order?.customer_email).trim().toLowerCase()
        : fallbackEmail;

      const customerName = payerName || order?.customer_name || "Cliente";
      const idempotencyKey = `ord_pix_${orderId}`;

      const mpPayload: Record<string, unknown> = {
        transaction_amount: Number(officialTotal.toFixed(2)),
        description: description || `Pedido #${orderNumber || String(orderId).slice(-6).toUpperCase()}`,
        payment_method_id: "pix",
        payer: {
          email: safeEmail,
          first_name: customerName ? String(customerName).split(" ")[0] : "Cliente",
          last_name: customerName && String(customerName).split(" ").length > 1
            ? String(customerName).split(" ").slice(1).join(" ")
            : "Delivery"
        },
        external_reference: String(orderId)
      };

      if (supabaseUrl && supabaseUrl.startsWith("https://")) {
        mpPayload.notification_url = `${supabaseUrl}/functions/v1/mercadopago?action=webhook&orderId=${encodeURIComponent(String(orderId))}`;
      }

      console.log(`[MercadoPago PIX] Pedido: ${orderId}, Valor Oficial: R$ ${officialTotal}, Adulteração: ${tamperingDetected}`);

      const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mpAccessToken}`,
          "X-Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(mpPayload)
      });

      const mpData = await mpRes.json();

      if (!mpRes.ok) {
        let friendlyMessage = mpData.message || "Erro ao gerar PIX no Mercado Pago";
        const isMissingPixKey =
          String(mpData.message).toLowerCase().includes("collector user without key") ||
          (Array.isArray(mpData.cause) && mpData.cause.some((c: any) => c.code === 13253 || String(c.description).includes("Financial Identity")));

        if (isMissingPixKey) {
          friendlyMessage = "Sua conta do Mercado Pago ainda não tem uma chave PIX cadastrada. Abra o app do Mercado Pago no celular e cadastre uma chave PIX na Área Pix.";
        } else if (String(mpData.message).includes("payer.email")) {
          friendlyMessage = "E-mail do pagador inválido para o Mercado Pago.";
        }

        return new Response(JSON.stringify({
          error: friendlyMessage,
          details: mpData
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (mpData.id) {
        await supabase.rpc("attach_mp_payment_atomic", {
          p_order_id: String(orderId),
          p_mp_payment_id: String(mpData.id),
        });
      }

      const txData = mpData.point_of_interaction?.transaction_data || {};

      return new Response(JSON.stringify({
        success: true,
        paymentId: mpData.id,
        status: mpData.status,
        officialAmount: officialTotal,
        qrCode: txData.qr_code,
        qrCodeBase64: txData.qr_code_base64,
        ticketUrl: txData.ticket_url,
        expirationDate: mpData.date_of_expiration
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. Consultar Status do Pagamento (atualiza status no banco com Service Role após validar vínculo + valor)
    if (action === "check_payment_status") {
      const { paymentId, orderId } = body;
      if (!paymentId || !orderId) {
        return new Response(JSON.stringify({ error: "paymentId e orderId são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { data: order } = await supabase
        .from("orders")
        .select("id, tenant_id, total_amount, order_type, status, payment_status, mp_payment_id, pix_refund_status")
        .eq("id", orderId)
        .maybeSingle();

      if (!order) {
        return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (!order.mp_payment_id || String(paymentId) !== String(order.mp_payment_id)) {
        return new Response(JSON.stringify({
          status: "payment_mismatch",
          isApproved: false,
          error: "O paymentId informado não corresponde à cobrança gerada para este pedido."
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { data: tenant } = await supabase
        .from("tenants")
        .select("auto_accept_delivery, payment_methods")
        .eq("id", order.tenant_id)
        .maybeSingle();

      const mpAccessToken = tenant?.payment_methods?.mp_access_token;
      if (!mpAccessToken) {
        return new Response(JSON.stringify({ error: "Credencial Mercado Pago da loja ausente" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(order.mp_payment_id))}`, {
        headers: { "Authorization": `Bearer ${mpAccessToken}` }
      });
      const mpData = await mpRes.json();

      if (!mpRes.ok) {
        return new Response(JSON.stringify({
          status: "error",
          isApproved: false,
          error: mpData.message || "Falha ao consultar pagamento no Mercado Pago"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const result = await reconcileMpPaymentStatus(supabase, order, tenant, mpData);
      return new Response(JSON.stringify(result.payload), {
        status: result.statusCode,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4. Estorno Total ou Parcial (EXIGE Admin autenticado, idempotente e sincronizado no DB!)
    if (action === "refund_payment") {
      const { paymentId, amount, orderId } = body;
      if (!paymentId) {
        return new Response(JSON.stringify({ error: "paymentId é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      let ord: any = null;
      if (orderId) {
        const { data: ordById } = await supabase
          .from("orders")
          .select("id, tenant_id, total_amount, total, mp_payment_id, pix_refund_status, pix_refund_id, pix_refund_amount")
          .eq("id", String(orderId))
          .maybeSingle();
        ord = ordById;
      } else {
        const { data: ordByMp } = await supabase
          .from("orders")
          .select("id, tenant_id, total_amount, total, mp_payment_id, pix_refund_status, pix_refund_id, pix_refund_amount")
          .eq("mp_payment_id", String(paymentId))
          .maybeSingle();
        ord = ordByMp;
      }

      if (ord?.tenant_id && body.tenantId && String(body.tenantId) !== String(ord.tenant_id)) {
        return new Response(JSON.stringify({ error: "Acesso negado: pedido pertence a outra empresa." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const targetTenantId: string | null = ord?.tenant_id || body.tenantId || null;
      const member = await requireAuthenticatedAdmin(req, supabase, targetTenantId);
      const effectiveTenantId = targetTenantId || member.tenant_id;

      if (ord && ord.mp_payment_id && String(ord.mp_payment_id) !== String(paymentId)) {
        return new Response(JSON.stringify({ error: "paymentId informado não pertence ao pedido especificado." }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (ord && ord.pix_refund_status === "refunded") {
        return new Response(JSON.stringify({
          success: true,
          alreadyRefunded: true,
          refundId: ord.pix_refund_id || null,
          status: "approved",
          amount: Number(ord.pix_refund_amount ?? ord.total_amount ?? ord.total ?? 0)
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      let mpAccessToken = "";
      if (effectiveTenantId) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("payment_methods")
          .eq("id", effectiveTenantId)
          .maybeSingle();
        mpAccessToken = tenant?.payment_methods?.mp_access_token || "";
      }

      if (!mpAccessToken) {
        return new Response(JSON.stringify({ error: "Access token do lojista ausente no cadastro da empresa para estorno" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const refundBody: Record<string, number> = {};
      if (amount && Number(amount) > 0) {
        refundBody.amount = Number(Number(amount).toFixed(2));
      }

      const normalizedAmt = refundBody.amount ? refundBody.amount.toFixed(2) : "full";
      const deterministicIdempotencyKey =
        typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
          ? body.idempotencyKey.trim().slice(0, 128)
          : `ref_${ord?.id || effectiveTenantId}_${String(paymentId)}_${normalizedAmt}`;

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId))}/refunds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mpAccessToken}`,
          "X-Idempotency-Key": deterministicIdempotencyKey
        },
        body: Object.keys(refundBody).length > 0 ? JSON.stringify(refundBody) : undefined
      });

      const mpData = await mpRes.json();

      if (!mpRes.ok) {
        let errorMsg = mpData.message || "Erro ao processar estorno no Mercado Pago";
        const msgLower = String(mpData.message || "").toLowerCase();
        if (msgLower.includes("insufficient_amount") || msgLower.includes("insufficient") || String(mpData.error).includes("insufficient")) {
          errorMsg = "Saldo insuficiente na sua conta Mercado Pago para efetuar o estorno automático.";
        }
        return new Response(JSON.stringify({
          success: false,
          error: errorMsg,
          details: mpData
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const refundedAmt = Number(mpData.amount ?? refundBody.amount ?? ord?.total_amount ?? ord?.total ?? 0);
      if (ord?.id) {
        await supabase.rpc("finalize_mp_refund_atomic", {
          p_order_id: String(ord.id),
          p_refund_id: String(mpData.id || ""),
          p_refund_amount: refundedAmt
        });
      }

      return new Response(JSON.stringify({
        success: true,
        refundId: mpData.id,
        status: mpData.status,
        amount: refundedAmt
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Ação não suportada: " + action }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    const status = String(err.message || "").includes("Autenticação") || String(err.message || "").includes("Sessão")
      ? 401
      : String(err.message || "").includes("Acesso negado")
      ? 403
      : 500;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
