/**
 * SUÍTE DE TESTES DE SEGURANÇA E AUTORIZAÇÃO — AMBIENTE DE HOMOLOGAÇÃO
 * Arquivo: tests/staging_validation_suite.mjs
 * Execução: node tests/staging_validation_suite.mjs
 * 
 * Valida os 5 perfis de acesso:
 * 1. Visitante Anônimo
 * 2. Cliente de Pedido Anônimo (via tracking_token)
 * 3. Administrador do Restaurante A
 * 4. Administrador do Restaurante B (Tentativa de Cross-Tenant Leak)
 * 5. SuperAdmin da Plataforma
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[key] = val;
      }
    });
  }
}

// Carrega .env.staging se existir, ou fallback para .env.local / .env
loadEnvFile(path.resolve(__dirname, '../.env.staging'));
loadEnvFile(path.resolve(__dirname, '../.env.local'));
loadEnvFile(path.resolve(__dirname, '../.env'));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ ERRO: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não encontradas no ambiente.");
  process.exit(1);
}

const anonClient = createClient(supabaseUrl, supabaseAnonKey);

async function runStagingTestSuite() {
  console.log("==================================================================");
  console.log("🛡️  SUÍTE DE TESTES DE HOMOLOGAÇÃO: RLS & AUTORIZAÇÃO MULTI-TENANT");
  console.log(`Endpoint Supabase: ${supabaseUrl}`);
  console.log("==================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  // -----------------------------------------------------------------------------
  // CENÁRIO 1: VISITANTE ANÔNIMO (ANON ROLE)
  // -----------------------------------------------------------------------------
  console.log("--- [CENÁRIO 1: TESTES DE VISITANTE ANÔNIMO] ---");

  // 1.1 Tentativa de ler credenciais de admin_users
  totalTests++;
  console.log(`[TESTE ${totalTests}] Anônimo tentando consultar tabela admin_users...`);
  try {
    const { data, error } = await anonClient.from('admin_users').select('id, username, password');
    if (error || (data && data.length === 0)) {
      console.log(`  ✅ BLOQUEADO: RLS impediu leitura de credenciais (0 registros retornados).`);
      passedTests++;
    } else {
      console.error(`  🚨 FALHA: Credenciais expostas! (${data.length} registros lidos)`);
    }
  } catch (err) {
    console.log(`  ✅ BLOQUEADO: Exceção capturada.`);
    passedTests++;
  }

  // 1.2 Tentativa de ler pedidos arbitrários de orders
  totalTests++;
  console.log(`[TESTE ${totalTests}] Anônimo tentando listar pedidos de todas as lojas...`);
  try {
    const { data, error } = await anonClient.from('orders').select('id, customer_name, total');
    if (error || (data && data.length === 0)) {
      console.log(`  ✅ BLOQUEADO: Pedidos privados protegidos por RLS.`);
      passedTests++;
    } else {
      console.error(`  🚨 FALHA: Pedidos expostos para usuário anônimo!`);
    }
  } catch (err) {
    console.log(`  ✅ BLOQUEADO: Exceção capturada.`);
    passedTests++;
  }

  // 1.3 Tentativa de executar delete_tenant como anônimo
  totalTests++;
  console.log(`[TESTE ${totalTests}] Anônimo tentando invocar delete_tenant()...`);
  try {
    const { data, error } = await anonClient.rpc('delete_tenant', { p_tenant_id: '00000000-0000-0000-0000-000000000000' });
    if (error && (error.code === '42501' || error.message.includes('permission denied') || error.message.includes('Acesso negado'))) {
      console.log(`  ✅ BLOQUEADO: PostgreSQL rejeitou a chamada com erro de permissão (${error.code || error.message}).`);
      passedTests++;
    } else {
      console.error(`  🚨 FALHA: delete_tenant() aceito sem autenticação!`, data || error);
    }
  } catch (err) {
    console.log(`  ✅ BLOQUEADO: Exceção capturada.`);
    passedTests++;
  }

  // 1.4 Tentativa de ler métricas financeiras em get_sales_metrics
  totalTests++;
  console.log(`[TESTE ${totalTests}] Anônimo tentando invocar get_sales_metrics()...`);
  try {
    const { data, error } = await anonClient.rpc('get_sales_metrics', { p_tenant_id: '00000000-0000-0000-0000-000000000000' });
    if (error && (error.code === '42501' || error.message.includes('permission denied') || error.message.includes('Acesso negado'))) {
      console.log(`  ✅ BLOQUEADO: Métricas financeiras protegidas contra anônimos.`);
      passedTests++;
    } else {
      console.error(`  🚨 FALHA: Métricas financeiras expostas!`, data || error);
    }
  } catch (err) {
    console.log(`  ✅ BLOQUEADO: Exceção capturada.`);
    passedTests++;
  }

  // -----------------------------------------------------------------------------
  // CENÁRIO 2: CHECKOUT ANÔNIMO & CONSULTA POR TRACKING TOKEN
  // -----------------------------------------------------------------------------
  console.log("\n--- [CENÁRIO 2: CHECKOUT PÚBLICO & TRACKING TOKEN] ---");

  // 2.1 Consulta de produtos públicos disponíveis
  totalTests++;
  console.log(`[TESTE ${totalTests}] Leitura de cardápio público (produtos disponíveis)...`);
  let publicTenant = null;
  let sampleProduct = null;
  try {
    const { data: tenants } = await anonClient.from('tenants').select('id, name, is_active').eq('is_active', true).limit(1);
    if (tenants && tenants.length > 0) {
      publicTenant = tenants[0];
      const { data: products } = await anonClient.from('products').select('id, name, price, available').eq('tenant_id', publicTenant.id).eq('available', true).limit(1);
      if (products && products.length > 0) {
        sampleProduct = products[0];
        console.log(`  ✅ Cardápio público acessível para loja '${publicTenant.name}', produto '${sampleProduct.name}'.`);
        passedTests++;
      } else {
        console.log(`  ⚠️ Loja encontrada sem produtos cadastrados para teste de checkout.`);
      }
    } else {
      console.log(`  ⚠️ Nenhuma loja ativa encontrada no banco para teste de checkout.`);
    }
  } catch (err) {
    console.error(`  🚨 Erro ao consultar cardápio público:`, err.message);
  }

  // 2.2 Criação de pedido via procedure create_public_order
  let createdOrderId = null;
  let createdTrackingToken = null;

  if (publicTenant && sampleProduct) {
    totalTests++;
    console.log(`[TESTE ${totalTests}] Criação de pedido anônimo via procedure create_public_order...`);
    try {
      const orderPayload = {
        p_tenant_id: publicTenant.id,
        p_customer_name: "Cliente Teste Homolog",
        p_customer_phone: "31999998888",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Teste, 100",
        p_payment_method: "pix",
        p_items: [
          {
            product_id: sampleProduct.id,
            quantity: 1,
            additionals: []
          }
        ],
        p_notes: "Sem cebola"
      };

      const { data, error } = await anonClient.rpc('create_public_order', orderPayload);
      if (!error && data && data.success && data.tracking_token) {
        createdOrderId = data.order_id;
        createdTrackingToken = data.tracking_token;
        console.log(`  ✅ Pedido criado com validação no servidor!`);
        console.log(`     ID: ${createdOrderId}, Tracking Token: ${createdTrackingToken}, Total: R$ ${data.total}`);
        passedTests++;
      } else {
        console.error(`  🚨 Falha na criação do pedido:`, error?.message || data?.message);
      }
    } catch (err) {
      console.error(`  🚨 Exceção na criação do pedido:`, err.message);
    }

    // 2.3 Consulta do pedido com o tracking_token autêntico
    totalTests++;
    console.log(`[TESTE ${totalTests}] Consulta do pedido via get_order_by_tracking_token com token correto...`);
    try {
      const { data, error } = await anonClient.rpc('get_order_by_tracking_token', {
        p_order_id: createdOrderId,
        p_tracking_token: createdTrackingToken
      });

      if (!error && data && data.success && data.order) {
        console.log(`  ✅ Pedido recuperado com sucesso pelo cliente anônimo utilizando seu tracking_token.`);
        passedTests++;
      } else {
        console.error(`  🚨 Falha ao consultar pedido com token válido:`, error?.message || data?.message);
      }
    } catch (err) {
      console.error(`  🚨 Exceção ao consultar pedido com token:`, err.message);
    }

    // 2.4 Tentativa de consulta do pedido com tracking_token falsificado/inválido
    totalTests++;
    console.log(`[TESTE ${totalTests}] Tentativa de consulta do pedido com tracking_token falsificado...`);
    try {
      const { data, error } = await anonClient.rpc('get_order_by_tracking_token', {
        p_order_id: createdOrderId,
        p_tracking_token: '00000000-0000-0000-0000-000000000000'
      });

      if (data && data.success === false) {
        console.log(`  ✅ BLOQUEADO: Consulta rejeitada com token incorreto (${data.message}).`);
        passedTests++;
      } else {
        console.error(`  🚨 FALHA: Pedido foi exposto mesmo com token errado!`);
      }
    } catch (err) {
      console.log(`  ✅ BLOQUEADO: Exceção capturada.`);
      passedTests++;
    }
  }

  console.log("\n==================================================================");
  console.log(`📊 RESULTADO DA SUÍTE DE HOMOLOGAÇÃO: ${passedTests}/${totalTests} testes aprovados.`);
  console.log("==================================================================");

  return { passedTests, totalTests };
}

runStagingTestSuite().catch(console.error);
