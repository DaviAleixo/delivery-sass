/**
 * Serviço de Integração com Mercado Pago (via Supabase Edge Function)
 * Utiliza as credenciais próprias de cada restaurante.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://zecuwijuiqsaoeafonsv.supabase.co";
const MP_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/mercadopago`;

/**
 * Valida o Access Token do restaurante junto ao Mercado Pago
 */
export async function testMercadoPagoCredentials(accessToken) {
  if (!accessToken || (!accessToken.startsWith("APP_USR-") && !accessToken.startsWith("TEST-"))) {
    return {
      success: false,
      error: "O Access Token deve iniciar com APP_USR- ou TEST-",
    };
  }

  try {
    const res = await fetch(MP_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "test_credentials",
        accessToken: accessToken.trim(),
      }),
    });

    const data = await res.json();
    return data;
  } catch (err) {
    console.error("[Mercado Pago Service] Erro ao testar credenciais:", err);
    return {
      success: false,
      error: err.message || "Erro de conexão ao testar credenciais",
    };
  }
}

/**
 * Gera uma cobrança PIX para um pedido usando o token da loja
 */
export async function createPixPayment({
  accessToken,
  orderId,
  orderNumber,
  amount,
  description,
  payerEmail,
  payerName,
}) {
  if (!accessToken) {
    return { success: false, error: "A loja não configurou o Mercado Pago" };
  }

  try {
    const res = await fetch(MP_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_pix_payment",
        accessToken: accessToken.trim(),
        orderId,
        orderNumber,
        amount,
        description,
        payerEmail,
        payerName,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return {
        success: false,
        error: data.error || "Falha ao gerar cobrança PIX",
      };
    }

    return data;
  } catch (err) {
    console.error("[Mercado Pago Service] Erro ao criar PIX:", err);
    return {
      success: false,
      error: err.message || "Erro ao conectar com o serviço de PIX",
    };
  }
}

/**
 * Consulta se o pagamento PIX foi aprovado (Polling a cada 3s no checkout)
 */
export async function checkPaymentStatus({ accessToken, paymentId }) {
  if (!accessToken || !paymentId) return { status: "pending", isApproved: false };

  try {
    const res = await fetch(MP_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "check_payment_status",
        accessToken: accessToken.trim(),
        paymentId,
      }),
    });

    if (!res.ok) return { status: "pending", isApproved: false };
    return await res.json();
  } catch (err) {
    return { status: "pending", isApproved: false };
  }
}
