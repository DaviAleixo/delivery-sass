import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Carrega variáveis do arquivo .env
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const SUPABASE_URL = envConfig.VITE_SUPABASE_URL || 'https://zecuwijuiqsaoeafonsv.supabase.co';
const ANON_KEY = envConfig.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = envConfig.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("==================================================================");
console.log("🧪 TESTE DE PROVISIONAMENTO AUTOMÁTICO DE LOJISTA NO SUPABASE AUTH");
console.log("Alvo Supabase:", SUPABASE_URL);
console.log("==================================================================");

async function runProvisioningTest() {
  if (!SERVICE_KEY) {
    console.log("⚠️ SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente para teste de provisionamento automatizado.");
    return;
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const testSlug = `test-autoprovision-${Date.now().toString().slice(-6)}`;
  const testUsername = `owner_${Date.now().toString().slice(-4)}`;
  const testPassword = 'PasswordTest@123!';

  console.log(`\n[PASSO 1] Invocando create_new_tenant para o slug '${testSlug}'...`);
  const { data: createResult, error: createError } = await adminClient.rpc('create_new_tenant', {
    p_name: 'Pizzaria Teste Autômata',
    p_slug: testSlug,
    p_plan: 'basic',
    p_admin_username: testUsername,
    p_admin_password: testPassword,
    p_primary_color: '#10B981'
  });

  if (createError || !createResult?.success) {
    console.error("🚨 Falha ao criar tenant:", createError || createResult);
    process.exit(1);
  }

  const createdTenantId = createResult.tenant_id;
  const createdEmail = createResult.admin_email;
  console.log("  ✅ Tenant e usuário provisionados com sucesso!");
  console.log(`     Tenant ID: ${createdTenantId}`);
  console.log(`     Email gerado no Auth: ${createdEmail}`);

  console.log(`\n[PASSO 2] Testando resolução de e-mail via resolve_admin_login_email('${testUsername}')...`);
  const { data: resolvedEmail, error: resolveErr } = await anonClient.rpc('resolve_admin_login_email', {
    p_username: testUsername,
    p_tenant_slug: testSlug
  });

  if (resolveErr || resolvedEmail !== createdEmail) {
    console.error("🚨 Falha na resolução de e-mail:", resolveErr, "Esperado:", createdEmail, "Obtido:", resolvedEmail);
    process.exit(1);
  }
  console.log(`  ✅ E-mail resolvido corretamente: ${resolvedEmail}`);

  console.log(`\n[PASSO 3] Testando login nativo no Supabase Auth com as credenciais geradas...`);
  const loginClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: authData, error: authError } = await loginClient.auth.signInWithPassword({
    email: resolvedEmail,
    password: testPassword
  });

  if (authError || !authData?.user) {
    console.error("🚨 Falha no login via Supabase Auth:", authError);
    process.exit(1);
  }
  console.log("  ✅ Login via Supabase Auth efetuado com sucesso!");
  console.log(`     Auth UID: ${authData.user.id}`);
  console.log(`     JWT emitido: ${authData.session.access_token.slice(0, 25)}...`);

  console.log(`\n[PASSO 4] Excluindo restaurante de teste via delete_tenant em cascata...`);
  const { data: deleteResult, error: deleteError } = await adminClient.rpc('delete_tenant', {
    p_tenant_id: createdTenantId
  });

  if (deleteError || !deleteResult?.success) {
    console.error("🚨 Falha ao excluir tenant de teste:", deleteError || deleteResult);
  } else {
    console.log("  ✅ Restaurante e contas associadas no Supabase Auth removidos em cascata!");
  }

  console.log("\n==================================================================");
  console.log("🎉 RESULTADO: PROVISIONAMENTO NATIVO NO SUPABASE AUTH APROVADO 100%");
  console.log("==================================================================");
}

runProvisioningTest().catch(console.error);
