/**
 * SUÍTE EXTREMA DE CAOS, CARGA MASSIVA (1.100+ PEDIDOS), SEGURANÇA E CONCORRÊNCIA (20 EMPRESAS)
 * Arquivo: tests/extreme_chaos_20_tenants_stress_test.mjs
 * Execução: node tests/extreme_chaos_20_tenants_stress_test.mjs
 *
 * ATENÇÃO: Conforme solicitado, os pedidos criados durante a rajada nas empresas elegíveis
 * permanecem GRAVADOS no banco de dados após a execução (identificados por EXTREME_CHAOS_<ts>).
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    content.split("\n").forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || "").trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    });
  }
}

loadEnvFile(path.resolve(__dirname, "../.env"));
loadEnvFile(path.resolve(__dirname, "../.env.local"));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("ERRO: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes.");
  process.exit(1);
}

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const anonClient = makeClient();
const runTag = `EXTREME_CHAOS_${Date.now()}`;

const report = {
  runTag,
  startedAt: new Date().toISOString(),
  tenantsCount: 0,
  checks: [],
  vulnerabilitiesFound: [],
  bugsAndBottlenecksFound: [],
  concurrency: {},
  massiveBurst: {},
  perTenantSummary: [],
};

function recordCheck(name, passed, detail) {
  report.checks.push({ name, passed, detail });
  console.log(`  ${passed ? "✅" : "❌"} [${name}] ${detail}`);
}

function recordVuln(severity, title, target, detail) {
  report.vulnerabilitiesFound.push({ severity, title, target, detail });
  console.log(`  🚨 [${severity}] ${title} (${target}): ${detail}`);
}

function recordBug(severity, title, detail) {
  report.bugsAndBottlenecksFound.push({ severity, title, detail });
  console.log(`  ⚠️ [${severity}] ${title}: ${detail}`);
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function loginTenantAdmin(slug) {
  const client = makeClient();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ action: "login", storeIdentifier: slug, username: "admin", password: "TestAdmin@2026!" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.session?.access_token) return { client: null, error: body?.error || `HTTP ${res.status}` };
  const { data: authData, error: sErr } = await client.auth.setSession(body.session);
  if (sErr || !authData?.session) return { client: null, error: sErr?.message || "login failed" };
  return { client, session: authData.session, user: authData.user, error: null };
}

async function main() {
  console.log("==================================================================================");
  console.log("💀 SUÍTE EXTREMA DE CAOS, SEGURANÇA, CONCORRÊNCIA E CARGA MASSIVA (20 EMPRESAS)");
  console.log(`📡 Supabase: ${SUPABASE_URL}`);
  console.log(`🏷️  Run Tag : ${runTag} (pedidos da rajada serão mantidos gravados no banco!)`);
  console.log("==================================================================================\n");

  // -------------------------------------------------------------------------
  // DESCOBERTA DAS 20 EMPRESAS + PRODUTOS + BAIRROS
  // -------------------------------------------------------------------------
  const { data: allTenants, error: tErr } = await anonClient
    .from("tenants_public")
    .select("id, code, name, slug, plan, is_active, salon_mode, accepts_delivery, accepts_takeaway, accepts_dine_in, cashback_enabled, delivery_fee_type, delivery_neighborhoods, delivery_unlisted_policy, payment_methods")
    .order("code", { ascending: true });

  if (tErr || !allTenants) {
    console.error("Falha ao consultar tenants_public:", tErr?.message);
    process.exit(1);
  }

  report.tenantsCount = allTenants.length;
  recordCheck("discover_20_tenants", allTenants.length === 20, `${allTenants.length} empresas encontradas via tenants_public`);

  const pedemuleke = allTenants.find((t) => t.slug === "teste");
  const vruum = allTenants.find((t) => t.id === "a0000000-0000-0000-0000-000000000001");
  const visual = allTenants.find((t) => t.slug === "visual");
  const testTenants = allTenants.filter((t) => t.slug.startsWith("test-empresa-"));

  // Buscar produtos disponíveis de TODAS as 20 empresas via RLS público
  const productsByTenant = new Map();
  await Promise.all(
    allTenants.map(async (t) => {
      const { data: prods } = await anonClient
        .from("products")
        .select("id, name, price, available")
        .eq("tenant_id", t.id)
        .eq("available", true)
        .order("price", { ascending: false });
      productsByTenant.set(t.id, prods || []);
    })
  );

  // Autenticar os 17 admins das lojas de teste
  const adminByTenantId = new Map();
  await Promise.all(
    testTenants.map(async (t) => {
      const res = await loginTenantAdmin(t.slug);
      if (res.client) adminByTenantId.set(t.id, { tenant: t, ...res });
    })
  );
  recordCheck("auth_all_17_test_admins", adminByTenantId.size === 17, `${adminByTenantId.size}/17 admins de teste autenticados`);

  const admin04 = adminByTenantId.get(testTenants[0]?.id);
  const admin05 = adminByTenantId.get(testTenants[1]?.id);

  // =========================================================================
  // FASE 1: ATAQUE PESADO DE SEGURANÇA, RLS, RPCs, EDGE FUNCTIONS & FUZZING
  // =========================================================================
  console.log("\n▶ [FASE 1/3] Ataques de Segurança, Cross-Tenant, Edge Functions e Fuzzing...");

  // 1.1 Tabelas privadas que DEVEM bloquear leitura anônima completamente
  const privateTables = [
    "tenants",
    "admin_users",
    "tenant_admins",
    "orders",
    "order_items",
    "customer_cashback_wallets",
    "customer_cashback_transactions",
    "shift_closings",
    "system_issues",
    "print_jobs",
    "user_addresses",
    "whatsapp_otp_codes",
    "coupon_usages",
    "table_sessions",
    "spooler_stations",
  ];
  const anonTableLeaks = [];
  await Promise.all(
    privateTables.map(async (tbl) => {
      const { data, error } = await anonClient.from(tbl).select("*").limit(3);
      if (!error && Array.isArray(data) && data.length > 0) {
        anonTableLeaks.push(`${tbl}(${data.length} rows)`);
      }
    })
  );
  recordCheck(
    "sec_15_private_tables_anon_blocked",
    anonTableLeaks.length === 0,
    anonTableLeaks.length === 0
      ? `Todas as ${privateTables.length} tabelas privadas retornaram 0 linhas ou erro para anon`
      : `VAZAMENTO em: ${anonTableLeaks.join(", ")}`
  );
  if (anonTableLeaks.length > 0) {
    recordVuln("CRÍTICA", "Tabelas privadas legíveis por anon", anonTableLeaks.join(", "), "RLS permissivo");
  }

  // 1.2 Verificar zero campos secretos expostos em tenants_public
  {
    const { data: pubRows } = await anonClient.from("tenants_public").select("*").limit(20);
    const sensitiveFound = [];
    for (const row of pubRows || []) {
      for (const forbidden of ["cpf_cnpj", "asaas_customer_id", "asaas_subscription_id", "monthly_price", "email", "spooler_token"]) {
        if (row[forbidden] !== undefined) sensitiveFound.push(forbidden);
      }
      if (row.payment_methods?.mp_access_token) sensitiveFound.push("payment_methods.mp_access_token");
    }
    recordCheck(
      "sec_tenants_public_clean",
      sensitiveFound.length === 0,
      sensitiveFound.length === 0
        ? "tenants_public não expõe nenhum campo financeiro/credencial"
        : `Campos vazados: ${[...new Set(sensitiveFound)].join(", ")}`
    );
  }

  // 1.3 Bloqueio de escrita direta (INSERT/UPDATE/DELETE) para anon em tabelas sensíveis
  {
    const target = testTenants[0];
    const pId = productsByTenant.get(target.id)?.[0]?.id;
    const writes = await Promise.all([
      anonClient.from("orders").insert({
        id: randomUUID(), tenant_id: target.id, customer_name: "Hacker", customer_phone: "31999990000",
        total_amount: 0.01, total: 0.01, subtotal: 0.01, status: "confirmado", payment_status: "paid",
        order_type: "delivery", items: [{ product_id: pId, quantity: 10 }],
      }),
      anonClient.from("tenants").update({ name: "Pwned" }).eq("id", target.id).select("id"),
      anonClient.from("products").insert({ id: `hack_${Date.now()}`, tenant_id: target.id, name: "Hack", price: 0.01 }),
      anonClient.from("coupons").insert({ id: `hack_c_${Date.now()}`, tenant_id: target.id, code: "FREE100", discount_type: "percentage", discount_value: 100 }),
      anonClient.from("customer_cashback_wallets").insert({ tenant_id: target.id, phone: "31999990000", balance: 99999 }),
      anonClient.from("print_jobs").insert({ tenant_id: target.id, order_id: "fake", sector_key: "c", sector_name: "C", payload: {} }),
    ]);
    const allBlocked = writes.every((w) => Boolean(w.error) || (Array.isArray(w.data) && w.data.length === 0));
    recordCheck(
      "sec_direct_anon_writes_blocked",
      allBlocked,
      allBlocked ? "Todos os 6 INSERT/UPDATE diretos como anon foram rejeitados por RLS (0 linhas afetadas)" : "Alguma escrita anon passou!"
    );
    if (!allBlocked) recordVuln("CRÍTICA", "Escrita direta anon permitida", "public.*", "Check RLS");
  }

  // 1.4 Ataque a TODAS as RPCs administrativas como anon (19 RPCs)
  {
    const target = testTenants[0];
    const adminRpcCalls = [
      ["create_store_admin_user", { p_tenant_id: target.id, p_username: "hax", p_password: "Hax@1234", p_role: "admin", p_permissions: ["*"] }],
      ["update_store_admin_user", { p_user_id: randomUUID(), p_password: "Hax@1234" }],
      ["delete_store_admin_user", { p_user_id: randomUUID() }],
      ["update_tenant_payment_methods", { p_tenant_id: target.id, p_payment_methods: { pix_key: "evil@pix" } }],
      ["update_tenant_delivery_drivers", { p_tenant_id: target.id, p_drivers: [] }],
      ["update_tenant_settings", { p_tenant_id: target.id, p_data: { name: "Evil" } }],
      ["generate_default_tables", { p_tenant_id: target.id, p_count: 1 }],
      ["open_table_session", { p_tenant_id: target.id, p_table_id: randomUUID(), p_customer_name: "Evil" }],
      ["close_table_session", { p_tenant_id: target.id, p_session_id: randomUUID(), p_payment_method: "pix" }],
      ["auto_deliver_stale_orders", { p_tenant_id: target.id, p_timeout_hours: 1 }],
      ["process_order_cashback", { p_order_id: "fake", p_action: "all" }],
      ["revert_order_cashback", { p_order_id: "fake" }],
      ["resolve_system_issue", { p_issue_id: randomUUID(), p_resolved_by: "hax" }],
      ["reopen_system_issue", { p_issue_id: randomUUID() }],
      ["generate_spooler_pairing_code", { p_tenant_id: target.id }],
      ["delete_tenant", { p_tenant_id: target.id }],
      ["get_sales_metrics", { p_tenant_id: target.id }],
      ["get_clients_summary", { p_tenant_id: target.id }],
      ["get_master_tenants", {}],
    ];
    const rpcRes = await Promise.all(
      adminRpcCalls.map(async ([fn, args]) => {
        const { data, error } = await anonClient.rpc(fn, args);
        return { fn, blocked: Boolean(error || data?.success === false) };
      })
    );
    const leakedRpcs = rpcRes.filter((r) => !r.blocked).map((r) => r.fn);
    recordCheck(
      "sec_19_admin_rpcs_anon_blocked",
      leakedRpcs.length === 0,
      leakedRpcs.length === 0
        ? `19/19 RPCs administrativas negaram execução anônima`
        : `RPCs aceitas para anon: ${leakedRpcs.join(", ")}`
    );
    if (leakedRpcs.length > 0) recordVuln("CRÍTICA", "RPCs administrativas expostas para anon", leakedRpcs.join(", "), "Permissão EXECUTE indevida");
  }

  // 1.5 Ataque Cross-Tenant Autenticado: Admin Loja 04 tentando ler/alterar PedeMuleke e Loja 05
  if (admin04 && admin05 && pedemuleke) {
    const crossReads = await Promise.all([
      admin04.client.from("orders").select("id").eq("tenant_id", pedemuleke.id).limit(5),
      admin04.client.from("orders").select("id").eq("tenant_id", admin05.tenant.id).limit(5),
      admin04.client.from("tenants").select("id, mp_access_token").eq("id", pedemuleke.id),
      admin04.client.from("customer_cashback_wallets").select("id, balance").eq("tenant_id", pedemuleke.id).limit(5),
      admin04.client.from("shift_closings").select("id").eq("tenant_id", admin05.tenant.id).limit(5),
      admin04.client.from("print_jobs").select("id").eq("tenant_id", admin05.tenant.id).limit(5),
    ]);
    const crossReadLeaks = crossReads.filter((r) => !r.error && Array.isArray(r.data) && r.data.length > 0).length;

    const crossRpcs = await Promise.all([
      admin04.client.rpc("get_sales_metrics", { p_tenant_id: pedemuleke.id }),
      admin04.client.rpc("get_clients_summary", { p_tenant_id: pedemuleke.id }),
      admin04.client.rpc("update_tenant_payment_methods", { p_tenant_id: pedemuleke.id, p_payment_methods: {} }),
      admin04.client.rpc("update_tenant_settings", { p_tenant_id: pedemuleke.id, p_data: { name: "Hacked" } }),
      admin04.client.rpc("generate_spooler_pairing_code", { p_tenant_id: admin05.tenant.id }),
      admin04.client.rpc("open_table_session", { p_tenant_id: admin05.tenant.id, p_table_id: randomUUID(), p_customer_name: "Cross" }),
      admin04.client.rpc("get_master_tenants"),
    ]);
    const crossRpcLeaks = crossRpcs.filter((r) => !r.error && r.data?.success !== false).length;

    recordCheck(
      "sec_cross_tenant_admin_vs_pedemuleke_and_b",
      crossReadLeaks === 0 && crossRpcLeaks === 0,
      `Cross-tenant (Admin 04 -> PedeMuleke & Loja 05): ${crossReadLeaks} vazamentos RLS, ${crossRpcLeaks} RPCs aceitas`
    );
    if (crossReadLeaks > 0 || crossRpcLeaks > 0) {
      recordVuln("CRÍTICA", "Cross-tenant bypass autenticado", "PedeMuleke/Loja05", `reads=${crossReadLeaks}, rpcs=${crossRpcLeaks}`);
    }
  }

  // 1.6 Ataques às Edge Functions (asaas e mercadopago) com e sem JWT de lojista comum
  if (admin04) {
    const [asaasNoAuth, asaasStoreAdmin, mpTestNoAuth, mpRefundCrossTenant] = await Promise.all([
      fetch(`${SUPABASE_URL}/functions/v1/asaas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_subscription", subscriptionId: "sub_probe" }),
      }),
      fetch(`${SUPABASE_URL}/functions/v1/asaas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin04.session.access_token}` },
        body: JSON.stringify({ action: "get_subscription", subscriptionId: "sub_probe" }),
      }),
      fetch(`${SUPABASE_URL}/functions/v1/mercadopago`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_credentials", accessToken: "fake" }),
      }),
      fetch(`${SUPABASE_URL}/functions/v1/mercadopago`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin04.session.access_token}` },
        body: JSON.stringify({ action: "refund_payment", paymentId: "123", tenantId: pedemuleke?.id }),
      }),
    ]);

    const edgeBlocked =
      (asaasNoAuth.status === 401 || asaasNoAuth.status === 403) &&
      (asaasStoreAdmin.status === 401 || asaasStoreAdmin.status === 403) &&
      (mpTestNoAuth.status === 401 || mpTestNoAuth.status === 403) &&
      (mpRefundCrossTenant.status === 401 || mpRefundCrossTenant.status === 403);

    recordCheck(
      "sec_edge_functions_auth_and_tenant_guard",
      edgeBlocked,
      `asaas(anon=${asaasNoAuth.status}, lojista=${asaasStoreAdmin.status}), mp(test_anon=${mpTestNoAuth.status}, refund_cross=${mpRefundCrossTenant.status})`
    );
    if (!edgeBlocked) {
      recordVuln("ALTA", "Edge Function auth/tenant bypass", "functions/v1/*", `statuses: ${asaasNoAuth.status}/${asaasStoreAdmin.status}/${mpTestNoAuth.status}/${mpRefundCrossTenant.status}`);
    }
  }

  // 1.7 Fuzzing, SQLi, Price Tampering e Regras de Negócio em create_public_order
  {
    const t04 = testTenants[0];
    const p04 = `prod_${t04.slug}_burger`; // R$ 29.90
    const pPede = productsByTenant.get(pedemuleke.id)?.[0];

    const fuzzResults = await Promise.all([
      // Adulteração de preço injetado no item JSON (deve ser ignorado e cobrar 29.90!)
      anonClient.rpc("create_public_order", {
        p_tenant_id: t04.id,
        p_customer_name: "Tamper Price Probe",
        p_customer_phone: "31999990001",
        p_delivery_type: "pickup",
        p_delivery_address: "",
        p_payment_method: "pix",
        p_items: [{ product_id: p04, quantity: 2, product_price: 0.01, subtotal: 0.02, additionals: [{ name: "Bacon Extra", price: -500, quantity: 1 }] }],
        p_notes: `${runTag}_FUZZ_TAMPER`,
      }),
      // Quantidade negativa
      anonClient.rpc("create_public_order", {
        p_tenant_id: t04.id, p_customer_name: "Neg Qty", p_customer_phone: "31999990002",
        p_delivery_type: "pickup", p_delivery_address: "", p_payment_method: "pix",
        p_items: [{ product_id: p04, quantity: -5 }],
      }),
      // Quantidade absurda
      anonClient.rpc("create_public_order", {
        p_tenant_id: t04.id, p_customer_name: "Huge Qty", p_customer_phone: "31999990003",
        p_delivery_type: "pickup", p_delivery_address: "", p_payment_method: "pix",
        p_items: [{ product_id: p04, quantity: 999999 }],
      }),
      // SQLi no cupom e nome
      anonClient.rpc("create_public_order", {
        p_tenant_id: t04.id, p_customer_name: "'; DROP TABLE orders; --", p_customer_phone: "31999990004",
        p_delivery_type: "pickup", p_delivery_address: "", p_payment_method: "pix",
        p_coupon_code: "' OR 1=1 --",
        p_items: [{ product_id: p04, quantity: 1 }],
      }),
      // Cross-tenant product injection (produto da PedeMuleke enviado para Loja 04!)
      anonClient.rpc("create_public_order", {
        p_tenant_id: t04.id, p_customer_name: "Cross Prod", p_customer_phone: "31999990005",
        p_delivery_type: "pickup", p_delivery_address: "", p_payment_method: "pix",
        p_items: [{ product_id: pPede?.id || "fake", quantity: 1 }],
      }),
      // Pedido na Vruum Burguer (sem produtos disponíveis)
      anonClient.rpc("create_public_order", {
        p_tenant_id: vruum.id, p_customer_name: "Vruum Probe", p_customer_phone: "31999990006",
        p_delivery_type: "pickup", p_delivery_address: "", p_payment_method: "pix",
        p_items: [{ product_id: pPede?.id || "fake", quantity: 1 }],
      }),
      // Pedido na loja 'visual' (modo showcase)
      anonClient.rpc("create_public_order", {
        p_tenant_id: visual.id, p_customer_name: "Visual Showcase", p_customer_phone: "31999990007",
        p_delivery_type: "delivery", p_delivery_address: "Rua X", p_payment_method: "pix",
        p_items: [{ product_id: productsByTenant.get(visual.id)?.[0]?.id || "fake", quantity: 1 }],
      }),
      // PedeMuleke delivery com bairro não cadastrado (delivery_unlisted_policy = 'block')
      anonClient.rpc("create_public_order", {
        p_tenant_id: pedemuleke.id, p_customer_name: "Bairro Fora", p_customer_phone: "31999990008",
        p_delivery_type: "delivery", p_delivery_address: "Rua Longe", p_neighborhood: "Bairro Narnia Inexistente",
        p_payment_method: "pix", p_items: [{ product_id: pPede.id, quantity: 1 }],
      }),
    ]);

    const [tamper, negQty, hugeQty, sqli, crossProd, vruumRej, visualRej, pedeBlockNeigh] = fuzzResults;
    // Tamper DEVE calcular (29.90 + 6.00) * 2 = 71.80 ignorando 0.01 e -500!
    const tamperPriceFixed = Boolean(tamper.data?.success && Math.abs(Number(tamper.data.subtotal) - 71.8) < 0.01);
    const rejectsOk =
      negQty.data?.success === false &&
      hugeQty.data?.success === false &&
      sqli.data?.success === false &&
      crossProd.data?.success === false &&
      vruumRej.data?.success === false &&
      visualRej.data?.success === false &&
      pedeBlockNeigh.data?.success === false;

    recordCheck(
      "sec_fuzzing_tampering_and_business_guards",
      tamperPriceFixed && rejectsOk,
      `Price tamper recalculado=${tamper.data?.subtotal} (esperado 71.8); 7/7 payloads inválidos/cross-tenant/showcase/vruum/bairro bloqueados=${rejectsOk}`
    );
    if (!tamperPriceFixed) {
      recordVuln("CRÍTICA", "Tampering de preço/adicional em create_public_order", "rpc/create_public_order", `subtotal=${tamper.data?.subtotal}`);
    }
  }

  // =========================================================================
  // FASE 2: CONCORRÊNCIA BRUTA & RACE CONDITIONS EXTREMAS
  // =========================================================================
  console.log("\n▶ [FASE 2/3] Testes Extremos de Concorrência, Double-Spend e Duplicação...");

  // 2A: 20 chamadas simultâneas a process_order_cashback
  {
    const cbAdmin = Array.from(adminByTenantId.values()).find((a) => a.tenant.cashback_enabled) || admin04;
    const racePhone = `3199770${String(Date.now()).slice(-4)}`;
    const ordId = randomUUID();
    await cbAdmin.client.from("orders").insert({
      id: ordId,
      tenant_id: cbAdmin.tenant.id,
      customer_name: "Chaos CB 20x",
      customer_phone: racePhone,
      total_amount: 200, total: 200, subtotal: 200,
      cashback_discount: 0, cashback_earned: 20.0,
      status: "entregue", order_type: "delivery", notes: `${runTag}_CB20`,
      items: [{ product_id: `prod_${cbAdmin.tenant.slug}_burger`, product_name: "Burger", product_price: 29.9, quantity: 1, subtotal: 29.9 }],
    });

    await Promise.all(
      Array.from({ length: 20 }, (_, idx) =>
        cbAdmin.client.rpc("process_order_cashback", idx % 2 === 0 ? { p_order_id: ordId, p_action: "credit_only" } : { p_order_id: ordId })
      )
    );

    const { data: bal } = await anonClient.rpc("get_customer_cashback_balance", { p_tenant_id: cbAdmin.tenant.id, p_phone: racePhone });
    const balance = Number(bal?.balance || 0);
    const { data: cbTxs } = await cbAdmin.client
      .from("customer_cashback_transactions")
      .select("id, type, amount")
      .eq("order_id", ordId)
      .eq("type", "credit");

    const passed = Math.abs(balance - 20.0) < 0.01 && (cbTxs?.length || 0) === 1;
    recordCheck(
      "race_20x_cashback_credit_no_duplicate",
      passed,
      `20 chamadas simultâneas: saldo=R$ ${balance.toFixed(2)} (esperado R$ 20.00), transações 'credit'=${cbTxs?.length}`
    );
    if (!passed) recordBug("CRÍTICA", "Duplicação de cashback sob 20x concorrência", `saldo=${balance}, txs=${cbTxs?.length}`);
    report.concurrency.cashback20x = { balance, creditTxCount: cbTxs?.length };
  }

  // 2B: 20 pedidos simultâneos tentando gastar OS MESMOS R$ 25,00 (Double-Spend Attack!)
  {
    const cbAdmin = Array.from(adminByTenantId.values()).find((a) => a.tenant.cashback_enabled) || admin04;
    const doubleSpendPhone = `3199${String(cbAdmin.tenant.slug.slice(-2))}0001`; // cliente seed com R$ 25,00!
    const { data: balBefore } = await anonClient.rpc("get_customer_cashback_balance", {
      p_tenant_id: cbAdmin.tenant.id,
      p_phone: doubleSpendPhone,
    });
    const initialBal = Number(balBefore?.balance || 0);

    const spendReqs = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        anonClient.rpc("create_public_order", {
          p_tenant_id: cbAdmin.tenant.id,
          p_customer_name: `DoubleSpend #${i}`,
          p_customer_phone: doubleSpendPhone,
          p_delivery_type: "pickup",
          p_delivery_address: "",
          p_payment_method: "pix",
          p_items: [{ product_id: `prod_${cbAdmin.tenant.slug}_burger`, quantity: 2 }], // R$ 59.80 -> max 50% cashback = 29.90
          p_use_cashback: true,
          p_cashback_amount: 25.0,
          p_notes: `${runTag}_DOUBLESPEND`,
        })
      )
    );

    const { data: balAfter } = await anonClient.rpc("get_customer_cashback_balance", {
      p_tenant_id: cbAdmin.tenant.id,
      p_phone: doubleSpendPhone,
    });
    const finalBal = Number(balAfter?.balance || 0);
    const totalDiscountGiven = spendReqs.reduce((acc, r) => acc + Number(r.data?.cashback_discount || 0), 0);
    const ordersWithCb = spendReqs.filter((r) => Number(r.data?.cashback_discount || 0) > 0).length;

    const passed = finalBal >= 0 && totalDiscountGiven <= initialBal + 0.01;
    recordCheck(
      "race_20x_cashback_double_spend_prevented",
      passed,
      `Saldo inicial=R$${initialBal.toFixed(2)}, 20 pedidos simultâneos: total abatido=R$${totalDiscountGiven.toFixed(2)} em ${ordersWithCb} pedido(s), saldo final=R$${finalBal.toFixed(2)}`
    );
    if (!passed) recordVuln("CRÍTICA", "Cashback Double-Spend sob concorrência", cbAdmin.tenant.slug, `initial=${initialBal}, discountGiven=${totalDiscountGiven}, final=${finalBal}`);
    report.concurrency.doubleSpend20x = { initialBal, totalDiscountGiven, ordersWithCb, finalBal };
  }

  // 2C: 30 pedidos simultâneos atacando o mesmo cupom usage_limit = 1 (UNICO5 na loja 04)
  {
    const targetAdmin = admin04;
    const target = targetAdmin.tenant;
    const { data: unicoCup } = await targetAdmin.client
      .from("coupons")
      .select("id")
      .eq("tenant_id", target.id)
      .eq("code", "UNICO5")
      .maybeSingle();
    if (unicoCup?.id) await targetAdmin.client.from("coupon_usages").delete().eq("coupon_id", unicoCup.id);

    const cupReqs = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        anonClient.rpc("create_public_order", {
          p_tenant_id: target.id,
          p_customer_name: `Chaos Cupom ${i}`,
          p_customer_phone: `319866600${String(i).padStart(2, "0")}`,
          p_delivery_type: "pickup",
          p_delivery_address: "",
          p_payment_method: "pix",
          p_items: [{ product_id: `prod_${target.slug}_burger`, quantity: 1 }],
          p_coupon_code: "UNICO5",
          p_notes: `${runTag}_CUPOM30`,
        })
      )
    );
    const discounted = cupReqs.filter((r) => r.data?.success && Number(r.data?.discount) > 0);
    const passed = discounted.length === 1;
    recordCheck(
      "race_30x_coupon_usage_limit_1",
      passed,
      `30 pedidos simultâneos para UNICO5 (limit=1): exatamente ${discounted.length}/30 aceito`
    );
    if (!passed) recordBug("ALTA", "Cupom usage_limit violado em 30x concorrência", `${discounted.length}/30 aceitos`);
    report.concurrency.coupon30x = { attempts: 30, discountedCount: discounted.length };
  }

  // 2D: 20 aberturas simultâneas + 20 pedidos dine_in simultâneos na MESMA mesa
  {
    const targetAdmin = admin05;
    const target = targetAdmin.tenant;
    const { data: tbls } = await targetAdmin.client
      .from("restaurant_tables")
      .select("id, table_number")
      .eq("tenant_id", target.id)
      .order("table_number");
    const tbl = tbls?.[0];
    if (tbl) {
      await targetAdmin.client.from("table_sessions").delete().eq("table_id", tbl.id);
      await targetAdmin.client.from("restaurant_tables").update({ status: "available" }).eq("id", tbl.id);

      const [openCalls, dineCalls] = await Promise.all([
        Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            targetAdmin.client.rpc("open_table_session", {
              p_tenant_id: target.id,
              p_table_id: tbl.id,
              p_customer_name: `OpenRace ${i}`,
              p_customer_phone: "31999990000",
              p_people_count: 2,
            })
          )
        ),
        Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            anonClient.rpc("create_public_order", {
              p_tenant_id: target.id,
              p_customer_name: `DineRace ${i}`,
              p_customer_phone: "31999990000",
              p_delivery_type: "dine_in",
              p_delivery_address: "",
              p_payment_method: "dinheiro",
              p_table_number: tbl.table_number,
              p_items: [{ product_id: `prod_${target.slug}_burger`, quantity: 1 }],
              p_notes: `${runTag}_TABLE40`,
            })
          )
        ),
      ]);

      const { data: openSessRows } = await targetAdmin.client
        .from("table_sessions")
        .select("id, status")
        .eq("table_id", tbl.id)
        .in("status", ["open", "bill_requested"]);

      const dineOk = dineCalls.filter((d) => d.data?.success).length;
      const openSessIds = new Set(dineCalls.map((d) => d.data?.table_session_id).filter(Boolean));
      const passed = (openSessRows?.length || 0) === 1 && dineOk === 20 && openSessIds.size === 1;

      recordCheck(
        "race_40x_table_session_and_dine_in_single_session",
        passed,
        `20 open_table_session + 20 pedidos dine_in na mesa ${tbl.table_number}: ${openSessRows?.length} sessão aberta no DB, ${dineOk}/20 pedidos vinculados ao mesmo session_id`
      );
      if (!passed) recordBug("ALTA", "Duplicidade de sessão de mesa sob 40x concorrência", `sessRows=${openSessRows?.length}, dineOk=${dineOk}`);
      report.concurrency.table40x = { openSessionsInDb: openSessRows?.length, dineOrdersSucceeded: dineOk };
    }
  }

  // =========================================================================
  // FASE 3: RAJADA MASSIVA NAS 20 EMPRESAS (~1.100 PEDIDOS + 120 LEITURAS + KDS + SPOOLER 12x)
  // =========================================================================
  console.log("\n▶ [FASE 3/3] RAJADA MASSIVA NAS 20 EMPRESAS (1.100 requisições em 2 ondas + 120 leituras + updates KDS)...");
  console.log("  ⚠️ Todos os pedidos criados nesta rajada permanecerão GRAVADOS no banco por solicitação do usuário.");

  const ORDERS_PER_TENANT = 55; // 55 * 20 = 1.100 tentativas cobrindo TODAS as 20 empresas!
  const allBurstTasksSpec = [];

  for (const t of allTenants) {
    const tProds = productsByTenant.get(t.id) || [];
    const mainProdId = tProds[0]?.id || `prod_${t.slug}_missing`;
    const secProdId = tProds[1]?.id || mainProdId;

    // Descobre um bairro válido se a loja usa taxa por bairro
    let validNeighborhood = "Centro";
    if (Array.isArray(t.delivery_neighborhoods) && t.delivery_neighborhoods.length > 0) {
      const activeNh = t.delivery_neighborhoods.find((n) => n && n.active !== false && n.name);
      if (activeNh) validNeighborhood = activeNh.name;
    }

    for (let k = 1; k <= ORDERS_PER_TENANT; k++) {
      const mod = k % 3;
      const deliveryType = mod === 0 ? "pickup" : mod === 1 ? "delivery" : "dine_in";

      // Determinar se essa loja + modo + produto deve ser aceita ou rejeitada por regra de negócio
      let expectedAccept = true;
      if (tProds.length === 0) expectedAccept = false; // Vruum Burguer sem produto
      else if (t.salon_mode === "showcase" || t.plan === "showcase") expectedAccept = false; // visual, test-09, test-15
      else if (deliveryType === "pickup" && t.accepts_takeaway === false) expectedAccept = false;
      else if (deliveryType === "delivery" && (t.salon_mode === "table_only" || t.accepts_delivery === false)) expectedAccept = false;
      else if (deliveryType === "dine_in" && t.accepts_dine_in === false) expectedAccept = false;

      allBurstTasksSpec.push({
        tenant: t,
        k,
        deliveryType,
        validNeighborhood,
        mainProdId,
        secProdId,
        hasSecondItem: tProds.length > 1,
        expectedAccept,
      });
    }
  }

  // Embaralhar para intercalar TODAS as 20 empresas concorrentemente na mesma janela de milissegundos
  for (let i = allBurstTasksSpec.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allBurstTasksSpec[i], allBurstTasksSpec[j]] = [allBurstTasksSpec[j], allBurstTasksSpec[i]];
  }

  const executeBurstOrder = async (spec) => {
    const t0 = Date.now();
    const items = [{ product_id: spec.mainProdId, quantity: 1 + (spec.k % 2) }];
    if (spec.hasSecondItem && spec.k % 2 === 0) {
      items.push({ product_id: spec.secProdId, quantity: 1 });
    }
    const { data, error } = await anonClient.rpc("create_public_order", {
      p_tenant_id: spec.tenant.id,
      p_customer_name: `Chaos ${spec.tenant.slug} #${spec.k}`,
      p_customer_phone: `3197${String(spec.tenant.code).padStart(2, "0")}${String(spec.k).padStart(5, "0")}`,
      p_delivery_type: spec.deliveryType,
      p_delivery_address: `Av. Carga Extrema ${spec.k}, ${spec.validNeighborhood}`,
      p_neighborhood: spec.validNeighborhood,
      p_payment_method: spec.k % 2 === 0 ? "pix" : "dinheiro",
      p_items: items,
      p_notes: `${runTag}_MASSIVE`,
      p_table_number: spec.deliveryType === "dine_in" ? String((spec.k % 5) + 1) : null,
    });
    return {
      tenantId: spec.tenant.id,
      slug: spec.tenant.slug,
      expectedAccept: spec.expectedAccept,
      success: Boolean(!error && data?.success),
      orderId: data?.order_id,
      orderNumber: data?.order_number,
      total: Number(data?.total || 0),
      latency: Date.now() - t0,
      error: error?.message || (data?.success === false ? data?.message : null),
    };
  };

  // Wave 1 (550 pedidos concorrentes) + Wave 2 (550 pedidos concorrentes + 120 leituras simultâneas)
  const wave1Specs = allBurstTasksSpec.slice(0, 550);
  const wave2Specs = allBurstTasksSpec.slice(550);

  const readTasks = Array.from({ length: 120 }, (_, r) => async () => {
    const t = allTenants[r % allTenants.length];
    const t0 = Date.now();
    const { data, error } = await anonClient
      .from("products")
      .select("id, name, price")
      .eq("tenant_id", t.id)
      .eq("available", true);
    return { success: !error, count: data?.length ?? 0, latency: Date.now() - t0 };
  });

  const tBurstStart = Date.now();
  const wave1Results = await Promise.all(wave1Specs.map(executeBurstOrder));
  const [wave2Results, readResults] = await Promise.all([
    Promise.all(wave2Specs.map(executeBurstOrder)),
    Promise.all(readTasks.map((fn) => fn())),
  ]);
  const burstTotalSec = (Date.now() - tBurstStart) / 1000;

  const allBurstResults = [...wave1Results, ...wave2Results];
  const acceptedOrders = allBurstResults.filter((r) => r.success);
  const rejectedOrders = allBurstResults.filter((r) => !r.success);
  const expectedAcceptedList = allBurstResults.filter((r) => r.expectedAccept);
  const unexpectedFailures = allBurstResults.filter((r) => r.expectedAccept && !r.success);
  const unexpectedAccepts = allBurstResults.filter((r) => !r.expectedAccept && r.success);

  // KDS / Painel Updates concorrentes nas 17 lojas de teste (avançando status de alguns pedidos recém-criados)
  let kdsUpdatesOk = 0;
  let kdsUpdatesAttempted = 0;
  await Promise.all(
    Array.from(adminByTenantId.values()).map(async (adm) => {
      const tenantOrders = acceptedOrders.filter((o) => o.tenantId === adm.tenant.id).slice(0, 5);
      for (const o of tenantOrders) {
        kdsUpdatesAttempted++;
        const { error: kErr } = await adm.client
          .from("orders")
          .update({ status: "em_preparo", updated_date: new Date().toISOString() })
          .eq("id", o.orderId)
          .eq("tenant_id", adm.tenant.id);
        if (!kErr) kdsUpdatesOk++;
      }
    })
  );

  // Spooler Chaos: 12 pollers simultâneos na Loja 04 puxando print_jobs da rajada!
  let spooler12Unique = 0;
  let spooler12Dups = 0;
  if (admin04) {
    const { data: pairRes } = await admin04.client.rpc("generate_spooler_pairing_code", { p_tenant_id: admin04.tenant.id });
    if (pairRes?.pairing_code) {
      const { data: paired } = await anonClient.rpc("spooler_pair", { p_pairing_code: pairRes.pairing_code });
      if (paired?.stationToken) {
        const polls = await Promise.all(
          Array.from({ length: 12 }, () => anonClient.rpc("spooler_poll", { p_station_token: paired.stationToken }))
        );
        const seen = new Set();
        for (const p of polls) {
          for (const j of p.data?.jobs || []) {
            if (seen.has(j.id)) spooler12Dups++;
            seen.add(j.id);
          }
        }
        spooler12Unique = seen.size;
        await Promise.all(
          Array.from(seen).map((jid) =>
            anonClient.rpc("spooler_ack", { p_station_token: paired.stationToken, p_job_id: jid, p_status: "printed" })
          )
        );
      }
    }
  }

  // Checar colisões de order_number por tenant dentro desta rajada massiva!
  const numsBySlug = {};
  for (const r of acceptedOrders) {
    if (!numsBySlug[r.slug]) numsBySlug[r.slug] = [];
    numsBySlug[r.slug].push(r.orderNumber);
  }
  let collisionCount = 0;
  const tenantsWithCollisions = [];
  for (const [slug, nums] of Object.entries(numsBySlug)) {
    const uniq = new Set(nums);
    if (uniq.size < nums.length) {
      collisionCount += nums.length - uniq.size;
      tenantsWithCollisions.push(slug);
    }
  }

  // Verificar também por consulta autenticada nos admins se há duplicidade de order_number nos pedidos EXTREME_CHAOS no DB
  for (const adm of adminByTenantId.values()) {
    const { data: dbRows } = await adm.client
      .from("orders")
      .select("id, order_number, total_amount")
      .eq("tenant_id", adm.tenant.id)
      .ilike("notes", `%${runTag}%`);
    const nums = (dbRows || []).map((x) => x.order_number);
    const uniqNums = new Set(nums);
    if (uniqNums.size < nums.length) {
      collisionCount += nums.length - uniqNums.size;
      tenantsWithCollisions.push(`${adm.tenant.slug}(db)`);
    }
  }

  // Resumo por empresa
  for (const t of allTenants) {
    const mine = allBurstResults.filter((r) => r.tenantId === t.id);
    const ok = mine.filter((r) => r.success);
    const fail = mine.filter((r) => !r.success);
    report.perTenantSummary.push({
      code: t.code,
      slug: t.slug,
      name: t.name,
      mode: t.salon_mode,
      sent: mine.length,
      createdInDb: ok.length,
      rejected: fail.length,
      avgLatencyMs: mine.length ? Math.round(mine.reduce((a, b) => a + b.latency, 0) / mine.length) : 0,
      sampleRejectReason: fail[0]?.error || null,
    });
  }

  const allLats = allBurstResults.map((r) => r.latency);
  const readOk = readResults.filter((r) => r.success).length;
  const readAvgMs = Math.round(readResults.reduce((a, b) => a + b.latency, 0) / readResults.length);

  recordCheck(
    "massive_burst_all_expectations_met",
    unexpectedFailures.length === 0 && unexpectedAccepts.length === 0,
    `${acceptedOrders.length}/${expectedAcceptedList.length} pedidos elegíveis gravados no DB; ${rejectedOrders.length} bloqueados por regra (Vruum sem produto / showcase / table_only); falhas inesperadas=${unexpectedFailures.length}`
  );
  if (unexpectedFailures.length > 0) {
    recordBug("ALTA", "Falhas inesperadas sob carga massiva", unexpectedFailures.slice(0, 5).map((f) => `${f.slug}: ${f.error}`).join(" | "));
  }

  recordCheck(
    "massive_burst_zero_order_number_collisions",
    collisionCount === 0,
    `${collisionCount} colisões de order_number em ${acceptedOrders.length} pedidos gravados nas lojas ativas`
  );
  if (collisionCount > 0) recordBug("CRÍTICA", "Colisão de order_number na rajada massiva", tenantsWithCollisions.join(", "));

  recordCheck(
    "massive_burst_kds_and_reads_and_spooler12x",
    readOk === 120 && kdsUpdatesOk === kdsUpdatesAttempted && spooler12Dups === 0,
    `Leituras concorrentes=${readOk}/120 (${readAvgMs}ms avg); KDS status updates=${kdsUpdatesOk}/${kdsUpdatesAttempted}; Spooler 12x pollers=${spooler12Unique} jobs únicos, ${spooler12Dups} duplicados`
  );

  report.massiveBurst = {
    totalRequestsSent: allBurstResults.length,
    expectedAccepted: expectedAcceptedList.length,
    succeededAndPersisted: acceptedOrders.length,
    blockedByBusinessRules: rejectedOrders.length,
    unexpectedFailures: unexpectedFailures.slice(0, 5),
    durationSec: Number(burstTotalSec.toFixed(2)),
    throughputReqPerSec: Number((allBurstResults.length / burstTotalSec).toFixed(2)),
    avgLatencyMs: Math.round(allLats.reduce((a, b) => a + b, 0) / allLats.length),
    p95LatencyMs: percentile(allLats, 95),
    maxLatencyMs: Math.max(...allLats),
    orderNumberCollisions: collisionCount,
    concurrentReads: `${readOk}/120`,
    kdsUpdates: `${kdsUpdatesOk}/${kdsUpdatesAttempted}`,
    spooler12xPoll: { uniqueJobs: spooler12Unique, duplicates: spooler12Dups },
  };

  console.log("\n📊 RESUMO DA RAJADA MASSIVA (GRAVADA NO BANCO):");
  console.log(JSON.stringify(report.massiveBurst, null, 2));

  console.log("\n🏢 DETALHAMENTO POR EMPRESA (TODAS AS 20):");
  for (const row of report.perTenantSummary) {
    console.log(`  #${String(row.code).padStart(2, "0")} ${row.slug.padEnd(18)} | modo=${String(row.mode).padEnd(10)} | criados=${String(row.createdInDb).padStart(2)}/${row.sent} | rejeitados=${String(row.rejected).padStart(2)} | avg=${row.avgLatencyMs}ms${row.sampleRejectReason ? ` | motivo_rej="${row.sampleRejectReason}"` : ""}`);
  }

  const passedCount = report.checks.filter((c) => c.passed).length;
  console.log("\n==================================================================================");
  console.log("🏁 RESULTADO FINAL DO TESTE EXTREMO DE CAOS");
  console.log(`Checks aprovados: ${passedCount}/${report.checks.length}`);
  console.log(`Vulnerabilidades abertas: ${report.vulnerabilitiesFound.length}`);
  console.log(`Bugs/Gargalos/Duplicações: ${report.bugsAndBottlenecksFound.length}`);
  console.log(`Pedidos da rajada mantidos gravados no banco (Tag: ${runTag})`);
  console.log("==================================================================================\n");

  const outPath = path.resolve(__dirname, "last_extreme_chaos_report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Relatório salvo em: ${outPath}`);

  if (passedCount < report.checks.length || report.vulnerabilitiesFound.length > 0 || report.bugsAndBottlenecksFound.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro fatal na suíte extrema:", err);
  process.exit(1);
});
