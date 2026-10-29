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

/**
 * Recalcula com autoridade máxima o valor total oficial do pedido
 * consultando diretamente as tabelas do Supabase (Zero-Trust)
 */
async function verifyAndRecalculateOrderTotal(supabase: any, orderId: string): Promise<{
  officialTotal: number;
  order: any;
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

  const items = Array.isArray(order.items) 
    ? order.items 
    : (typeof order.items === "string" ? JSON.parse(order.items || "[]") : []);

  if (items.length === 0) {
    const fallbackTotal = Number(order.total_amount || 0);
    return { officialTotal: fallbackTotal > 0 ? fallbackTotal : 0.01, order, tamperingDetected: false };
  }

  // 1. Coleta IDs de produtos para buscar preços oficiais no banco
  const productIds = items.map((i: any) => i.product_id).filter(Boolean);
  const productsMap = new Map<string, number>();

  if (productIds.length > 0) {
    const { data: dbProducts } = await supabase
      .from("products")
      .select("id, price")
      .in("id", productIds);

    if (dbProducts) {
      for (const p of dbProducts) {
        productsMap.set(p.id, Number(p.price || 0));
      }
    }
  }

  // 2. Coleta preços oficiais de adicionais e complementos
  const { data: dbAdditionals } = await supabase
    .from("product_additionals")
    .select("product_id, name, price")
    .in("product_id", productIds);

  const additionalsMap = new Map<string, number>();
  if (dbAdditionals) {
    for (const add of dbAdditionals) {
      additionalsMap.set(`${add.product_id}_${add.name.toLowerCase().trim()}`, Number(add.price || 0));
    }
  }

  // 3. Recalcula Subtotal dos Itens
  let officialSubtotal = 0;
  for (const item of items) {
    const qty = Math.max(1, Number(item.quantity || 1));
    // Preço oficial do banco se existir; fallback para item.price se produto foi customizado
    const officialItemPrice = productsMap.has(item.product_id)
      ? productsMap.get(item.product_id)!
      : Number(item.product_price || item.price || 0);

    let additionalsTotal = 0;
    if (Array.isArray(item.additionals)) {
      for (const add of item.additionals) {
        const addKey = `${item.product_id}_${(add.name || "").toLowerCase().trim()}`;
        const officialAddPrice = additionalsMap.has(addKey)
          ? additionalsMap.get(addKey)!
          : Number(add.price || 0);
        additionalsTotal += officialAddPrice;
      }
    }

    officialSubtotal += (officialItemPrice + additionalsTotal) * qty;
  }

  // 4. Taxa de Entrega Oficial da Loja
  let officialDeliveryFee = 0;
  if (order.order_type === "delivery" && order.tenant_id) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("delivery_fee, free_delivery_threshold")
      .eq("id", order.tenant_id)
      .maybeSingle();

    if (tenant) {
      const baseFee = Number(tenant.delivery_fee || 0);
      const freeThreshold = tenant.free_delivery_threshold ? Number(tenant.free_delivery_threshold) : null;
      if (freeThreshold !== null && officialSubtotal >= freeThreshold) {
        officialDeliveryFee = 0;
      } else {
        officialDeliveryFee = baseFee;
      }
    } else {
      officialDeliveryFee = Number(order.delivery_fee || 0);
    }
  }

  // 5. Cupom Oficial de Desconto
  let officialDiscount = 0;
  if (order.coupon_code) {
    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", String(order.coupon_code).toUpperCase().trim())
      .eq("active", true)
      .maybeSingle();

    if (coupon) {
      const discVal = Number(coupon.discount_value || 0);
      if (coupon.discount_type === "percentage") {
        officialDiscount = (officialSubtotal * discVal) / 100;
      } else {
        officialDiscount = discVal;
      }
    }
  }

  // 6. Total Oficial Inviolável
  let calculatedTotal = Math.max(0.01, officialSubtotal + officialDeliveryFee - officialDiscount);
  // Arredonda para 2 casas decimais
  calculatedTotal = Math.round(calculatedTotal * 100) / 100;

  const currentOrderTotal = Number(order.total_amount || 0);
  const diff = Math.abs(calculatedTotal - currentOrderTotal);
  const tamperingDetected = diff > 0.05; // Margem para arredondamento de centavos

  // Se o valor estiver adulterado ou desatualizado no banco, sincroniza com o valor oficial
  if (tamperingDetected) {
    console.warn(`[Segurança] Divergência de preço detectada no pedido ${order.id}. Registrado no banco: R$ ${currentOrderTotal}, Oficial Recalculado: R$ ${calculatedTotal}`);
    await supabase
      .from("orders")
      .update({
        total_amount: calculatedTotal.toFixed(2),
        subtotal: officialSubtotal.toFixed(2),
        delivery_fee: officialDeliveryFee.toFixed(2),
        discount_amount: officialDiscount.toFixed(2),
        updated_date: new Date().toISOString()
      })
      .eq("id", order.id);
  }

  return { officialTotal: calculatedTotal, order, tamperingDetected };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const actionParam = url.searchParams.get("action");

  // Instancia cliente Supabase com Service Role para consultas autoritativas
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
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

    // 1. Testar Credenciais do Lojista
    if (action === "test_credentials") {
      const { accessToken } = body;
      if (!accessToken || !accessToken.startsWith("APP_USR-")) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Token do Mercado Pago deve iniciar com APP_USR-" 
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

    // 2. Criar Cobrança PIX com Blindagem de Preço no Backend
    if (action === "create_pix_payment") {
      const { 
        accessToken, 
        orderId, 
        orderNumber, 
        description, 
        payerEmail, 
        payerName,
        payerPhone,
      } = body;

      if (!accessToken) {
        return new Response(JSON.stringify({ error: "Access Token do lojista ausente" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (!orderId) {
        return new Response(JSON.stringify({ error: "Identificador do pedido (orderId) obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 🛡️ RECALCULA O VALOR OFICIAL NO BACKEND (IGNORA QUALQUER VALOR VINDO DO CLIENTE)
      const { officialTotal, order, tamperingDetected } = await verifyAndRecalculateOrderTotal(supabase, orderId);

      // Garante e-mail público e válido para o validador rigoroso do Mercado Pago
      const customerPhone = payerPhone || order?.customer_phone;
      const cleanPhone = String(customerPhone || "").replace(/\D/g, "");
      const fallbackEmail = cleanPhone && cleanPhone.length >= 10
        ? `pix.${cleanPhone}@vruum.com.br`
        : "pix.cliente@vruum.com.br";

      const safeEmail = isValidEmail(payerEmail || order?.customer_email)
        ? String(payerEmail || order?.customer_email).trim().toLowerCase()
        : fallbackEmail;

      const customerName = payerName || order?.customer_name || "Cliente";
      // Chave de idempotência estritamente determinística amarrada ao ID do pedido
      const idempotencyKey = `ord_pix_${orderId}`;

      const mpPayload = {
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

      console.log(`[MercadoPago PIX] Gerando PIX Oficial. Pedido: ${orderId}, Valor Oficial: R$ ${officialTotal}, Adulteração Detectada: ${tamperingDetected}`);

      const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "X-Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(mpPayload)
      });

      const mpData = await mpRes.json();

      if (!mpRes.ok) {
        console.error("[MercadoPago Error]", mpData);

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

    // 3. Consultar Status do Pagamento (Polling ou Webhook) com Verificação de Valor
    if (action === "check_payment_status") {
      const { accessToken, paymentId, orderId } = body;
      if (!accessToken || !paymentId) {
        return new Response(JSON.stringify({ error: "accessToken e paymentId são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      const mpData = await mpRes.json();

      const isApproved = mpData.status === "approved";

      // Validação de segurança: se aprovado, confere se o valor pago bate com o pedido
      if (isApproved && orderId) {
        const { data: order } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("id", orderId)
          .maybeSingle();

        if (order && Number(mpData.transaction_amount) < (Number(order.total_amount) - 0.05)) {
          console.error(`[Fraude] Pagamento ${paymentId} aprovou valor R$ ${mpData.transaction_amount}, mas o pedido exige R$ ${order.total_amount}!`);
          return new Response(JSON.stringify({
            status: "fraud_detected",
            isApproved: false,
            error: "Valor pago no Mercado Pago é inferior ao valor do pedido."
          }), {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      return new Response(JSON.stringify({
        status: mpData.status,
        statusDetail: mpData.status_detail,
        isApproved
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4. Estorno Total ou Parcial de Pagamento PIX
    if (action === "refund_payment") {
      const { accessToken, paymentId, amount } = body;
      if (!accessToken || !paymentId) {
        return new Response(JSON.stringify({ error: "accessToken e paymentId são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const refundBody: any = {};
      if (amount && Number(amount) > 0) {
        refundBody.amount = Number(Number(amount).toFixed(2));
      }

      console.log(`[MercadoPago Refund] Iniciando estorno do pagamento ${paymentId}. Valor: ${amount || 'Total'}`);

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "X-Idempotency-Key": `ref_${paymentId}_${Date.now()}`
        },
        body: Object.keys(refundBody).length > 0 ? JSON.stringify(refundBody) : undefined
      });

      const mpData = await mpRes.json();

      if (!mpRes.ok) {
        console.error("[MercadoPago Refund Error]", mpData);
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

      return new Response(JSON.stringify({
        success: true,
        refundId: mpData.id,
        status: mpData.status,
        amount: mpData.amount
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Ação não suportada: " + action }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
