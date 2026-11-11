import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const MP_URL = `${SUPABASE_URL}/functions/v1/mercadopago`;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
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
  const body = await res.json();
  if (!res.ok || !body?.session?.access_token) {
    throw new Error(`Admin login failed for ${slug}: ${JSON.stringify(body)}`);
  }
  await client.auth.setSession(body.session);
  return { client, token: body.session.access_token };
}

const results = [];
function assertTest(name, condition, details) {
  results.push({ name, passed: Boolean(condition), details });
  const badge = condition ? "PASS" : "FAIL";
  console.log(`[${badge}] ${name} -> ${details}`);
}

async function main() {
  const anon = makeClient();
  const { client: adminA, token: tokenA } = await loginAdmin("test-empresa-04");
  const { token: tokenB } = await loginAdmin("test-empresa-05");

  const { data: tenantA, error: tenantErr } = await adminA
    .from("tenants")
    .select("id, slug, payment_methods")
    .eq("slug", "test-empresa-04")
    .single();
  if (tenantErr || !tenantA) throw new Error(`Tenant A lookup failed: ${tenantErr?.message}`);

  const createdOrderIds = [];

  try {
    // Seed 2 synthetic orders on isolated test tenant (test-empresa-04) via create_public_order
    const { data: ord1Res, error: ord1Err } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Audit Payment Test 1",
      p_customer_phone: "31999997701",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua Teste Pagamento, 100",
      p_payment_method: "pix",
      p_items: [{ product_id: `prod_${tenantA.slug}_burger`, quantity: 1 }],
    });
    if (ord1Err || !ord1Res?.order_id) {
      throw new Error(`Failed creating synthetic order 1: ${ord1Err?.message || JSON.stringify(ord1Res)}`);
    }
    const order1Id = ord1Res.order_id;
    const order1Token = ord1Res.tracking_token;
    createdOrderIds.push(order1Id);

    const { data: ord2Res, error: ord2Err } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Audit Payment Test 2",
      p_customer_phone: "31999997702",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua Teste Pagamento, 200",
      p_payment_method: "pix",
      p_items: [{ product_id: `prod_${tenantA.slug}_burger`, quantity: 1 }],
    });
    if (ord2Err || !ord2Res?.order_id) {
      throw new Error(`Failed creating synthetic order 2: ${ord2Err?.message || JSON.stringify(ord2Res)}`);
    }
    const order2Id = ord2Res.order_id;
    const order2Token = ord2Res.tracking_token;
    createdOrderIds.push(order2Id);

    // Put order1 and order2 in aguardando_pagamento / pending for payment-integrity tests
    const { error: updErr } = await adminA
      .from("orders")
      .update({ mp_payment_id: "999888777", status: "aguardando_pagamento", payment_status: "pending", payment_method: "pix_online" })
      .eq("id", order1Id);
    if (updErr) throw new Error(`Failed updating order1 mp_payment_id: ${updErr.message}`);
    await adminA
      .from("orders")
      .update({ status: "aguardando_pagamento", payment_status: "pending", payment_method: "pix_online" })
      .eq("id", order2Id);

    // TEST 1a: Attacker injects body.accessToken on create_pix_payment
    const r1a = await fetch(MP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_pix_payment",
        accessToken: "APP_USR-attacker-forged-token",
        orderId: order1Id,
        payerEmail: "attacker@gmail.com",
        payerName: "Attacker",
      }),
    });
    const b1a = await r1a.json();
    assertTest(
      "1a. create_pix_payment ignores body.accessToken",
      r1a.status === 400 && String(b1a.error || "").includes("não possui Access Token"),
      `status=${r1a.status}, error=${b1a.error}`
    );

    // TEST 1b: Attacker injects body.accessToken on check_payment_status
    const r1b = await fetch(MP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "check_payment_status",
        accessToken: "APP_USR-attacker-forged-token",
        paymentId: "999888777",
        orderId: order1Id,
      }),
    });
    const b1b = await r1b.json();
    const { data: ord1Check1 } = await adminA
      .from("orders")
      .select("status, payment_status")
      .eq("id", order1Id)
      .single();
    assertTest(
      "1b. check_payment_status ignores body.accessToken",
      r1b.status === 400 && b1b.isApproved !== true && ord1Check1.payment_status === "pending",
      `status=${r1b.status}, order_payment_status=${ord1Check1.payment_status}, error=${b1b.error}`
    );

    // TEST 2a: Cross-order paymentId replay (mismatch against order1.mp_payment_id)
    const r2a = await fetch(MP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "check_payment_status",
        paymentId: "111222333",
        orderId: order1Id,
      }),
    });
    const b2a = await r2a.json();
    assertTest(
      "2a. check_payment_status rejects mismatched paymentId (422)",
      r2a.status === 422 && b2a.status === "payment_mismatch" && b2a.isApproved === false,
      `status=${r2a.status}, payload_status=${b2a.status}`
    );

    // TEST 2b: Cross-order replay against order2 which has mp_payment_id = null
    const r2b = await fetch(MP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "check_payment_status",
        paymentId: "999888777",
        orderId: order2Id,
      }),
    });
    const b2b = await r2b.json();
    assertTest(
      "2b. check_payment_status rejects replay when order has no mp_payment_id (422)",
      r2b.status === 422 && b2b.status === "payment_mismatch" && b2b.isApproved === false,
      `status=${r2b.status}, payload_status=${b2b.status}`
    );

    // TEST 3a: Webhook notification with mismatched paymentId against orderId hint
    const r3a = await fetch(`${MP_URL}?action=webhook&orderId=${encodeURIComponent(order1Id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: "555666777" } }),
    });
    const b3a = await r3a.json();
    assertTest(
      "3a. Webhook rejects mismatched paymentId for orderId (422)",
      r3a.status === 422 && String(b3a.error || "").includes("divergente"),
      `status=${r3a.status}, error=${b3a.error}`
    );

    // TEST 3b: Webhook notification for matching order without store MP token stays safe
    const r3b = await fetch(`${MP_URL}?action=webhook&orderId=${encodeURIComponent(order1Id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: "999888777" } }),
    });
    const b3b = await r3b.json();
    assertTest(
      "3b. Webhook cleanly ignores store without MP token and never auto-pays",
      r3b.status === 200 && b3b.ignored === "missing_store_token",
      `status=${r3b.status}, body=${JSON.stringify(b3b)}`
    );

    // TEST 3c: Webhook notification for unknown mp_payment_id returns matched:false
    const r3c = await fetch(`${MP_URL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: "444333222111" } }),
    });
    const b3c = await r3c.json();
    assertTest(
      "3c. Webhook for unknown paymentId returns matched:false",
      r3c.status === 200 && b3c.matched === false,
      `status=${r3c.status}, body=${JSON.stringify(b3c)}`
    );

    // TEST 4a: convert_pix_order_to_delivery works when unpaid (aguardando_pagamento)
    const { data: convOk } = await anon.rpc("convert_pix_order_to_delivery", {
      p_order_id: order2Id,
      p_tracking_token: order2Token,
      p_payment_method: "card_delivery",
    });
    assertTest(
      "4a. convert_pix_order_to_delivery converts unpaid order",
      convOk?.success === true && convOk?.payment_status === "pending_delivery",
      JSON.stringify(convOk)
    );

    // TEST 4b: Mark order1 paid + create_pix_payment blocked (409) + convert_pix_order_to_delivery blocked
    await adminA
      .from("orders")
      .update({ payment_status: "paid", status: "pendente" })
      .eq("id", order1Id);

    const r4bCreate = await fetch(MP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_pix_payment", orderId: order1Id }),
    });
    assertTest(
      "4b. create_pix_payment blocks already-paid order (409)",
      r4bCreate.status === 409,
      `status=${r4bCreate.status}`
    );

    const { data: convPaid } = await anon.rpc("convert_pix_order_to_delivery", {
      p_order_id: order1Id,
      p_tracking_token: order1Token,
      p_payment_method: "card_delivery",
    });
    const { data: ord1AfterConv } = await adminA
      .from("orders")
      .select("payment_status, status")
      .eq("id", order1Id)
      .single();
    assertTest(
      "4c. convert_pix_order_to_delivery blocks already-paid order (keeps paid)",
      convPaid?.success === false && ord1AfterConv?.payment_status === "paid",
      `rpc=${JSON.stringify(convPaid)}, db_payment_status=${ord1AfterConv?.payment_status}`
    );

    // TEST 5a: refund_payment requires admin JWT (unauthenticated -> 401)
    const r5a = await fetch(MP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refund_payment", paymentId: "999888777", orderId: order1Id }),
    });
    assertTest("5a. refund_payment rejects unauthenticated request (401)", r5a.status === 401, `status=${r5a.status}`);

    // TEST 5b: refund_payment rejects cross-tenant admin B (403)
    const r5b = await fetch(MP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ action: "refund_payment", paymentId: "999888777", orderId: order1Id }),
    });
    assertTest("5b. refund_payment rejects cross-tenant admin (403)", r5b.status === 403, `status=${r5b.status}`);

    // TEST 5c: refund_payment rejects paymentId mismatch for order1 (422)
    const r5c = await fetch(MP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ action: "refund_payment", paymentId: "111000999", orderId: order1Id }),
    });
    assertTest("5c. refund_payment rejects mismatched paymentId (422)", r5c.status === 422, `status=${r5c.status}`);

    // TEST 5d: refund_payment idempotency when pix_refund_status is already 'refunded'
    await adminA
      .from("orders")
      .update({ pix_refund_status: "refunded", pix_refund_id: "sim_ref_123", pix_refund_amount: 29.9 })
      .eq("id", order1Id);

    const r5d = await fetch(MP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        action: "refund_payment",
        paymentId: "999888777",
        orderId: order1Id,
        idempotencyKey: `refund_${order1Id}_999888777_29.90`,
      }),
    });
    const b5d = await r5d.json();
    assertTest(
      "5d. refund_payment is idempotent when already refunded",
      r5d.status === 200 && b5d.alreadyRefunded === true && b5d.refundId === "sim_ref_123",
      JSON.stringify(b5d)
    );
  } finally {
    if (createdOrderIds.length > 0) {
      await adminA.from("print_jobs").delete().in("order_id", createdOrderIds);
      await adminA.from("order_items").delete().in("order_id", createdOrderIds);
      await adminA.from("orders").delete().in("id", createdOrderIds);
      console.log(`Cleaned up ${createdOrderIds.length} synthetic payment-test order(s).`);
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\nSUMMARY: ${passedCount}/${results.length} payment integrity tests passed.`);
  if (passedCount !== results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

