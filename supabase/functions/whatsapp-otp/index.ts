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

      // 2. Credenciais da Meta WhatsApp Cloud API
      const metaPhoneNumberId = Deno.env.get("META_WA_PHONE_NUMBER_ID");
      const metaAccessToken = Deno.env.get("META_WA_ACCESS_TOKEN");
      const metaTemplateName = Deno.env.get("META_WA_TEMPLATE_NAME") || "auth_code";

      if (metaPhoneNumberId && metaAccessToken) {
        try {
          // Disparo Oficial via WhatsApp Business Cloud API (Graph API)
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

          const metaResult = await metaRes.json();

          if (!metaRes.ok) {
            console.warn("[Meta WhatsApp API Warning]:", metaResult);
            // Se o template falhar (ex: template não cadastrado ainda), tenta envio de texto direto de contingência
            const textFallbackRes = await fetch(metaUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${metaAccessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: fullPhone,
                type: "text",
                text: {
                  body: `Seu código de acesso ao PedeMuleke é: *${generatedCode}*. Válido por 10 minutos.`,
                },
              }),
            });
            const textResult = await textFallbackRes.json();
            console.log("[Meta Text Contingency Result]:", textResult);
          }

          return new Response(
            JSON.stringify({
              success: true,
              message: "Código de verificação enviado via WhatsApp Oficial!",
              phone: cleanPhone,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (metaErr: any) {
          console.error("[Meta WhatsApp Request Error]:", metaErr);
        }
      }

      // Modo Preparação / Simulado (Enquanto o usuário não cadastrar as chaves no Meta for Developers)
      console.log(`[WhatsApp OTP Preparado] Código para ${cleanPhone}: ${generatedCode}`);
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
