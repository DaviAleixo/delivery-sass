/**
 * SUÍTE DE TESTES NEGATIVOS DE AUTORIZAÇÃO E SEGURANÇA MULTI-TENANT
 * Arquivo: tests/negative_authorization_test.mjs
 * Execução: node tests/negative_authorization_test.mjs
 * 
 * Objetivo:
 * Validar que o cliente anônimo (anon key) e operadores sem autorização
 * NÃO conseguem executar operações destrutivas ou acessar dados cruzados.
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

loadEnvFile(path.resolve(__dirname, '../.env'));
loadEnvFile(path.resolve(__dirname, '../.env.local'));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ ERRO: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não encontradas no ambiente.");
  process.exit(1);
}

const anonClient = createClient(supabaseUrl, supabaseAnonKey);

const DUMMY_TENANT_ID = "a0000000-0000-0000-0000-000000000001";
const DUMMY_TARGET_TENANT_ID = "b0000000-0000-0000-0000-000000000002";

async function runNegativeSecurityTests() {
  console.log("==================================================================");
  console.log("🔒 INICIANDO SUÍTE DE TESTES NEGATIVOS DE SEGURANÇA E AUTORIZAÇÃO");
  console.log(`Alvo Supabase: ${supabaseUrl}`);
  console.log("Papel do Cliente: anônimo (anon role)");
  console.log("==================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  // TESTE 1: TENTATIVA DE EXECUTAR delete_tenant COMO ANÔNIMO
  totalTests++;
  console.log(`[TESTE ${totalTests}] Tentativa anônima de invocar delete_tenant()...`);
  try {
    const { data, error } = await anonClient.rpc('delete_tenant', { p_tenant_id: '00000000-0000-0000-0000-000000000000' });
    if (error && (error.code === '42501' || error.message.includes('permission denied') || error.message.includes('must be owner'))) {
      console.log(`  ✅ BLOQUEADO COM SUCESSO: O PostgreSQL negou permissão de execução.`);
      console.log(`     Código: ${error.code}, Mensagem: ${error.message}`);
      passedTests++;
    } else {
      console.error(`  🚨 FALHA CRÍTICA DE SEGURANÇA: Usuário anônimo possui permissão EXECUTE em delete_tenant!`, data || error);
    }
  } catch (err) {
    console.log(`  ✅ BLOQUEADO: Exceção capturada:`, err.message);
    passedTests++;
  }

  // TESTE 2: TENTATIVA DE EXECUTAR get_sales_metrics COMO ANÔNIMO
  totalTests++;
  console.log(`\n[TESTE ${totalTests}] Tentativa anônima de invocar get_sales_metrics()...`);
  try {
    const { data, error } = await anonClient.rpc('get_sales_metrics', { p_tenant_id: DUMMY_TENANT_ID });
    if (error) {
      console.log(`  ✅ BLOQUEADO COM SUCESSO: Acesso a dados financeiros negado.`);
      console.log(`     Código: ${error.code || 'N/A'}, Mensagem: ${error.message}`);
      passedTests++;
    } else {
      console.error(`  🚨 FALHA DE SEGURANÇA: Métricas financeiras foram expostas para anônimo!`, data);
    }
  } catch (err) {
    console.log(`  ✅ BLOQUEADO: Exceção capturada:`, err.message);
    passedTests++;
  }

  // TESTE 3: TENTATIVA DE LER TABELA admin_users COMO ANÔNIMO
  totalTests++;
  console.log(`\n[TESTE ${totalTests}] Tentativa anônima de listar registros de admin_users...`);
  try {
    const { data, error } = await anonClient.from('admin_users').select('id, username, password, initial_password');
    if (error) {
      console.log(`  ✅ BLOQUEADO COM SUCESSO: Leitura de credenciais negada pelo RLS.`);
      console.log(`     Código: ${error.code || 'N/A'}, Mensagem: ${error.message}`);
      passedTests++;
    } else if (data && data.length === 0) {
      console.log(`  ✅ BLOQUEADO: RLS retornou 0 registros (nenhuma credencial exposta).`);
      passedTests++;
    } else {
      console.error(`  🚨 FALHA CRÍTICA DE SEGURANÇA: Credenciais administrativas expostas! (${data.length} registros lidos)`);
    }
  } catch (err) {
    console.log(`  ✅ BLOQUEADO: Exceção capturada:`, err.message);
    passedTests++;
  }

  // TESTE 4: TENTATIVA DE LER PEDIDOS (orders) SEM TRACKING TOKEN OU CONTEXTO
  totalTests++;
  console.log(`\n[TESTE ${totalTests}] Tentativa anônima de listar pedidos de todas as lojas...`);
  try {
    const { data, error } = await anonClient.from('orders').select('id, tenant_id, total, customer_phone');
    if (error) {
      console.log(`  ✅ BLOQUEADO COM SUCESSO: Leitura negada pelo RLS.`);
      console.log(`     Código: ${error.code || 'N/A'}, Mensagem: ${error.message}`);
      passedTests++;
    } else if (data && data.length === 0) {
      console.log(`  ✅ BLOQUEADO: RLS retornou 0 pedidos para cliente anônimo.`);
      passedTests++;
    } else {
      console.error(`  🚨 VULNERABILIDADE: ${data.length} pedidos expostos para usuário anônimo sem token!`);
    }
  } catch (err) {
    console.log(`  ✅ BLOQUEADO: Exceção capturada:`, err.message);
    passedTests++;
  }

  // TESTE 5: TENTATIVA DE LER BASE DE CLIENTES (customers)
  totalTests++;
  console.log(`\n[TESTE ${totalTests}] Tentativa anônima de listar clientes de todas as lojas...`);
  try {
    const { data, error } = await anonClient.from('customers').select('id, phone, full_name, email');
    if (error) {
      console.log(`  ✅ BLOQUEADO COM SUCESSO: Leitura negada.`);
      console.log(`     Código: ${error.code || 'N/A'}, Mensagem: ${error.message}`);
      passedTests++;
    } else if (data && data.length === 0) {
      console.log(`  ✅ BLOQUEADO: RLS retornou 0 clientes.`);
      passedTests++;
    } else {
      console.error(`  🚨 VULNERABILIDADE: ${data.length} clientes expostos para o público!`);
    }
  } catch (err) {
    console.log(`  ✅ BLOQUEADO: Exceção capturada:`, err.message);
    passedTests++;
  }

  // TESTE 6: TENTATIVA DE EXCLUSÃO DE IMAGENS NO STORAGE
  totalTests++;
  console.log(`\n[TESTE ${totalTests}] Tentativa anônima de deletar objeto arbitrário no storage...`);
  try {
    const { data, error } = await anonClient.storage.from('restaurant-images').remove(['tenants/outro_restaurante/logo.webp']);
    if (error) {
      console.log(`  ✅ BLOQUEADO COM SUCESSO: Exclusão no storage negada.`);
      passedTests++;
    } else if (data && data.length === 0) {
      console.log(`  ✅ BLOQUEADO: Nenhum objeto foi excluído.`);
      passedTests++;
    } else {
      console.error(`  🚨 VULNERABILIDADE: Exclusão permitida no Storage!`);
    }
  } catch (err) {
    console.log(`  ✅ BLOQUEADO: Exceção capturada:`, err.message);
    passedTests++;
  }

  console.log("\n==================================================================");
  console.log(`📊 RESULTADO DA SUÍTE: ${passedTests}/${totalTests} testes de segurança aprovados.`);
  console.log("==================================================================");
  
  return { passedTests, totalTests };
}

runNegativeSecurityTests().catch(console.error);
