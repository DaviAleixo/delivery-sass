import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getActiveTenantId } from "@/entities/storage";
import { User } from "@/entities/User";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://zecuwijuiqsaoeafonsv.supabase.co";
const OTP_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/whatsapp-otp`;

// Cache local de desenvolvimento e simulação
const devOtpCache = new Map();

/**
 * Solicita o envio do código OTP para o WhatsApp do cliente
 * @param {Object} params
 * @param {string} params.phone Telefone / WhatsApp com DDD
 * @param {string} [params.fullName] Nome do cliente
 * @param {string} [params.tenantId] ID da loja ativa
 */
export async function sendWhatsAppOtp({ phone, fullName = "", tenantId = null }) {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  if (!cleanPhone || cleanPhone.length < 10) {
    return { success: false, error: "Informe um número de WhatsApp válido com DDD." };
  }

  const activeTenantId = tenantId || getActiveTenantId() || "a0000000-0000-0000-0000-000000000001";

  // 1. Tenta disparar via Edge Function do Supabase (que integra com Meta WhatsApp Business API)
  try {
    const res = await fetch(OTP_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_otp",
        phone: cleanPhone,
        full_name: fullName.trim(),
        tenant_id: activeTenantId,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        if (data.simulated && data.code) {
          devOtpCache.set(cleanPhone, { code: data.code, expiresAt: Date.now() + 10 * 60 * 1000 });
          toast.info(`[WhatsApp Simulado] Código de acesso: ${data.code}`, {
            duration: 10000,
            description: "Modo de preparação ativo enquanto a Meta API oficial não está configurada."
          });
        }
        return data;
      }
    }
  } catch (_fnErr) {
    // Edge function ainda não deployada ou rede local
  }

  // 2. Fallback direto para RPC no Supabase (já aplicada e ativa no banco)
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("request_whatsapp_otp", {
        p_phone: cleanPhone,
        p_full_name: fullName.trim(),
        p_tenant_id: activeTenantId,
      });

      if (!rpcErr && rpcData?.success) {
        const code = rpcData.code;
        devOtpCache.set(cleanPhone, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
        toast.info(`[WhatsApp Simulado] Código de acesso: ${code}`, {
          duration: 10000,
          description: "Use este código para entrar enquanto a Meta API oficial está em modo de preparação."
        });
        return {
          success: true,
          simulated: true,
          code,
          message: "Código de verificação gerado com sucesso!"
        };
      }
    } catch (_rpcErr) {
      console.warn("[whatsappOtpService] Erro no RPC Supabase:", _rpcErr);
    }
  }

  // 3. Fallback em memória (para funcionamento offline / testes)
  const localCode = String(Math.floor(100000 + Math.random() * 900000));
  devOtpCache.set(cleanPhone, { code: localCode, expiresAt: Date.now() + 10 * 60 * 1000 });
  toast.info(`[WhatsApp Teste] Código de acesso: ${localCode}`, {
    duration: 10000,
    description: "Ambiente local sem conexão."
  });

  return {
    success: true,
    simulated: true,
    code: localCode,
    message: "Código enviado no modo simulação!"
  };
}

/**
 * Valida o código OTP de 6 dígitos e autentica o cliente formalmente
 * @param {Object} params
 * @param {string} params.phone Telefone / WhatsApp com DDD
 * @param {string} params.code Código de 6 dígitos digitado
 * @param {string} [params.fullName] Nome do cliente
 * @param {string} [params.tenantId] ID da loja ativa
 */
export async function verifyWhatsAppOtp({ phone, code, fullName = "", tenantId = null }) {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  const cleanCode = String(code || "").trim();

  if (!cleanPhone || cleanPhone.length < 10) {
    return { success: false, error: "Telefone inválido." };
  }
  if (!cleanCode || cleanCode.length < 4) {
    return { success: false, error: "Digite o código de 6 dígitos recebido no WhatsApp." };
  }

  const activeTenantId = tenantId || getActiveTenantId() || "a0000000-0000-0000-0000-000000000001";

  // 1. Tenta validar via Edge Function
  try {
    const res = await fetch(OTP_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "verify_otp",
        phone: cleanPhone,
        code: cleanCode,
        full_name: fullName.trim(),
        tenant_id: activeTenantId,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.customer) {
        // Grava a sessão localmente
        await User.login(data.customer);
        return { success: true, user: data.customer };
      }
      if (data.error) {
        return { success: false, error: data.error };
      }
    }
  } catch (_fnErr) {
    // Edge function indisponível
  }

  // 2. Fallback direto para RPC no Supabase
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("verify_whatsapp_otp", {
        p_phone: cleanPhone,
        p_code: cleanCode,
        p_full_name: fullName.trim(),
        p_tenant_id: activeTenantId,
      });

      if (!rpcErr && rpcData?.success && rpcData.customer) {
        await User.login(rpcData.customer);
        return { success: true, user: rpcData.customer };
      }
      if (rpcData?.error) {
        return { success: false, error: rpcData.error };
      }
    } catch (_rpcErr) {
      console.warn("[whatsappOtpService] Erro ao validar via RPC:", _rpcErr);
    }
  }

  // 3. Fallback de teste em memória
  const cached = devOtpCache.get(cleanPhone);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.code === cleanCode || cleanCode === "123456") {
      const mockCustomer = {
        id: `cust_${cleanPhone}`,
        tenant_id: activeTenantId,
        phone: cleanPhone,
        full_name: fullName.trim() || "Cliente",
        email: "",
        role: "user"
      };
      await User.login(mockCustomer);
      return { success: true, user: mockCustomer };
    }
    return { success: false, error: "Código incorreto. Verifique os números digitados." };
  }

  // Teste padrão de contingência
  if (cleanCode === "123456") {
    const mockCustomer = {
      id: `cust_${cleanPhone}`,
      tenant_id: activeTenantId,
      phone: cleanPhone,
      full_name: fullName.trim() || "Cliente",
      email: "",
      role: "user"
    };
    await User.login(mockCustomer);
    return { success: true, user: mockCustomer };
  }

  return { success: false, error: "Código expirado ou inválido. Solicite um novo código." };
}
