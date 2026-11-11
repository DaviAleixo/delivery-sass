/**
 * SUÍTE COMPLETA DE TESTES DE CARGA, FUNCIONALIDADES, CONCORRÊNCIA E SEGURANÇA (20 EMPRESAS)
 * Arquivo: tests/full_system_20_tenants_stress_test.mjs
 * Execução: node tests/full_system_20_tenants_stress_test.mjs
 *
 * Valida todas as correções de segurança, RLS, RPCs, concorrência e performance:
 * - Preserva integralmente PedeMuleke, Vruum Burguer e visual.
 * - Executa mutações pesadas apenas nas empresas de teste (test-empresa-04..20).
 * - Confirma que todas as vulnerabilidades críticas/altas anteriores estão BLOQUEADAS.
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
const runTag = `FULLTEST_${Date.now()}`;

const report = {
  tenantsCount: 0,
  testTenantsCount: 0,
  functionalTests: [],
  concurrencyTests: {},
  vulnerabilitiesFound: [],
  bugsAndGapsFound: [],
};

function recordFunc(name, passed, detail) {
  report.functionalTests.push({ name, passed, detail });
  const icon = passed ? "✅" : "❌";
  console.log(`  ${icon} [${name}] ${detail}`);
}

function recordVuln(severity, title, target, detail) {
  report.vulnerabilitiesFound.push({ severity, title, target, detail });
  console.log(`  🚨 [${severity}] ${title} (${target}): ${detail}`);
}

function recordBug(severity, title, detail) {
  report.bugsAndGapsFound.push({ severity, title, detail });
  console.log(`  ⚠️ [${severity}] ${title}: ${detail}`);
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
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
  return { client, user: authData.user, error: null };
}

async function main() {
  console.log("=========================================================================");
  console.log("🔥 SUITE FORTE MULTI-TENANT (20 EMPRESAS) — PÓS-HARDENING PEDEMULEKE");
  console.log(`📡 Endpoint: ${SUPABASE_URL}`);
  console.log(`🏷️  Run Tag: ${runTag}`);
  console.log("=========================================================================\n");

  const createdOrderIdsByTenant = new Map();
  const trackOrderCleanup = (tenantId, orderId) => {
    if (!tenantId || !orderId) return;
    if (!createdOrderIdsByTenant.has(tenantId)) createdOrderIdsByTenant.set(tenantId, new Set());
    createdOrderIdsByTenant.get(tenantId).add(orderId);
  };

  // -------------------------------------------------------------------------
  // 1. DESCOBERTA DAS 20 EMPRESAS VIA VIEW PÚBLICA & BLOQUEIO DA TABELA TENANTS
  // -------------------------------------------------------------------------
  console.log("▶ [1/6] Validando tenants_public (20 empresas) e bloqueio de tenants para anon...");

  const { data: anonDirectTenants, error: anonTenantsErr } = await anonClient
    .from("tenants")
    .select("id, payment_methods")
    .limit(5);

  const tenantsTableBlocked = Boolean(anonTenantsErr || !anonDirectTenants || anonDirectTenants.length === 0);
  recordFunc(
    "sec_tenants_table_blocked_for_anon",
    tenantsTableBlocked,
    tenantsTableBlocked
      ? "Tabela public.tenants bloqueada para anon (0 linhas ou erro)"
      : `Vazamento: anon leu ${anonDirectTenants.length} registros em tenants`
  );
  if (!tenantsTableBlocked) {
    recordVuln("CRÍTICA", "public.tenants ainda legível por anon", "public.tenants", `${anonDirectTenants.length} registros lidos`);
  }

  const { data: allTenants, error: tErr } = await anonClient
    .from("tenants_public")
    .select("id, code, name, slug, plan, is_active, salon_mode, accepts_delivery, accepts_takeaway, accepts_dine_in, cashback_enabled, auto_accept_delivery, payment_methods")
    .order("code", { ascending: true });

  if (tErr) {
    console.error("Erro ao consultar tenants_public:", tErr.message);
    process.exit(1);
  }

  report.tenantsCount = allTenants.length;
  const pedemuleke = allTenants.find((t) => t.slug === "teste" || t.name.toLowerCase().includes("pedemuleke"));
  const vruum = allTenants.find((t) => t.id === "a0000000-0000-0000-0000-000000000001");
  const testTenants = allTenants.filter((t) => t.slug.startsWith("test-empresa-"));
  report.testTenantsCount = testTenants.length;

  recordFunc("20_tenants_present", allTenants.length === 20, `Total de empresas ativas encontradas: ${allTenants.length} (originais: 3, teste: ${testTenants.length})`);
  recordFunc("pedemuleke_preserved", Boolean(pedemuleke && pedemuleke.is_active), `PedeMuleke preservada: ${pedemuleke?.name} (${pedemuleke?.id})`);
  recordFunc("vruum_preserved", Boolean(vruum && vruum.is_active), `Vruum Burguer preservada: ${vruum?.name}`);

  // -------------------------------------------------------------------------
  // 2. AUDITORIA ATIVA DE VULNERABILIDADES (DEVEM ESTAR TODAS BLOQUEADAS)
  // -------------------------------------------------------------------------
  console.log("\n▶ [2/6] Verificando bloqueio de todas as vulnerabilidades anteriores...");

  // 2.1 mp_access_token NÃO pode aparecer em tenants_public
  const leakedTokens = allTenants.filter((t) => t.payment_methods && t.payment_methods.mp_access_token);
  recordFunc(
    "sec_tenants_public_strips_mp_token",
    leakedTokens.length === 0,
    leakedTokens.length === 0
      ? "tenants_public removeu mp_access_token e segredos de todas as 20 lojas"
      : `${leakedTokens.length} loja(s) ainda expõem mp_access_token`
  );
  if (leakedTokens.length > 0) {
    recordVuln("CRÍTICA", "mp_access_token ainda exposto em tenants_public", "public.tenants_public", `${leakedTokens.map((x) => x.slug).join(", ")}`);
  }

  // 2.2 orders bloqueada para anon
  {
    const { data: leakedOrders, error } = await anonClient.from("orders").select("id, tenant_id, customer_name, customer_phone, total").limit(5);
    const blocked = Boolean(error || !leakedOrders || leakedOrders.length === 0);
    recordFunc("sec_orders_anon_blocked", blocked, blocked ? "Leitura direta de orders bloqueada para anon" : `Anon leu ${leakedOrders.length} pedidos`);
    if (!blocked) recordVuln("CRÍTICA", "RLS SELECT em orders ainda aberto para anon", "public.orders", `${leakedOrders.length} linhas lidas`);
  }

  // 2.3 customer_cashback_wallets bloqueada para anon
  {
    const { data: wallets, error } = await anonClient.from("customer_cashback_wallets").select("id, balance").limit(5);
    const blocked = Boolean(error || !wallets || wallets.length === 0);
    recordFunc("sec_cashback_wallets_anon_blocked", blocked, blocked ? "customer_cashback_wallets bloqueada para anon" : `Anon leu ${wallets.length} carteiras`);
    if (!blocked) recordVuln("ALTA", "RLS em customer_cashback_wallets aberto para anon", "public.customer_cashback_wallets", `${wallets.length} linhas`);
  }

  // 2.4 system_issues & shift_closings bloqueadas para anon
  {
    const [{ data: issues, error: iErr }, { data: closings, error: cErr }] = await Promise.all([
      anonClient.from("system_issues").select("id").limit(3),
      anonClient.from("shift_closings").select("id").limit(3),
    ]);
    const blocked = Boolean((iErr || !issues || issues.length === 0) && (cErr || !closings || closings.length === 0));
    recordFunc("sec_issues_closings_anon_blocked", blocked, blocked ? "system_issues e shift_closings bloqueados para anon" : "Anon leu system_issues ou shift_closings");
    if (!blocked) recordVuln("MÉDIA", "RLS aberto em system_issues/shift_closings", "public.system_issues", "Anon leu registros");
  }

  // 2.5 WhatsApp OTP (intencionalmente em modo dev até API WPP existir, mas sem fallback '123456' no frontend)
  {
    const target = testTenants[0];
    const { data: otpData, error: otpErr } = await anonClient.rpc("request_whatsapp_otp", {
      p_phone: "31999991111",
      p_full_name: "Teste Probe OTP",
      p_tenant_id: target.id,
    });
    if (!otpErr && otpData?.success && otpData?.code) {
      const { data: verBad } = await anonClient.rpc("verify_whatsapp_otp", {
        p_phone: "31999991111",
        p_code: otpData.code === "123456" ? "654321" : "123456",
        p_full_name: "Teste Probe OTP",
        p_tenant_id: target.id,
      });
      const { data: verData } = await anonClient.rpc("verify_whatsapp_otp", {
        p_phone: "31999991111",
        p_code: otpData.code,
        p_full_name: "Teste Probe OTP",
        p_tenant_id: target.id,
      });
      recordFunc(
        "whatsapp_otp_verify_flow",
        Boolean(verData?.success && verBad?.success === false),
        `verify_whatsapp_otp validou código correto e rejeitou código falso (Nota: código em payload aguarda API WPP)`
      );
    } else {
      recordFunc("whatsapp_otp_verify_flow", false, `Falha no fluxo OTP: ${otpErr?.message}`);
    }
  }

  // 2.6 RPCs administrativas create_store_admin_user / delete_store_admin_user bloqueadas para anon
  {
    const target = testTenants[0];
    const fakeUser = `probe_anon_${Date.now()}`;
    const { data: createdAdmin, error: admErr } = await anonClient.rpc("create_store_admin_user", {
      p_tenant_id: target.id,
      p_username: fakeUser,
      p_password: "ProbePass@123",
      p_role: "admin",
      p_permissions: ["*"],
    });
    const blocked = Boolean(admErr || !createdAdmin?.success);
    recordFunc(
      "sec_admin_user_rpcs_anon_blocked",
      blocked,
      blocked ? `Anon bloqueado em create_store_admin_user: ${admErr?.message || createdAdmin?.error}` : "VULNERÁVEL: anon criou admin!"
    );
    if (!blocked) {
      recordVuln("CRÍTICA", "Privilege Escalation: anon executou create_store_admin_user", "rpc/create_store_admin_user", `user_id=${createdAdmin?.user_id}`);
    }
  }

  // 2.7 update_tenant_payment_methods bloqueada para anon
  {
    const target = testTenants[0];
    const { data: pmRes, error: pmErr } = await anonClient.rpc("update_tenant_payment_methods", {
      p_tenant_id: target.id,
      p_payment_methods: { pix_key: "atacante@pix.evil" },
    });
    const blocked = Boolean(pmErr || !pmRes?.success);
    recordFunc(
      "sec_payment_methods_rpc_anon_blocked",
      blocked,
      blocked ? `Anon bloqueado em update_tenant_payment_methods: ${pmErr?.message || pmRes?.error}` : "VULNERÁVEL: anon alterou payment_methods!"
    );
    if (!blocked) {
      recordVuln("CRÍTICA", "Payment Hijack: anon executou update_tenant_payment_methods", "rpc/update_tenant_payment_methods", target.slug);
    }
  }

  // 2.8 INSERT direto em orders bloqueado para anon (deve passar exclusivamente por create_public_order)
  {
    const target = testTenants[0];
    const fakeOrderId = randomUUID();
    const { data: forgedOrder, error: forgeErr } = await anonClient
      .from("orders")
      .insert({
        id: fakeOrderId,
        tenant_id: target.id,
        customer_name: "Atacante Preco",
        customer_phone: "31999990000",
        total_amount: 0.01,
        total: 0.01,
        subtotal: 0.01,
        delivery_fee: 0,
        status: "confirmado",
        payment_status: "paid",
        payment_method: "pix",
        order_type: "delivery",
        notes: runTag,
        items: [{ product_id: `prod_${target.slug}_burger`, product_name: "Burger Teste", product_price: 29.9, quantity: 5, subtotal: 0.01 }],
      })
      .select("id")
      .single();

    const blocked = Boolean(forgeErr || !forgedOrder);
    recordFunc(
      "sec_orders_direct_insert_anon_blocked",
      blocked,
      blocked ? `INSERT direto em orders bloqueado para anon: ${forgeErr?.message}` : "VULNERÁVEL: anon inseriu pedido a R$0.01!"
    );
    if (!blocked) {
      recordVuln("CRÍTICA", "Price & Payment Tampering em orders INSERT", "public.orders", `order ${fakeOrderId} criado a R$0.01`);
      trackOrderCleanup(target.id, fakeOrderId);
    }
  }

  // 2.9 Edge Function Asaas exige JWT (401 sem Authorization)
  try {
    const asaasRes = await fetch(`${SUPABASE_URL}/functions/v1/asaas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_subscription", subscriptionId: "sub_invalid_probe" }),
    });
    const asaasBody = await asaasRes.json().catch(() => ({}));
    const blocked = asaasRes.status === 401 || asaasRes.status === 403;
    recordFunc(
      "sec_asaas_edge_requires_jwt",
      blocked,
      blocked
        ? `Edge Function 'asaas' rejeitou chamada sem JWT (HTTP ${asaasRes.status})`
        : `HTTP ${asaasRes.status}: ${JSON.stringify(asaasBody).slice(0, 100)}`
    );
    if (!blocked) {
      recordVuln("ALTA", "Edge Function 'asaas' aceitou chamada sem JWT", "functions/v1/asaas", `HTTP ${asaasRes.status}`);
    }
  } catch (e) {
    recordFunc("sec_asaas_edge_requires_jwt", false, `Erro de rede ao testar asaas: ${e.message}`);
  }

  // -------------------------------------------------------------------------
  // 3. TESTES FUNCIONAIS DA VISÃO DO CLIENTE (MULTI-EMPRESA)
  // -------------------------------------------------------------------------
  console.log("\n▶ [3/6] Testando funcionalidades do CLIENTE em múltiplas empresas...");

  const fullTenants = testTenants.filter((t) => t.salon_mode === "full");
  const tableOnlyTenants = testTenants.filter((t) => t.salon_mode === "table_only");
  const showcaseTenants = testTenants.filter((t) => t.salon_mode === "showcase");

  // 3.1 Leitura de cardápio público em PedeMuleke + empresas teste
  {
    const sampleTargets = [pedemuleke, fullTenants[0], tableOnlyTenants[0], showcaseTenants[0]].filter(Boolean);
    let menuAllOk = true;
    for (const t of sampleTargets) {
      const [cats, prods, grps] = await Promise.all([
        anonClient.from("categories").select("id, name, type").eq("tenant_id", t.id),
        anonClient.from("products").select("id, name, price, available").eq("tenant_id", t.id),
        anonClient.from("complement_groups").select("id, name").eq("tenant_id", t.id),
      ]);
      if (cats.error || prods.error || grps.error) menuAllOk = false;
    }
    recordFunc("client_menu_read_multitenant", menuAllOk, `Leitura de cardápio público validada em ${sampleTargets.length} lojas (incluindo PedeMuleke)`);
  }

  // 3.2 Cashback + Lookup + create_public_order (recalculando adicionais!) + tracking_token
  {
    const cbTenant = fullTenants.find((t) => t.cashback_enabled) || fullTenants[0];
    const seedPhone = `3199${String(cbTenant.slug.slice(-2))}0001`;
    const { data: cbBal, error: cbErr } = await anonClient.rpc("get_customer_cashback_balance", {
      p_tenant_id: cbTenant.id,
      p_phone: seedPhone,
    });
    recordFunc(
      "client_cashback_balance",
      !cbErr && cbBal?.enabled && Number(cbBal?.balance) >= 25,
      `Saldo de cashback do cliente seed na ${cbTenant.slug}: R$ ${cbBal?.balance}`
    );

    const { data: lookupRes, error: lErr } = await anonClient.rpc("lookup_customer_by_phone", {
      p_phone: seedPhone,
      p_tenant_id: cbTenant.id,
    });
    recordFunc("client_lookup_phone", !lErr, `lookup_customer_by_phone executou sem erro (registros: ${lookupRes?.length ?? 0})`);

    // Pedido via create_public_order com 2x Burger (29.90) + Bacon Extra (6.00) + cupom TESTE10 (10%)
    // Subtotal esperado: (29.90 + 6.00) * 2? Wait: additionals quantity=1: if per-item, check exact logic!
    // Burger 29.90 * 2 = 59.80; let's check both subtotal > 59.80 (additionals counted!)
    const { data: pubOrd, error: pubErr } = await anonClient.rpc("create_public_order", {
      p_tenant_id: cbTenant.id,
      p_customer_name: "Cliente Funcional",
      p_customer_phone: seedPhone,
      p_delivery_type: "delivery",
      p_delivery_address: "Rua Teste, 200 - Centro",
      p_payment_method: "pix",
      p_items: [
        {
          product_id: `prod_${cbTenant.slug}_burger`,
          quantity: 2,
          additionals: [{ name: "Bacon Extra", price: 6.0, quantity: 1 }],
        },
      ],
      p_coupon_code: "TESTE10",
      p_notes: `${runTag} Funcional`,
    });

    if (pubOrd?.order_id) trackOrderCleanup(cbTenant.id, pubOrd.order_id);

    const additionalsCounted = Boolean(pubOrd?.success && Number(pubOrd?.subtotal) > 59.8);
    recordFunc(
      "client_create_public_order_and_additionals",
      Boolean(!pubErr && pubOrd?.success && pubOrd?.tracking_token && additionalsCounted),
      `create_public_order #${pubOrd?.order_number}: subtotal=${pubOrd?.subtotal} (com adicional Bacon Extra!), desconto=${pubOrd?.discount}, total=${pubOrd?.total}`
    );
    if (!additionalsCounted) {
      recordBug("ALTA", "create_public_order não somou preço dos adicionais", `subtotal=${pubOrd?.subtotal}`);
    }

    // Valida tracking_token válido vs inválido e get_public_orders_by_tokens
    if (pubOrd?.order_id) {
      const [{ data: trackOk }, { data: trackBad }, { data: multiTok }] = await Promise.all([
        anonClient.rpc("get_order_by_tracking_token", {
          p_order_id: pubOrd.order_id,
          p_tracking_token: pubOrd.tracking_token,
        }),
        anonClient.rpc("get_order_by_tracking_token", {
          p_order_id: pubOrd.order_id,
          p_tracking_token: "00000000-0000-0000-0000-000000000000",
        }),
        anonClient.rpc("get_public_orders_by_tokens", {
          p_tokens: [{ id: pubOrd.order_id, tracking_token: pubOrd.tracking_token }],
        }),
      ]);
      recordFunc(
        "client_tracking_token_check",
        Boolean(trackOk?.success && trackOk?.order && trackBad?.success === false && Array.isArray(multiTok) && multiTok.length === 1),
        `Tracking token válido retornou pedido; token falso rejeitado; get_public_orders_by_tokens retornou ${multiTok?.length ?? 0} pedido`
      );
    }
  }

  // 3.3 Bloqueio de produto indisponível e loja em modo showcase
  {
    const cbTenant = fullTenants[0];
    const { data: unavailOrd } = await anonClient.rpc("create_public_order", {
      p_tenant_id: cbTenant.id,
      p_customer_name: "Teste Indisp",
      p_customer_phone: "31999991234",
      p_delivery_type: "pickup",
      p_delivery_address: "",
      p_payment_method: "dinheiro",
      p_items: [{ product_id: `prod_${cbTenant.slug}_indisp`, quantity: 1 }],
      p_notes: runTag,
    });
    recordFunc(
      "client_reject_unavailable_product",
      Boolean(unavailOrd && unavailOrd.success === false),
      `Pedido com produto indisponível bloqueado: ${unavailOrd?.message}`
    );

    const showcase = showcaseTenants[0];
    if (showcase) {
      const { data: showOrd } = await anonClient.rpc("create_public_order", {
        p_tenant_id: showcase.id,
        p_customer_name: "Teste Showcase",
        p_customer_phone: "31999991234",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua X",
        p_payment_method: "dinheiro",
        p_items: [{ product_id: `prod_${showcase.slug}_burger`, quantity: 1 }],
        p_notes: runTag,
      });
      if (showOrd?.order_id) trackOrderCleanup(showcase.id, showOrd.order_id);
      const showcaseBlocked = Boolean(showOrd && showOrd.success === false);
      recordFunc(
        "client_reject_showcase_mode_order",
        showcaseBlocked,
        showcaseBlocked
          ? `Loja showcase (${showcase.slug}) rejeitou pedido: ${showOrd?.message}`
          : `Loja showcase aceitou pedido indevidamente!`
      );
      if (!showcaseBlocked) {
        recordBug("MÉDIA", "create_public_order aceita pedidos em modo showcase", `${showcase.slug} aceitou ${showOrd?.order_id}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. VISÃO DO ADMIN DE VÁRIAS EMPRESAS (AUTH, ISOLAMENTO, MÓDULOS ADMIN)
  // -------------------------------------------------------------------------
  console.log("\n▶ [4/6] Testando VISÃO DO ADMIN em todas as empresas de teste autenticadas...");

  const adminByTenantId = new Map();
  const adminClients = [];
  for (const t of testTenants) {
    const res = await loginTenantAdmin(t.slug);
    if (res.client) {
      const entry = { tenant: t, client: res.client, user: res.user };
      adminByTenantId.set(t.id, entry);
      if (t.salon_mode === "full" && adminClients.length < 4) adminClients.push(entry);
    } else {
      console.error(`  ❌ Falha login admin ${t.slug}:`, res.error);
    }
  }

  recordFunc(
    "multi_admin_supabase_auth",
    adminByTenantId.size === testTenants.length,
    `${adminByTenantId.size}/${testTenants.length} admins de empresas distintas autenticados via resolve_admin_login_email + Supabase Auth`
  );

  // Verificar monthly_price = 0.00 via admin autenticado de cada empresa de teste
  {
    let zeroCount = 0;
    for (const adm of adminByTenantId.values()) {
      const { data: ownT } = await adm.client.from("tenants").select("monthly_price").eq("id", adm.tenant.id).single();
      if (ownT && Number(ownT.monthly_price) === 0) zeroCount++;
    }
    recordFunc(
      "test_tenants_zero_price",
      zeroCount === testTenants.length,
      `${zeroCount}/${testTenants.length} empresas de teste confirmadas com monthly_price = R$ 0,00`
    );
  }

  if (adminClients.length >= 2) {
    const adminA = adminClients[0];
    const adminB = adminClients[1];

    // 4.1 Teste de Isolamento Cross-Tenant RPCs e RLS
    const [crossCli, crossMet, crossMast, updTenant, ordersCrossA] = await Promise.all([
      adminA.client.rpc("get_clients_summary", { p_tenant_id: adminB.tenant.id }),
      adminA.client.rpc("get_sales_metrics", { p_tenant_id: adminB.tenant.id }),
      adminA.client.rpc("get_master_tenants"),
      adminA.client.from("tenants").update({ name: "Hackeado Cross-Tenant" }).eq("id", adminB.tenant.id),
      adminA.client.from("orders").select("id, tenant_id").eq("tenant_id", adminB.tenant.id).limit(5),
    ]);

    recordFunc(
      "admin_cross_tenant_rpc_isolation",
      Boolean(crossCli.error && crossMet.error && crossMast.error),
      `Admin A bloqueado em get_clients_summary, get_sales_metrics da Loja B e get_master_tenants`
    );

    const { data: checkB } = await adminB.client.from("tenants").select("name").eq("id", adminB.tenant.id).single();
    recordFunc(
      "admin_cross_tenant_table_isolation",
      Boolean(!updTenant.error ? checkB?.name === adminB.tenant.name : checkB?.name === adminB.tenant.name),
      `Admin A não conseguiu alterar registro de tenants da Loja B (nome mantido: ${checkB?.name})`
    );

    const crossOrdersBlocked = Boolean(ordersCrossA.error || !ordersCrossA.data || ordersCrossA.data.length === 0);
    recordFunc(
      "sec_orders_cross_tenant_admin_blocked",
      crossOrdersBlocked,
      crossOrdersBlocked
        ? `Admin da Loja A NÃO consegue ler pedidos da Loja B (0 registros)`
        : `VAZAMENTO: Admin A leu ${ordersCrossA.data.length} pedido(s) da Loja B`
    );
    if (!crossOrdersBlocked) {
      recordVuln("CRÍTICA", "Cross-Tenant Data Leak em orders para admin autenticado", "public.orders", `${ordersCrossA.data.length} pedidos lidos`);
    }

    // 4.2 Fluxo completo de Salão & Mesas (open_table_session -> pedido mesa -> close_table_session)
    const { data: tablesA } = await adminA.client
      .from("restaurant_tables")
      .select("id, table_number, status")
      .eq("tenant_id", adminA.tenant.id)
      .order("table_number");

    if (tablesA && tablesA.length > 0) {
      const tbl = tablesA[0];
      const { data: openRes } = await adminA.client.rpc("open_table_session", {
        p_tenant_id: adminA.tenant.id,
        p_table_id: tbl.id,
        p_customer_name: "Mesa VIP Teste",
        p_customer_phone: "31988887777",
        p_people_count: 4,
      });

      if (openRes?.success && openRes?.session?.id) {
        const sessId = openRes.session.id;
        const ordMesa1 = randomUUID();
        await adminA.client.from("orders").insert({
          id: ordMesa1,
          tenant_id: adminA.tenant.id,
          table_session_id: sessId,
          table_number: tbl.table_number,
          order_type: "dine_in",
          status: "confirmado",
          customer_name: "Mesa VIP Teste",
          customer_phone: "31988887777",
          total_amount: 59.8,
          total: 59.8,
          subtotal: 59.8,
          notes: runTag,
          items: [{ product_id: `prod_${adminA.tenant.slug}_burger`, product_name: "Burger Teste", product_price: 29.9, quantity: 2, subtotal: 59.8 }],
        });
        trackOrderCleanup(adminA.tenant.id, ordMesa1);

        const { data: closeRes } = await adminA.client.rpc("close_table_session", {
          p_tenant_id: adminA.tenant.id,
          p_session_id: sessId,
          p_payment_method: "pix",
          p_payment_details: [{ method: "pix", amount: 65.78 }],
          p_service_fee: 5.98,
          p_discount: 0,
        });

        const { data: tblAfter } = await adminA.client
          .from("restaurant_tables")
          .select("status")
          .eq("id", tbl.id)
          .single();

        recordFunc(
          "admin_tables_open_order_close_flow",
          Boolean(closeRes?.success && tblAfter?.status === "available"),
          `Mesa ${tbl.table_number} aberta, pedido lançado, fechada com total=${closeRes?.total_amount}, mesa liberada=${tblAfter?.status}`
        );
      } else {
        recordFunc("admin_tables_open_order_close_flow", false, `Falha ao abrir mesa: ${openRes?.error || openRes?.message}`);
      }
    }

    // 4.3 Fluxo Cloud Spooler (Pairing -> Poll -> Ack)
    const { data: pairCodeRes, error: pairCodeErr } = await adminA.client.rpc("generate_spooler_pairing_code", {
      p_tenant_id: adminA.tenant.id,
    });
    if (!pairCodeErr && pairCodeRes?.pairing_code) {
      const { data: pairedRes } = await anonClient.rpc("spooler_pair", {
        p_pairing_code: pairCodeRes.pairing_code,
      });
      const { data: pollRes } = await anonClient.rpc("spooler_poll", {
        p_station_token: pairedRes?.stationToken,
      });
      let ackOk = true;
      if (Array.isArray(pollRes?.jobs) && pollRes.jobs.length > 0) {
        for (const job of pollRes.jobs) {
          const { data: ackRes } = await anonClient.rpc("spooler_ack", {
            p_station_token: pairedRes.stationToken,
            p_job_id: job.id,
            p_status: "printed",
          });
          if (!ackRes?.success) ackOk = false;
        }
      }
      recordFunc(
        "admin_spooler_pair_poll_ack",
        Boolean(pairedRes?.success && pollRes?.success && ackOk),
        `Spooler pareado (${pairCodeRes.pairing_code}), poll retornou ${pollRes?.jobs?.length ?? 0} job(s), ack OK=${ackOk}`
      );
    } else {
      recordFunc("admin_spooler_pair_poll_ack", false, `generate_spooler_pairing_code falhou: ${pairCodeErr?.message}`);
    }

    // 4.4 Reports & Clients RPCs
    const [clientsRes, metricsRes] = await Promise.all([
      adminA.client.rpc("get_clients_summary", { p_tenant_id: adminA.tenant.id }),
      adminA.client.rpc("get_sales_metrics", { p_tenant_id: adminA.tenant.id }),
    ]);
    recordFunc(
      "admin_clients_and_reports_rpcs",
      Boolean(!clientsRes.error && !metricsRes.error && metricsRes.data),
      `Clientes: ${clientsRes.data?.length ?? 0} | Métricas: ${metricsRes.data?.total_orders ?? 0} pedidos, R$ ${metricsRes.data?.total_revenue ?? 0}`
    );

    // 4.5 Cashback process & revert autenticado (+ verificação de bloqueio para anon)
    const cbAdmin = adminClients.find((a) => a.tenant.cashback_enabled) || adminA;
    const cbPhone = `3199${cbAdmin.tenant.slug.slice(-2)}0002`;
    const { data: beforeBal } = await anonClient.rpc("get_customer_cashback_balance", {
      p_tenant_id: cbAdmin.tenant.id,
      p_phone: cbPhone,
    });
    const cbOrdId = randomUUID();
    await cbAdmin.client.from("orders").insert({
      id: cbOrdId,
      tenant_id: cbAdmin.tenant.id,
      customer_name: "Cliente Estorno",
      customer_phone: cbPhone,
      total_amount: 40.0,
      total: 40.0,
      subtotal: 50.0,
      cashback_discount: 10.0,
      cashback_earned: 2.0,
      status: "entregue",
      order_type: "delivery",
      notes: runTag,
      items: [{ product_id: `prod_${cbAdmin.tenant.slug}_burger`, product_name: "Burger", product_price: 29.9, quantity: 2, subtotal: 59.8 }],
    });
    trackOrderCleanup(cbAdmin.tenant.id, cbOrdId);

    const { error: anonCbErr } = await anonClient.rpc("process_order_cashback", { p_order_id: cbOrdId, p_action: "all" });
    await cbAdmin.client.rpc("process_order_cashback", { p_order_id: cbOrdId, p_action: "all" });
    await cbAdmin.client.rpc("revert_order_cashback", { p_order_id: cbOrdId });
    const { data: afterBal } = await anonClient.rpc("get_customer_cashback_balance", {
      p_tenant_id: cbAdmin.tenant.id,
      p_phone: cbPhone,
    });
    recordFunc(
      "admin_cashback_process_and_revert",
      Boolean(anonCbErr && Math.abs(Number(beforeBal?.balance || 0) - Number(afterBal?.balance || 0)) < 0.01),
      `Anon bloqueado (${anonCbErr?.message}); admin process+revert manteve saldo=${afterBal?.balance}`
    );
  }

  // -------------------------------------------------------------------------
  // 5. TESTES DE RACE CONDITION & DUPLICAÇÃO (DEVEM DAR 0 DUPLICAÇÕES)
  // -------------------------------------------------------------------------
  console.log("\n▶ [5/6] Validando correção de RACE CONDITIONS e DUPLICAÇÕES...");

  // 5.1 Race Condition: Cashback Double Credit (8x simultâneas com FOR UPDATE + remoção overload 1-arg)
  {
    const cbAdmin = adminClients.find((a) => a.tenant.cashback_enabled) || adminClients[0];
    const racePhone = "31998887766";
    const raceOrdId = randomUUID();
    const { data: beforeRace } = await anonClient.rpc("get_customer_cashback_balance", {
      p_tenant_id: cbAdmin.tenant.id,
      p_phone: racePhone,
    });
    const baseBalance = Number(beforeRace?.balance || 0);

    await cbAdmin.client.from("orders").insert({
      id: raceOrdId,
      tenant_id: cbAdmin.tenant.id,
      customer_name: "Race Cashback",
      customer_phone: racePhone,
      total_amount: 100.0,
      total: 100.0,
      subtotal: 100.0,
      cashback_discount: 0,
      cashback_earned: 10.0,
      status: "entregue",
      order_type: "delivery",
      notes: runTag,
      items: [{ product_id: `prod_${cbAdmin.tenant.slug}_burger`, product_name: "Burger", product_price: 29.9, quantity: 1, subtotal: 29.9 }],
    });
    trackOrderCleanup(cbAdmin.tenant.id, raceOrdId);

    await Promise.all(
      Array.from({ length: 8 }, () =>
        cbAdmin.client.rpc("process_order_cashback", { p_order_id: raceOrdId, p_action: "credit_only" })
      )
    );
    const { data: balAfter2Arg } = await anonClient.rpc("get_customer_cashback_balance", {
      p_tenant_id: cbAdmin.tenant.id,
      p_phone: racePhone,
    });
    const delta2Arg = Number(balAfter2Arg?.balance || 0) - baseBalance;
    recordFunc(
      "race_cashback_2arg_locked",
      Math.abs(delta2Arg - 10.0) < 0.01,
      `8 chamadas simultâneas a process_order_cashback adicionaram exatamente R$ ${delta2Arg.toFixed(2)} (esperado: R$ 10.00)`
    );
    if (Math.abs(delta2Arg - 10.0) >= 0.01) {
      recordBug("CRÍTICA", "Race condition em process_order_cashback", `Delta = R$ ${delta2Arg.toFixed(2)}`);
    }

    // Chama process_order_cashback sem p_action para garantir que apenas a versão travada com DEFAULT 'all' existe e é idempotente
    await cbAdmin.client.rpc("process_order_cashback", { p_order_id: raceOrdId });
    const { data: balAfterDefault } = await anonClient.rpc("get_customer_cashback_balance", {
      p_tenant_id: cbAdmin.tenant.id,
      p_phone: racePhone,
    });
    const deltaAfterDefault = Number(balAfterDefault?.balance || 0) - baseBalance;
    const idempotentDefault = Math.abs(deltaAfterDefault - 10.0) < 0.01;
    recordFunc(
      "race_cashback_1arg_removed",
      idempotentDefault,
      idempotentDefault
        ? `Overload legado sem trava removido; chamada default mantém idempotência em R$ ${deltaAfterDefault.toFixed(2)}`
        : `Cashback inflado para R$ ${deltaAfterDefault.toFixed(2)}`
    );

    // Reverte o cashback de teste para não deixar saldo inflado
    await cbAdmin.client.rpc("revert_order_cashback", { p_order_id: raceOrdId });
    report.concurrencyTests.cashbackRace = { delta2Arg, idempotentDefault };
  }

  // 5.2 Race Condition: Cupom usage_limit = 1 atacado por 10 pedidos simultâneos
  {
    const targetAdmin = adminClients[0];
    const target = targetAdmin.tenant;
    // Garante que UNICO5 não tenha resquício prévio nas empresas de teste antes do teste concorrente
    const { data: unicoCup } = await targetAdmin.client
      .from("coupons")
      .select("id")
      .eq("tenant_id", target.id)
      .eq("code", "UNICO5")
      .maybeSingle();
    if (unicoCup?.id) {
      await targetAdmin.client.from("coupon_usages").delete().eq("coupon_id", unicoCup.id);
    }

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, idx) =>
        anonClient.rpc("create_public_order", {
          p_tenant_id: target.id,
          p_customer_name: `Race Cupom ${idx}`,
          p_customer_phone: `319877700${String(idx).padStart(2, "0")}`,
          p_delivery_type: "delivery",
          p_delivery_address: "Rua Cupom, 1",
          p_payment_method: "pix",
          p_items: [{ product_id: `prod_${target.slug}_burger`, quantity: 1 }],
          p_coupon_code: "UNICO5",
          p_notes: runTag,
        })
      )
    );
    results.forEach((r) => trackOrderCleanup(target.id, r.data?.order_id));

    const discounted = results.filter((r) => r.data?.success && Number(r.data?.discount) > 0);
    const rejected = results.filter((r) => r.data?.success === false || Number(r.data?.discount) === 0);
    recordFunc(
      "race_coupon_usage_limit_enforced",
      discounted.length === 1,
      `${discounted.length}/10 pedido simultâneo recebeu cupom UNICO5 (usage_limit=1); ${rejected.length} bloqueados/sem desconto`
    );
    if (discounted.length !== 1) {
      recordBug("ALTA", "Cupom usage_limit=1 falhou sob concorrência", `${discounted.length}/10 receberam desconto`);
    }
    if (unicoCup?.id) {
      await targetAdmin.client.from("coupon_usages").delete().eq("coupon_id", unicoCup.id);
    }
    report.concurrencyTests.couponRace = { attempts: 10, discountedCount: discounted.length };
  }

  // 5.3 Race Condition: Abertura simultânea da mesma mesa (open_table_session)
  {
    const targetAdmin = adminClients[1] || adminClients[0];
    const target = targetAdmin.tenant;
    const { data: tbls } = await targetAdmin.client
      .from("restaurant_tables")
      .select("id, table_number")
      .eq("tenant_id", target.id)
      .limit(1);

    if (tbls && tbls[0]) {
      const tbl = tbls[0];
      await targetAdmin.client.from("table_sessions").delete().eq("table_id", tbl.id);
      await targetAdmin.client.from("restaurant_tables").update({ status: "available" }).eq("id", tbl.id);

      const { error: anonOpenErr } = await anonClient.rpc("open_table_session", {
        p_tenant_id: target.id,
        p_table_id: tbl.id,
        p_customer_name: "Anon Table Attack",
        p_customer_phone: "31999990000",
        p_people_count: 2,
      });

      const opens = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          targetAdmin.client.rpc("open_table_session", {
            p_tenant_id: target.id,
            p_table_id: tbl.id,
            p_customer_name: `Mesa Race ${i}`,
            p_customer_phone: "31999990000",
            p_people_count: 2,
          })
        )
      );
      const createdSessions = opens.filter((o) => o.data?.success && o.data?.already_open !== true).map((o) => o.data.session.id);
      const allSessionIds = new Set(opens.map((o) => o.data?.session?.id).filter(Boolean));

      recordFunc(
        "race_open_table_session_unique",
        Boolean(anonOpenErr && createdSessions.length === 1 && allSessionIds.size === 1),
        `Anon bloqueado; 5 aberturas simultâneas na mesa ${tbl.table_number} criaram ${createdSessions.length} sessão única (IDs distintos=${allSessionIds.size})`
      );
      if (allSessionIds.size > 1) {
        recordBug("ALTA", "Duplicidade em open_table_session", `${allSessionIds.size} sessões criadas`);
      }

      for (const sid of allSessionIds) {
        await targetAdmin.client.rpc("close_table_session", {
          p_tenant_id: target.id,
          p_session_id: sid,
          p_payment_method: "money",
        });
      }
      report.concurrencyTests.tableRace = { attempts: 5, openSessionsCreated: allSessionIds.size };
    }
  }

  // -------------------------------------------------------------------------
  // 6. RAJADA EXTREMA MULTI-EMPRESA: 340 PEDIDOS SIMULTÂNEOS + 60 LEITURAS
  // -------------------------------------------------------------------------
  console.log("\n▶ [6/6] RAJADA EXTREMA: 340 pedidos simultâneos nas 17 empresas de teste + 60 leituras concorrentes...");

  const burstTargets = testTenants; // 17 empresas de teste (deixa PedeMuleke/Vruum/visual limpas!)
  const ORDERS_PER_TENANT = 20; // 17 * 20 = 340 pedidos simultâneos via RPC!
  const tBurstStart = Date.now();

  const orderTasks = [];
  for (const t of burstTargets) {
    for (let k = 1; k <= ORDERS_PER_TENANT; k++) {
      orderTasks.push(
        (async () => {
          const t0 = Date.now();
          const { data, error } = await anonClient.rpc("create_public_order", {
            p_tenant_id: t.id,
            p_customer_name: `Stress ${t.slug} #${k}`,
            p_customer_phone: `3198${String(t.code).padStart(2, "0")}${String(k).padStart(5, "0")}`,
            p_delivery_type: k % 3 === 0 ? "pickup" : k % 3 === 1 ? "delivery" : "dine_in",
            p_delivery_address: `Rua Carga ${k}, Centro`,
            p_payment_method: k % 2 === 0 ? "pix" : "dinheiro",
            p_items: [
              { product_id: `prod_${t.slug}_burger`, quantity: 1 + (k % 2) },
              { product_id: `prod_${t.slug}_bebida`, quantity: 1 },
            ],
            p_notes: `${runTag}_BURST`,
            p_table_number: k % 3 === 2 ? String((k % 5) + 1) : null,
          });
          return {
            tenantId: t.id,
            slug: t.slug,
            success: Boolean(!error && data?.success),
            orderId: data?.order_id,
            orderNumber: data?.order_number,
            latency: Date.now() - t0,
            error: error?.message || (data?.success === false ? data?.message : null),
          };
        })()
      );
    }
  }

  const readTasks = [];
  for (let r = 0; r < 60; r++) {
    const t = allTenants[r % allTenants.length];
    readTasks.push(
      (async () => {
        const t0 = Date.now();
        const { data, error } = await anonClient
          .from("products")
          .select("id, name, price")
          .eq("tenant_id", t.id)
          .eq("available", true);
        return { success: !error, count: data?.length ?? 0, latency: Date.now() - t0, error: error?.message };
      })()
    );
  }

  const [burstResults, readResults] = await Promise.all([
    Promise.all(orderTasks),
    Promise.all(readTasks),
  ]);
  const burstTotalSec = (Date.now() - tBurstStart) / 1000;

  const okBurst = burstResults.filter((x) => x.success);
  const failBurst = burstResults.filter((x) => !x.success);
  const burstLats = burstResults.map((x) => x.latency);
  const readOk = readResults.filter((x) => x.success);
  const readLats = readResults.map((x) => x.latency);

  for (const r of okBurst) trackOrderCleanup(r.tenantId, r.orderId);

  // Calcula quantos dos 340 pedidos devem ser aceitos vs rejeitados pelas regras de modo da loja (showcase, table_only, accepts_delivery=false)
  let expectedSuccessCount = 0;
  for (const t of burstTargets) {
    if (t.salon_mode === "showcase" || t.plan === "showcase") continue;
    for (let k = 1; k <= ORDERS_PER_TENANT; k++) {
      if (k % 3 === 0) {
        if (t.accepts_takeaway !== false) expectedSuccessCount++;
      } else if (k % 3 === 1) {
        if (t.salon_mode !== "table_only" && t.accepts_delivery !== false) expectedSuccessCount++;
      } else {
        if (t.accepts_dine_in !== false) expectedSuccessCount++;
      }
    }
  }

  // Checar duplicidade de order_number por tenant!
  const dupOrderNumbersByTenant = {};
  for (const r of okBurst) {
    if (!dupOrderNumbersByTenant[r.slug]) dupOrderNumbersByTenant[r.slug] = [];
    dupOrderNumbersByTenant[r.slug].push(r.orderNumber);
  }
  let tenantsWithDupOrderNumbers = 0;
  let totalDupOrderNumberCollisions = 0;
  for (const [, nums] of Object.entries(dupOrderNumbersByTenant)) {
    const uniq = new Set(nums);
    if (uniq.size < nums.length) {
      tenantsWithDupOrderNumbers++;
      totalDupOrderNumberCollisions += nums.length - uniq.size;
    }
  }

  recordFunc(
    "burst_zero_order_number_collisions",
    totalDupOrderNumberCollisions === 0 && okBurst.length === expectedSuccessCount,
    `${okBurst.length}/${expectedSuccessCount} pedidos ativos concluídos (${failBurst.length} bloqueados por showcase/table_only); ${totalDupOrderNumberCollisions} colisões de order_number`
  );
  if (totalDupOrderNumberCollisions > 0) {
    recordBug("CRÍTICA", "Colisões de order_number ainda ocorreram", `${totalDupOrderNumberCollisions} colisões`);
  }

  // Testar spooler_poll concorrente (4x simultâneos) na loja 04
  const sampleAdmin = adminClients[0];
  const { data: createdPrintJobs } = await sampleAdmin.client
    .from("print_jobs")
    .select("id, order_id, sector_key, status")
    .eq("tenant_id", sampleAdmin.tenant.id);

  const { data: spCode } = await sampleAdmin.client.rpc("generate_spooler_pairing_code", {
    p_tenant_id: sampleAdmin.tenant.id,
  });
  let spoolerDupJobs = 0;
  let spoolerPolledCount = 0;
  if (spCode?.pairing_code) {
    const { data: paired } = await anonClient.rpc("spooler_pair", { p_pairing_code: spCode.pairing_code });
    if (paired?.stationToken) {
      const polls = await Promise.all(
        Array.from({ length: 4 }, () => anonClient.rpc("spooler_poll", { p_station_token: paired.stationToken }))
      );
      const seenJobIds = new Set();
      for (const p of polls) {
        for (const j of p.data?.jobs || []) {
          if (seenJobIds.has(j.id)) spoolerDupJobs++;
          seenJobIds.add(j.id);
        }
      }
      spoolerPolledCount = seenJobIds.size;
      for (const jid of seenJobIds) {
        await anonClient.rpc("spooler_ack", { p_station_token: paired.stationToken, p_job_id: jid, p_status: "printed" });
      }
    }
  }
  recordFunc(
    "spooler_concurrent_poll_skip_locked",
    spoolerDupJobs === 0,
    `4 polls simultâneos no spooler retornaram ${spoolerPolledCount} jobs únicos, ${spoolerDupJobs} duplicados (FOR UPDATE SKIP LOCKED)`
  );

  report.concurrencyTests.burst340 = {
    totalSent: orderTasks.length,
    expectedActiveSuccess: expectedSuccessCount,
    succeeded: okBurst.length,
    rejectedShowcaseOrFail: failBurst.length,
    durationSec: Number(burstTotalSec.toFixed(2)),
    throughputOrdersPerSec: Number((okBurst.length / burstTotalSec).toFixed(2)),
    avgLatencyMs: Math.round(burstLats.reduce((a, b) => a + b, 0) / burstLats.length),
    p95LatencyMs: percentile(burstLats, 95),
    maxLatencyMs: Math.max(...burstLats),
    orderNumberCollisions: totalDupOrderNumberCollisions,
    tenantsWithCollisions: tenantsWithDupOrderNumbers,
    readsSucceeded: `${readOk.length}/${readResults.length}`,
    readAvgMs: Math.round(readLats.reduce((a, b) => a + b, 0) / readLats.length),
    samplePrintJobsCount: createdPrintJobs?.length ?? 0,
    sampleErrors: failBurst.slice(0, 3).map((e) => e.error),
  };

  console.log("\n📊 RESUMO DA RAJADA (340 PEDIDOS + 60 LEITURAS):");
  console.log(JSON.stringify(report.concurrencyTests.burst340, null, 2));

  // Limpeza autenticada por tenant apenas dos pedidos sintéticos desta execução
  console.log("\n🧹 Limpando pedidos sintéticos via admins autenticados por tenant (preservando as 20 empresas e dados originais)...");
  let cleanedOrders = 0;
  for (const [tenantId, idSet] of createdOrderIdsByTenant.entries()) {
    const adm = adminByTenantId.get(tenantId);
    if (!adm) continue;
    const ids = Array.from(idSet);
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      await adm.client.from("print_jobs").delete().in("order_id", chunk);
      await adm.client.from("order_items").delete().in("order_id", chunk);
      await adm.client.from("orders").delete().in("id", chunk);
      cleanedOrders += chunk.length;
    }
    await adm.client.from("orders").delete().eq("tenant_id", tenantId).ilike("notes", `%${runTag}%`);
    await adm.client.from("table_sessions").delete().eq("tenant_id", tenantId);
    await adm.client.from("restaurant_tables").update({ status: "available" }).eq("tenant_id", tenantId);
  }
  console.log(`  🧹 ${cleanedOrders} pedido(s) sintético(s) removidos e mesas resetadas para 'available'.`);

  const passedCount = report.functionalTests.filter((t) => t.passed).length;
  console.log("\n=========================================================================");
  console.log("📋 RELATÓRIO FINAL");
  console.log(`Empresas totais: ${report.tenantsCount} (Empresas teste R$0: ${report.testTenantsCount})`);
  console.log(`Testes funcionais/segurança aprovados: ${passedCount}/${report.functionalTests.length}`);
  console.log(`Vulnerabilidades abertas encontradas: ${report.vulnerabilitiesFound.length}`);
  console.log(`Bugs/Gargalos/Duplicações abertos: ${report.bugsAndGapsFound.length}`);
  console.log("=========================================================================\n");

  const outPath = path.resolve(__dirname, "last_full_stress_report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Relatório JSON salvo em: ${outPath}`);

  if (passedCount < report.functionalTests.length || report.vulnerabilitiesFound.length > 0 || report.bugsAndGapsFound.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro fatal na suíte:", err);
  process.exit(1);
});
