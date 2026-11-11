/**
 * FASE 5 — SEGURANÇA MULTI-TENANT, STORAGE & ENDPOINTS LOCAIS DO SPOOLER
 * Arquivo: tests/phase5_multitenant_security_test.mjs
 * Execução: node tests/phase5_multitenant_security_test.mjs
 *
 * Executa apenas contra empresas fictícias (test-empresa-04 vs test-empresa-05)
 * e subprocesso local do Spooler em porta efêmera isolada (sem testes em terceiros).
 */

import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) return;
    const key = match[1];
    let val = (match[2] || "").trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  });
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

async function loginAdmin(slug) {
  const client = makeClient();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({
      action: "login",
      storeIdentifier: slug,
      username: "admin",
      password: "TestAdmin@2026!",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.session?.access_token) {
    throw new Error(`Falha no login admin (${slug}): ${JSON.stringify(body)}`);
  }
  await client.auth.setSession(body.session);
  return { client, token: body.session.access_token };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function rawHttpRequest({ port, method = "GET", reqPath = "/", headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: reqPath,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function startSpoolerSubprocess({ port, configFile }) {
  const child = spawn(process.execPath, [path.resolve(__dirname, "../desktop-spooler/server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      SPOOLER_CONFIG_FILE: configFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (d) => (logs += d.toString()));
  child.stderr.on("data", (d) => (logs += d.toString()));
  return {
    waitReady: async () => {
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/status`);
          if (res.ok) return await res.json();
        } catch {}
        await sleep(200);
      }
      throw new Error(`Spooler não subiu na porta ${port}: ${logs}`);
    },
    kill: () => {
      try {
        child.kill("SIGKILL");
      } catch {}
    },
  };
}

const results = [];
function assertTest(name, passed, detail) {
  results.push({ name, passed: Boolean(passed), details: detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name} -> ${detail}`);
}

async function main() {
  const anon = makeClient();
  const runTag = `PHASE5_SEC_${Date.now()}`;
  const createdOrdersA = [];
  const tempFiles = [];
  let createdSessionA = null;
  let tableAId = null;
  let uploadedPathA = null;
  let spoolerProc = null;

  const { client: adminA, token: tokenA } = await loginAdmin("test-empresa-04");
  const { client: adminB, token: tokenB } = await loginAdmin("test-empresa-05");

  const [{ data: tenantA }, { data: tenantB }] = await Promise.all([
    adminA.from("tenants").select("id, slug, name").eq("slug", "test-empresa-04").single(),
    adminB.from("tenants").select("id, slug, name").eq("slug", "test-empresa-05").single(),
  ]);

  const { data: prodA } = await adminA
    .from("products")
    .select("id, name, price")
    .eq("tenant_id", tenantA.id)
    .eq("available", true)
    .limit(1)
    .single();

  console.log("=========================================================================");
  console.log("🔐 FASE 5 — AUDITORIA DE SEGURANÇA MULTI-TENANT & STORAGE & SPOOLER");
  console.log(`🏪 Loja A: ${tenantA.slug} (${tenantA.id}) | Loja B: ${tenantB.slug} (${tenantB.id})`);
  console.log("=========================================================================\n");

  try {
    // Seed de pedido, sessão de mesa e carteira na Loja A (para tentativa de invasão da Loja B)
    const { data: ordA } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Alvo Sec Loja A",
      p_customer_phone: "31988885001",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua Segura A, 100",
      p_payment_method: "pix",
      p_items: [{ product_id: prodA.id, quantity: 2 }],
      p_notes: runTag,
    });
    createdOrdersA.push(ordA.order_id);

    const { data: tblA } = await adminA
      .from("restaurant_tables")
      .select("id")
      .eq("tenant_id", tenantA.id)
      .limit(1)
      .maybeSingle();
    if (tblA) {
      tableAId = tblA.id;
      await adminA.from("table_sessions").delete().eq("table_id", tblA.id).in("status", ["open", "bill_requested"]);
      await adminA.from("restaurant_tables").update({ status: "available" }).eq("id", tblA.id);
      const { data: sRes } = await adminA.rpc("open_table_session", {
        p_tenant_id: tenantA.id,
        p_table_id: tblA.id,
        p_customer_name: "Mesa Sec A",
        p_people_count: 2,
      });
      createdSessionA = sRes?.session?.id || null;
    }

    const { data: pjA } = await adminA
      .from("print_jobs")
      .select("id")
      .eq("order_id", ordA.order_id)
      .limit(1)
      .maybeSingle();

    // -----------------------------------------------------------------------
    // 1. Leitura de pedidos e sessões de outro tenant
    // -----------------------------------------------------------------------
    {
      const [{ data: crossOrders }, { data: crossById }, { data: crossItems }, { data: crossJobs }, { data: crossSessions }] =
        await Promise.all([
          adminB.from("orders").select("id").eq("tenant_id", tenantA.id),
          adminB.from("orders").select("id, customer_phone").eq("id", ordA.order_id),
          adminB.from("order_items").select("id").eq("order_id", ordA.order_id),
          adminB.from("print_jobs").select("id").eq("tenant_id", tenantA.id),
          adminB.from("table_sessions").select("id").eq("tenant_id", tenantA.id),
        ]);

      assertTest(
        "1. Leitura cross-tenant de pedidos/itens/print_jobs/mesas bloqueada (0 registros)",
        (crossOrders?.length || 0) === 0 &&
          (crossById?.length || 0) === 0 &&
          (crossItems?.length || 0) === 0 &&
          (crossJobs?.length || 0) === 0 &&
          (crossSessions?.length || 0) === 0,
        `orders=${crossOrders?.length}, byId=${crossById?.length}, items=${crossItems?.length}, jobs=${crossJobs?.length}, sessions=${crossSessions?.length}`
      );
    }

    // -----------------------------------------------------------------------
    // 2. Alteração / remoção / inserção de produtos de outra empresa
    // -----------------------------------------------------------------------
    {
      const origPrice = Number(prodA.price);
      const { error: updErr } = await adminB.from("products").update({ price: 0.01 }).eq("id", prodA.id);
      const { error: delErr } = await adminB.from("products").delete().eq("id", prodA.id);
      const { error: insErr } = await adminB.from("products").insert({
        id: `prod_forged_${Date.now()}`,
        tenant_id: tenantA.id,
        name: "Produto Injetado B->A",
        price: 1.0,
        available: true,
      });

      const { data: verifyProdA } = await adminA.from("products").select("price").eq("id", prodA.id).single();

      assertTest(
        "2. Alteração, exclusão e injeção de produto cross-tenant bloqueadas",
        Number(verifyProdA?.price) === origPrice && Boolean(insErr) && (!updErr ? Number(verifyProdA?.price) === origPrice : true),
        `pricePreserved=R$${verifyProdA?.price}, insBlocked=${Boolean(insErr)}, delErr=${Boolean(delErr)}`
      );
    }

    // -----------------------------------------------------------------------
    // 3. Acesso indevido a cashback e cupons de outro tenant
    // -----------------------------------------------------------------------
    {
      const [{ data: crossWallets }, { error: cbProcErr }, { error: cbRevErr }, { error: cpnInsErr }] = await Promise.all([
        adminB.from("customer_cashback_wallets").select("id, balance").eq("tenant_id", tenantA.id),
        adminB.rpc("process_order_cashback", { p_order_id: ordA.order_id, p_action: "all" }),
        adminB.rpc("revert_order_cashback", { p_order_id: ordA.order_id }),
        adminB.from("coupons").insert({
          id: `cpn_forge_${Date.now()}`,
          tenant_id: tenantA.id,
          code: "FORGE99",
          discount_type: "percentage",
          discount_value: 99,
          active: true,
        }),
      ]);

      // Cria cupom exclusivo na Loja A e tenta aplicá-lo em um pedido da Loja B -> deve ser inválido na Loja B
      const exclusiveCode = `ONLYA_${Date.now()}`;
      const exclusiveCpnId = `cpn_only_a_${Date.now()}`;
      await adminA.from("coupons").insert({
        id: exclusiveCpnId,
        tenant_id: tenantA.id,
        code: exclusiveCode,
        discount_type: "percentage",
        discount_value: 20,
        active: true,
      });

      const { data: crossCouponUse } = await anon.rpc("create_public_order", {
        p_tenant_id: tenantB.id,
        p_customer_name: "Cross Coupon Probe",
        p_customer_phone: "31988885002",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua B, 2",
        p_payment_method: "pix",
        p_items: [{ product_id: `prod_${tenantB.slug}_burger`, quantity: 1 }],
        p_coupon_code: exclusiveCode,
      });

      await adminA.from("coupons").delete().eq("id", exclusiveCpnId);

      assertTest(
        "3. Acesso cross-tenant a cashback, RPCs de bônus e cupons bloqueado",
        (crossWallets?.length || 0) === 0 &&
          Boolean(cbProcErr) &&
          Boolean(cbRevErr) &&
          Boolean(cpnInsErr) &&
          crossCouponUse?.success === false,
        `wallets=${crossWallets?.length}, procBlocked=${Boolean(cbProcErr)}, revBlocked=${Boolean(cbRevErr)}, cpnForgeBlocked=${Boolean(cpnInsErr)}, crossCpnBlocked=${crossCouponUse?.success === false}`
      );
    }

    // -----------------------------------------------------------------------
    // 4. Manipulação direta de tenant_id em tabelas administrativas
    // -----------------------------------------------------------------------
    {
      const [{ error: ordForgeErr }, { error: secForgeErr }, { error: tblForgeErr }] = await Promise.all([
        adminB.from("orders").insert({
          id: `ord_forge_${Date.now()}`,
          tenant_id: tenantA.id,
          customer_name: "Forjado",
          customer_phone: "31999990000",
          total: 1,
          total_amount: 1,
          status: "pendente",
          items: [],
        }),
        adminB.from("production_sectors").insert({
          tenant_id: tenantA.id,
          name: "Setor Forjado",
        }),
        adminB.from("restaurant_tables").insert({
          tenant_id: tenantA.id,
          table_number: "999",
        }),
      ]);

      assertTest(
        "4. Manipulação de tenant_id via INSERT em orders/setores/mesas bloqueada por RLS",
        Boolean(ordForgeErr) && Boolean(secForgeErr) && Boolean(tblForgeErr),
        `ordForge=${Boolean(ordForgeErr)}, secForge=${Boolean(secForgeErr)}, tblForge=${Boolean(tblForgeErr)}`
      );
    }

    // -----------------------------------------------------------------------
    // 5. Tentativas de acesso por identificadores conhecidos (IDOR / Token mismatch)
    // -----------------------------------------------------------------------
    {
      const fakeToken = crypto.randomUUID();
      const { data: badTrack } = await anon.rpc("get_order_by_tracking_token", {
        p_order_id: ordA.order_id,
        p_tracking_token: fakeToken,
      });
      const { error: partPayErr } = createdSessionA
        ? await adminB.rpc("add_table_session_partial_payment", {
            p_session_id: createdSessionA,
            p_payment: { id: "idor_pay", method: "pix", amount: 10 },
          })
        : { error: new Error("skipped_no_session") };

      // Spooler Station Token da Loja B tentando dar ACK em job conhecido da Loja A
      const { data: pairB } = await adminB.rpc("generate_spooler_pairing_code", { p_tenant_id: tenantB.id });
      const { data: pairedB } = await anon.rpc("spooler_pair", { p_pairing_code: pairB.pairing_code });
      const { data: crossAck } = pjA?.id
        ? await anon.rpc("spooler_ack", {
            p_station_token: pairedB.stationToken,
            p_job_id: pjA.id,
            p_status: "printed",
          })
        : { data: { success: false } };

      assertTest(
        "5. IDOR por identificadores conhecidos (tracking_token falso, sessionA por B, spooler_ack cross-tenant) bloqueados",
        (!badTrack || badTrack.length === 0 || badTrack.success === false) &&
          Boolean(partPayErr) &&
          crossAck?.success === false,
        `badTrack=${JSON.stringify(badTrack)}, sessionBlocked=${Boolean(partPayErr)}, crossAck=${JSON.stringify(crossAck)}`
      );
    }

    // -----------------------------------------------------------------------
    // 6. Permissões administrativas (SuperAdmin e cross-tenant RPCs)
    // -----------------------------------------------------------------------
    {
      const [mTenants, tStatus, dTenant, updSet, updPm, updDrv, pairCross, cUser] = await Promise.all([
        adminA.rpc("get_master_tenants"),
        adminA.rpc("toggle_tenant_status", { p_tenant_id: tenantB.id, p_is_active: false }),
        adminA.rpc("delete_tenant", { p_tenant_id: tenantB.id }),
        adminB.rpc("update_tenant_settings", { p_tenant_id: tenantA.id, p_data: { name: "Hacked" } }),
        adminB.rpc("update_tenant_payment_methods", { p_tenant_id: tenantA.id, p_payment_methods: { accept_cash: false } }),
        adminB.rpc("update_tenant_delivery_drivers", { p_tenant_id: tenantA.id, p_drivers: [] }),
        adminB.rpc("generate_spooler_pairing_code", { p_tenant_id: tenantA.id }),
        adminB.rpc("create_store_admin_user", {
          p_tenant_id: tenantA.id,
          p_username: `hack_${Date.now()}`,
          p_password: "Password123!",
          p_role: "admin",
          p_permissions: [],
        }),
      ]);

      const allBlocked = [mTenants, tStatus, dTenant, updSet, updPm, updDrv, pairCross, cUser].every((r) => Boolean(r.error));

      assertTest(
        "6. Privilégios SuperAdmin e RPCs administrativas cross-tenant integralmente bloqueados",
        allBlocked,
        `blockedCount=${[mTenants, tStatus, dTenant, updSet, updPm, updDrv, pairCross, cUser].filter((r) => Boolean(r.error)).length}/8`
      );
    }

    // -----------------------------------------------------------------------
    // 7. Segurança das Edge Functions (mercadopago, asaas, r2-upload, admin-login)
    // -----------------------------------------------------------------------
    {
      const callEdge = async (fn, body, authToken = SUPABASE_ANON_KEY, method = "POST") => {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: method === "GET" ? undefined : JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        return { status: res.status, json };
      };

      const [mpCredAnon, mpRefCross, asaasAnon, asaasSubCross, asaasBadWebhook, r2Cross, loginSuperProbe] = await Promise.all([
        callEdge("mercadopago", { action: "test_credentials", accessToken: "TEST-123" }, SUPABASE_ANON_KEY),
        callEdge("mercadopago", { action: "refund_payment", paymentId: "123456", tenantId: tenantA.id }, tokenB),
        callEdge("asaas", { action: "create_customer_and_subscription", name: "Hack", monthlyPrice: 100 }, SUPABASE_ANON_KEY),
        callEdge("asaas", { action: "get_subscription", subscriptionId: "sub_forged_123" }, tokenB),
        callEdge("asaas", { event: "PAYMENT_RECEIVED", payment: { id: "pay_1", customer: "cus_1" } }, SUPABASE_ANON_KEY),
        callEdge("r2-upload", { tenantId: tenantA.id, fileName: "hack.webp", dataUrl: "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=" }, tokenB),
        callEdge("admin-login", { action: "login", storeIdentifier: "superadmin", username: "admin", password: "TestAdmin@2026!" }, SUPABASE_ANON_KEY),
      ]);

      assertTest(
        "7. Edge Functions (mercadopago, asaas, r2-upload, admin-login) bloqueiam anônimo/cross-tenant/elevação",
        mpCredAnon.status === 401 &&
          mpRefCross.status === 403 &&
          asaasAnon.status === 401 &&
          [400, 403].includes(asaasSubCross.status) &&
          asaasBadWebhook.status === 401 &&
          r2Cross.status === 403 &&
          loginSuperProbe.status === 401,
        `mpAnon=${mpCredAnon.status}, mpCross=${mpRefCross.status}, asaasAnon=${asaasAnon.status}, asaasCross=${asaasSubCross.status}, asaasWh=${asaasBadWebhook.status}, r2Cross=${r2Cross.status}, superProbe=${loginSuperProbe.status}`
      );
    }

    // -----------------------------------------------------------------------
    // 8. Acesso a arquivos do Storage (restaurant-images isolado + anti-SVG)
    // -----------------------------------------------------------------------
    {
      const tinyWebp = Buffer.from("UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=", "base64");
      const tinySvg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
      const pathA = `tenants/${tenantA.id}/uploads/phase5_sec_${Date.now()}.webp`;
      const hijackPath = `tenants/${tenantA.id}/uploads/phase5_hijack_${Date.now()}.webp`;
      const svgPathB = `tenants/${tenantB.id}/uploads/phase5_xss_${Date.now()}.svg`;

      // A) Anônimo tentando fazer upload
      const { error: anonUpErr } = await anon.storage
        .from("restaurant-images")
        .upload(`tenants/${tenantA.id}/uploads/anon_${Date.now()}.webp`, tinyWebp, { contentType: "image/webp" });

      // B) Admin B tentando subir .svg (Stored XSS) na própria pasta
      const { error: svgErr } = await adminB.storage
        .from("restaurant-images")
        .upload(svgPathB, tinySvg, { contentType: "image/svg+xml" });

      // C) Admin B tentando subir imagem dentro da pasta da Loja A
      const { error: crossUpErr } = await adminB.storage
        .from("restaurant-images")
        .upload(hijackPath, tinyWebp, { contentType: "image/webp" });

      // D) Admin A sobe imagem legítima na própria pasta -> Admin B tenta sobrescrever e deletar
      const { data: ownUpData, error: ownUpErr } = await adminA.storage
        .from("restaurant-images")
        .upload(pathA, tinyWebp, { contentType: "image/webp" });
      if (!ownUpErr && ownUpData?.path) uploadedPathA = ownUpData.path;

      const { error: crossOverErr } = await adminB.storage
        .from("restaurant-images")
        .upload(pathA, tinyWebp, { contentType: "image/webp", upsert: true });

      await adminB.storage.from("restaurant-images").remove([pathA]);
      // Verifica que o arquivo de A continua íntegro no bucket após tentativa de DELETE de B
      const { data: listAfterDelAttempt } = await adminA.storage
        .from("restaurant-images")
        .list(`tenants/${tenantA.id}/uploads`, { search: path.basename(pathA) });
      const fileStillExists = (listAfterDelAttempt || []).some((f) => f.name === path.basename(pathA));

      assertTest(
        "8. Storage multi-tenant: bloqueia anônimo, bloqueia SVG, bloqueia upload/overwrite/delete cross-tenant",
        Boolean(anonUpErr) &&
          Boolean(svgErr) &&
          Boolean(crossUpErr) &&
          !ownUpErr &&
          Boolean(crossOverErr) &&
          fileStillExists,
        `anonUp=${Boolean(anonUpErr)}, svgBlocked=${Boolean(svgErr)}, crossUp=${Boolean(crossUpErr)}, ownUp=${!ownUpErr}, crossOverwrite=${Boolean(crossOverErr)}, survivedDelAttempt=${fileStillExists}`
      );
    }

    // -----------------------------------------------------------------------
    // 9 & 10. Segurança dos endpoints locais do Spooler & chamadas localhost
    // -----------------------------------------------------------------------
    {
      const tmpCfg = path.join(os.tmpdir(), `pm_p5_sec_spooler_${Date.now()}.json`);
      tempFiles.push(tmpCfg);
      const secPort = 19500 + Math.floor(Math.random() * 400);
      const spoolSecret = "tok_sec_phase5_998877";

      fs.writeFileSync(
        tmpCfg,
        JSON.stringify({
          selectedPrinter: "PRINTER_NONE",
          paperWidth: "80mm",
          authToken: spoolSecret,
          stationToken: "secret_station_token_should_never_leak",
        }),
        "utf-8"
      );

      spoolerProc = startSpoolerSubprocess({ port: secPort, configFile: tmpCfg });
      const st = await spoolerProc.waitReady();

      const [evilOriginGet, pagesDevOriginPost, dnsRebindReq, csrfFormReq, noAuthPrint, wrongAuthPair, noAuthTest, validStatus] =
        await Promise.all([
          rawHttpRequest({ port: secPort, method: "GET", reqPath: "/printers", headers: { Origin: "https://evil-attacker.com" } }),
          rawHttpRequest({
            port: secPort,
            method: "POST",
            reqPath: "/print",
            headers: { Origin: "https://evil.pages.dev", "Content-Type": "application/json", "X-Spooler-Token": spoolSecret },
            body: JSON.stringify({ rawText: "x" }),
          }),
          rawHttpRequest({ port: secPort, method: "GET", reqPath: "/status", headers: { Host: "evil-rebind.com:19500" } }),
          rawHttpRequest({
            port: secPort,
            method: "POST",
            reqPath: "/print",
            headers: { "Content-Type": "text/plain", "X-Spooler-Token": spoolSecret },
            body: "raw=csrf",
          }),
          rawHttpRequest({
            port: secPort,
            method: "POST",
            reqPath: "/print",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rawText: "unauth" }),
          }),
          rawHttpRequest({
            port: secPort,
            method: "POST",
            reqPath: "/cloud/pair",
            headers: { "Content-Type": "application/json", "X-Spooler-Token": "wrong_tok" },
            body: JSON.stringify({ pairingCode: "PM-123" }),
          }),
          rawHttpRequest({
            port: secPort,
            method: "POST",
            reqPath: "/test",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          }),
          rawHttpRequest({ port: secPort, method: "GET", reqPath: "/status" }),
        ]);

      const statusLeaksSecret =
        JSON.stringify(validStatus.json || {}).includes("secret_station_token_should_never_leak") ||
        JSON.stringify(validStatus.json || {}).includes(spoolSecret);

      spoolerProc.kill();
      spoolerProc = null;

      assertTest(
        "9 & 10. Endpoints locais do Spooler bloqueiam Origin maliciosa, wildcard pages.dev, DNS rebinding, CSRF text/plain e POST sem token",
        st.status === "online" &&
          evilOriginGet.status === 403 &&
          pagesDevOriginPost.status === 403 &&
          dnsRebindReq.status === 403 &&
          csrfFormReq.status === 415 &&
          noAuthPrint.status === 401 &&
          wrongAuthPair.status === 401 &&
          noAuthTest.status === 401 &&
          !statusLeaksSecret,
        `evilOrig=${evilOriginGet.status}, pagesDev=${pagesDevOriginPost.status}, dnsRebind=${dnsRebindReq.status}, csrf=${csrfFormReq.status}, noTok=${noAuthPrint.status}, wrongPair=${wrongAuthPair.status}, noAuthTest=${noAuthTest.status}, leaksSecret=${statusLeaksSecret}`
      );
    }
  } finally {
    if (spoolerProc) spoolerProc.kill();
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
    if (uploadedPathA) {
      await adminA.storage.from("restaurant-images").remove([uploadedPathA]).catch(() => {});
    }
    if (createdSessionA) {
      await adminA.from("table_sessions").delete().eq("id", createdSessionA);
    }
    if (tableAId) {
      await adminA.from("restaurant_tables").update({ status: "available" }).eq("id", tableAId);
    }
    for (let i = 0; i < createdOrdersA.length; i += 50) {
      const chunk = createdOrdersA.slice(i, i + 50);
      await adminA.from("print_jobs").delete().in("order_id", chunk);
      await adminA.from("order_items").delete().in("order_id", chunk);
      await adminA.from("orders").delete().in("id", chunk);
    }
    await adminA.from("orders").delete().eq("tenant_id", tenantA.id).eq("notes", runTag);
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n=== RESUMO FASE 5 SEGURANÇA MULTI-TENANT: ${passed}/${results.length} aprovados ===`);
  if (passed !== results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro fatal na Fase 5:", err);
  process.exit(1);
});
