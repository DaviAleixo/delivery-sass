/**
 * Serviço de Integração com Asaas (via Supabase Edge Function)
 * Garante segurança total da API Key e bypass de CORS do navegador.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jqwtnzdsaivbjudvjhld.supabase.co';
const ASAAS_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/asaas`;
const FALLBACK_ASAAS_FUNCTION_URL = 'https://zecuwijuiqsaoeafonsv.supabase.co/functions/v1/asaas';

async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch {}
  }
  return headers;
}

async function fetchAsaasEndpoint(payload) {
  const headers = await getAuthHeaders();
  let res;
  try {
    res = await fetch(ASAAS_FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (res.status === 404 && ASAAS_FUNCTION_URL !== FALLBACK_ASAAS_FUNCTION_URL) {
      res = await fetch(FALLBACK_ASAAS_FUNCTION_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    }
  } catch (_netErr) {
    if (ASAAS_FUNCTION_URL !== FALLBACK_ASAAS_FUNCTION_URL) {
      res = await fetch(FALLBACK_ASAAS_FUNCTION_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    } else {
      throw _netErr;
    }
  }
  return res;
}

/**
 * Cria o cliente e a assinatura recorrente mensal no Asaas para uma loja
 */
export async function createAsaasCustomerAndSubscription({
  name,
  email,
  phone,
  cpfCnpj,
  plan = 'pro',
  monthlyPrice,
  dueDays = 3,
  nextDueDate
}) {
  try {
    const res = await fetchAsaasEndpoint({
      action: 'create_customer_and_subscription',
      name,
      email,
      phone,
      cpfCnpj,
      plan,
      monthlyPrice,
      dueDays,
      nextDueDate
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      console.error('[Asaas Service] Erro na criação:', data);
      return {
        success: false,
        error: data.error || 'Falha ao conectar com o Asaas'
      };
    }

    return {
      success: true,
      customerId: data.customerId,
      subscriptionId: data.subscriptionId,
      paymentId: data.paymentId,
      paymentLink: data.paymentLink,
      nextDueDate: data.nextDueDate,
      value: data.value
    };
  } catch (err) {
    console.error('[Asaas Service] Erro de rede ou servidor:', err);
    return {
      success: false,
      error: err.message || 'Erro de comunicação com o servidor de pagamentos'
    };
  }
}

/**
 * Atualiza os dados cadastrais/fiscais do cliente no Asaas (e-mail, WhatsApp, CPF/CNPJ)
 */
export async function updateAsaasCustomer({
  customerId,
  name,
  email,
  phone,
  cpfCnpj
}) {
  if (!customerId) {
    return { success: false, error: 'ID do cliente no Asaas ausente' };
  }

  try {
    const res = await fetchAsaasEndpoint({
      action: 'update_customer',
      customerId,
      name,
      email,
      phone,
      cpfCnpj
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      console.error('[Asaas Service] Erro ao atualizar cliente:', data);
      return {
        success: false,
        error: data.error || 'Falha ao atualizar dados no Asaas'
      };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[Asaas Service] Erro ao atualizar cliente no Asaas:', err);
    return {
      success: false,
      error: err.message || 'Erro ao sincronizar dados com o Asaas'
    };
  }
}

/**
 * Consulta status atual da assinatura e pagamentos
 */
export async function getAsaasSubscription(subscriptionId) {
  if (!subscriptionId) return null;

  try {
    const res = await fetchAsaasEndpoint({
      action: 'get_subscription',
      subscriptionId
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[Asaas Service] Erro ao buscar assinatura:', err);
    return null;
  }
}
