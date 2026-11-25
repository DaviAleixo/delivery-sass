// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { action, phone, code, full_name, tenant_id } = body;

    // =========================================================================
    // AÇÃO 1: ENVIAR CÓDIGO OTP (SEND_OTP)
    // =========================================================================
    if (action === "send_otp") {
      if (!phone) {
        return new Response(
          JSON.stringify({ success: false, error: "Telefone é obrigatório." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanPhoneInput = String(phone).replace(/\D/g, "");
      if (cleanPhoneInput.length < 10) {
        return new Response(
          JSON.stringify({ success: false, error: "Telefone inválido (mínimo 10 dígitos com DDD)." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =========================================================================
      // 0. VERIFICAÇÃO DE RATE LIMIT / INTERVALO PROGRESSIVO (PROTEÇÃO ANTI-SPAM)
      // Isolado individualmente por telefone (cleanPhoneInput).
      // Regras de restauração / reset:
      // - Se o cliente validar o código com sucesso (verified=true), a penalidade zera.
      // - Se passar 1 hora sem tentativas (janela deslizante), o tempo restaura para o nível inicial.
      //
      // Escada de Espera:
      // 1º reenvio: 1 minuto (60s)
      // 2º reenvio: 5 minutos (300s)
      // 3º reenvio: 10 minutos (600s)
      // 4º reenvio: 30 minutos (1800s)
      // 5º+ reenvio: 1 hora (3600s)
      // =========================================================================
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentCodes } = await supabase
          .from("whatsapp_otp_codes")
          .select("created_at, verified")
          .eq("phone", cleanPhoneInput)
          .eq("verified", false)
          .gte("created_at", oneHourAgo)
          .order("created_at", { ascending: false })
          .limit(10);

        if (recentCodes && recentCodes.length > 0) {
          const lastSentAt = new Date(recentCodes[0].created_at).getTime();
          const diffSeconds = Math.floor((Date.now() - lastSentAt) / 1000);
          const attemptCount = recentCodes.length;

          let requiredWait = 60; // 1 min (1º reenvio)
          if (attemptCount === 2) requiredWait = 300; // 5 min (2º reenvio)
          else if (attemptCount === 3) requiredWait = 600; // 10 min (3º reenvio)
          else if (attemptCount === 4) requiredWait = 1800; // 30 min (4º reenvio)
          else if (attemptCount >= 5) requiredWait = 3600; // 1 hora (5º+ reenvio)

          if (diffSeconds < requiredWait) {
            const waitRemaining = requiredWait - diffSeconds;
            let waitMsg = `${waitRemaining}s`;
            if (waitRemaining >= 60 && waitRemaining < 3600) {
              const mins = Math.ceil(waitRemaining / 60);
              waitMsg = `${mins} minuto${mins > 1 ? "s" : ""}`;
            } else if (waitRemaining >= 3600) {
              const hours = Math.ceil(waitRemaining / 3600);
              waitMsg = `${hours} hora${hours > 1 ? "s" : ""}`;
            }

            return new Response(
              JSON.stringify({
                success: false,
                error: `Aguarde ${waitMsg} antes de solicitar um novo código por SMS.`,
                wait_seconds: waitRemaining,
                rate_limited: true,
              }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      } catch (rateErr) {
        console.warn("[Rate Limit Check Warning]:", rateErr);
      }

      // 1. Gera e registra o OTP no banco via RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc("request_whatsapp_otp", {
        p_phone: phone,
        p_full_name: full_name || "",
        p_tenant_id: tenant_id || null,
      });

      if (rpcError || !rpcData?.success) {
        return new Response(
          JSON.stringify({ success: false, error: rpcError?.message || rpcData?.error || "Erro ao gerar código." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const generatedCode = rpcData.code;
      const cleanPhone = rpcData.phone;
      const fullPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

      // =========================================================================
      // 2. DISPARO VIA COMTELE SMS (api.comtele.com.br) — PRIORITÁRIO
      // =========================================================================
      const comteleApiKey = Deno.env.get("COMTELE_API_KEY") || "566e82dc-b734-4267-8349-487fffd59a9b";
      if (comteleApiKey) {
        try {
          const comteleUrl = "https://api.comtele.com.br/messages/sms/send";
          const comtelePayload = {
            receivers: [fullPhone],
            message: `Seu codigo de acesso ao PedeMuleke e: ${generatedCode}. Valido por 10 minutos.`,
            route: 1,
          };

          const smsRes = await fetch(comteleUrl, {
            method: "POST",
            headers: {
              "x-api-key": comteleApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(comtelePayload),
          });

          const smsResult = await smsRes.json().catch(() => ({}));
          console.log("[Comtele SMS Response]:", smsResult);

          if (smsRes.ok && (smsResult.hasError === false || smsResult.Success === true || smsResult.success === true)) {
            return new Response(
              JSON.stringify({
                success: true,
                message: "Código de verificação enviado por SMS via Comtele!",
                phone: cleanPhone,
                channel: "comtele",
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } else {
            console.warn("[Comtele SMS Warning]:", smsResult);
          }
        } catch (smsErr: any) {
          console.error("[Comtele SMS Request Error]:", smsErr);
        }
      }

      // =========================================================================
      // 3. DISPARO VIA SMS DEV (api.smsdev.com.br) — FALLBACK SECUNDÁRIO
      // =========================================================================
      const smsdevApiKey = Deno.env.get("SMSDEV_API_KEY") || "LQP0WM30YEMPJPXUZJL4PRK7MOK1KA22H3UBKAYH9FVKCW7BKVQUADG8EA1HW62GHH13ZVC9YHO1OSI7JAWUNIAVEWSHG0YRWWOCSJKICEWY5YFXLYCKPDBVDTKGWA1V";
      if (smsdevApiKey) {
        try {
          const formattedPhone = cleanPhone.length > 11 && cleanPhone.startsWith("55")
            ? cleanPhone.replace(/^55/, "")
            : cleanPhone;
          const smsdevUrl = "https://api.smsdev.com.br/v1/send";
          const smsdevPayload = {
            key: smsdevApiKey,
            type: 9,
            number: formattedPhone,
            msg: `Seu codigo de acesso ao PedeMuleke e: ${generatedCode}. Valido por 10 minutos.`,
          };

          const smsdevRes = await fetch(smsdevUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(smsdevPayload),
          });

          const smsdevResult = await smsdevRes.json().catch(() => ({}));
          console.log("[SMS Dev Response]:", smsdevResult);

          const isSuccess = Array.isArray(smsdevResult)
            ? smsdevResult[0]?.situacao === "OK" || smsdevResult[0]?.codigo === "1"
            : smsdevResult?.situacao === "OK" || smsdevResult?.codigo === "1" || smsdevResult?.status === "OK";

          if (isSuccess) {
            return new Response(
              JSON.stringify({
                success: true,
                message: "Código de verificação enviado por SMS!",
                phone: cleanPhone,
                channel: "smsdev",
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } else {
            console.warn("[SMS Dev Warning]:", smsdevResult);
          }
        } catch (smsdevErr: any) {
          console.error("[SMS Dev Request Error]:", smsdevErr);
        }
      }

      // =========================================================================
      // 4. DISPARO VIA WHATSAPP CLOUD API DA META (TERCIÁRIO SE CONFIGURADA)
      // =========================================================================
      const metaPhoneNumberId = Deno.env.get("META_WA_PHONE_NUMBER_ID");
      const metaAccessToken = Deno.env.get("META_WA_ACCESS_TOKEN");
      const metaTemplateName = Deno.env.get("META_WA_TEMPLATE_NAME") || "auth_code";

      if (metaPhoneNumberId && metaAccessToken) {
        try {
          const metaUrl = `https://graph.facebook.com/v19.0/${metaPhoneNumberId}/messages`;
          const metaPayload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: fullPhone,
            type: "template",
            template: {
              name: metaTemplateName,
              language: { code: "pt_BR" },
              components: [
                {
                  type: "body",
                  parameters: [{ type: "text", text: generatedCode }],
                },
                {
                  type: "button",
                  sub_type: "url",
                  index: "0",
                  parameters: [{ type: "text", text: generatedCode }],
                },
              ],
            },
          };

          const metaRes = await fetch(metaUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${metaAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(metaPayload),
          });

          if (metaRes.ok) {
            return new Response(
              JSON.stringify({
                success: true,
                message: "Código de verificação enviado via WhatsApp Oficial!",
                phone: cleanPhone,
                channel: "whatsapp",
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } catch (metaErr: any) {
          console.error("[Meta WhatsApp Request Error]:", metaErr);
        }
      }

      // Fallback Simulado
      console.log(`[OTP Simulado] Código para ${cleanPhone}: ${generatedCode}`);
      return new Response(
        JSON.stringify({
          success: true,
          simulated: true,
          code: generatedCode,
          phone: cleanPhone,
          message: "Código gerado com sucesso! (Modo Simulação Ativo)",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO 2: VALIDAR CÓDIGO OTP (VERIFY_OTP)
    // =========================================================================
    if (action === "verify_otp") {
      if (!phone || !code) {
        return new Response(
          JSON.stringify({ success: false, error: "Telefone e código são obrigatórios." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: verifyData, error: verifyError } = await supabase.rpc("verify_whatsapp_otp", {
        p_phone: phone,
        p_code: code,
        p_full_name: full_name || "",
        p_tenant_id: tenant_id || null,
      });

      if (verifyError || !verifyData?.success) {
        return new Response(
          JSON.stringify({ success: false, error: verifyError?.message || verifyData?.error || "Código inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify(verifyData),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Ação não suportada." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[whatsapp-otp Function Error]:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Erro interno do servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
