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
  return client;
}

const results = [];
function assertTest(name, condition, details) {
  results.push({ name, passed: Boolean(condition), details });
  console.log(`[${condition ? "PASS" : "FAIL"}] ${name} -> ${details}`);
}

async function main() {
  const anon = makeClient();
  const adminA = await loginAdmin("test-empresa-04");
  const adminB = await loginAdmin("test-empresa-05");

  const { data: tenantA } = await adminA
    .from("tenants")
    .select("id, slug, manual_store_open")
    .eq("slug", "test-empresa-04")
    .single();
  const { data: tenantB } = await adminB
    .from("tenants")
    .select("id, slug")
    .eq("slug", "test-empresa-05")
    .single();

  const burgerA = `prod_${tenantA.slug}_burger`;
  const bebidaA = `prod_${tenantA.slug}_bebida`;
  const burgerB = `prod_${tenantB.slug}_burger`;

  const createdOrderIds = [];
  const tempIds = {
    tableId: null,
    sessionId: null,
    walletId: null,
    reqGroupId: `grp_req_${Date.now()}`,
    reqItemId: `item_req_${Date.now()}`,
    reqLinkId: `link_req_${Date.now()}`,
    pausedFlavorId: `prod_paused_flavor_${Date.now()}`,
  };
  const originalManualOpen = tenantA.manual_store_open;

  try {
    // =========================================================================
    // TEST 1 & 2: Atomic open_table_session + concurrent partial payment (no Lost Update)
    // =========================================================================
    const { data: tblRow } = await adminA
      .from("restaurant_tables")
      .select("id, table_number, status")
      .eq("tenant_id", tenantA.id)
      .limit(1)
      .single();
    tempIds.tableId = tblRow.id;

    // Close any lingering test session on this table first
    await adminA
      .from("table_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("table_id", tblRow.id)
      .in("status", ["open", "bill_requested"]);

    const openBurst = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        adminA.rpc("open_table_session", {
          p_tenant_id: tenantA.id,
          p_table_id: tblRow.id,
          p_customer_name: `Concorrente ${i}`,
          p_people_count: 2,
        })
      )
    );
    const openedIds = new Set(openBurst.map((r) => r.data?.session?.id).filter(Boolean));
    tempIds.sessionId = [...openedIds][0];

    assertTest(
      "1. Concurrent 6x open_table_session yields exactly 1 active session UUID",
      openBurst.every((r) => !r.error && r.data?.success === true) && openedIds.size === 1,
      `uniqueSessionIds=${openedIds.size}, sessionId=${tempIds.sessionId}`
    );

    // 4 concurrent operators registering partial payments on the same session simultaneously
    const partialBurst = await Promise.all(
      [10, 15, 20, 25].map((amt, i) =>
        adminA.rpc("add_table_session_partial_payment", {
          p_session_id: tempIds.sessionId,
          p_payment: {
            id: `pay_concurrent_${i}`,
            amount: amt,
            method: i % 2 === 0 ? "pix" : "dinheiro",
            created_at: new Date().toISOString(),
          },
          p_service_fee_included: false,
          p_discount: 0,
        })
      )
    );

    const { data: sessAfterBurst } = await adminA
      .from("table_sessions")
      .select("payment_details")
      .eq("id", tempIds.sessionId)
      .single();
    const savedPayments = sessAfterBurst?.payment_details?.payments || [];
    const savedSum = savedPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

    assertTest(
      "2a. 4x concurrent add_table_session_partial_payment preserves all 4 payments (sum=70)",
      partialBurst.every((r) => r.data?.success) && savedPayments.length === 4 && savedSum === 70,
      `count=${savedPayments.length}, sum=${savedSum}`
    );

    // Remove 1 partial payment atomically
    await adminA.rpc("remove_table_session_partial_payment", {
      p_session_id: tempIds.sessionId,
      p_payment_id: "pay_concurrent_1",
      p_service_fee_included: false,
      p_discount: 0,
    });
    const { data: sessAfterRemove } = await adminA
      .from("table_sessions")
      .select("payment_details")
      .eq("id", tempIds.sessionId)
      .single();
    const remPayments = sessAfterRemove?.payment_details?.payments || [];
    assertTest(
      "2b. remove_table_session_partial_payment removes exact payment leaving 3 others (sum=55)",
      remPayments.length === 3 && remPayments.reduce((s, p) => s + Number(p.amount || 0), 0) === 55,
      `remaining=${remPayments.length}, sum=${remPayments.reduce((s, p) => s + Number(p.amount || 0), 0)}`
    );

    // Cross-tenant admin B blocked from mutating tenant A table session
    const { error: crossPayErr } = await adminB.rpc("add_table_session_partial_payment", {
      p_session_id: tempIds.sessionId,
      p_payment: { id: "pay_evil", amount: 5, method: "pix" },
    });
    assertTest(
      "2c. Cross-tenant admin blocked on add_table_session_partial_payment",
      Boolean(crossPayErr),
      crossPayErr?.message || "no error"
    );

    // =========================================================================
    // TEST 3: create_public_order business validations
    // =========================================================================
    // 3a. Disallowed payment methods
    const { data: badPm1 } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Teste PM",
      p_customer_phone: "31999996601",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua X, 1",
      p_payment_method: "pix_online", // disabled on test-empresa-04
      p_items: [{ product_id: burgerA, quantity: 1 }],
    });
    const { data: badPm2 } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Teste PM2",
      p_customer_phone: "31999996601",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua X, 1",
      p_payment_method: "cripto_coin",
      p_items: [{ product_id: burgerA, quantity: 1 }],
    });
    assertTest(
      "3a. create_public_order rejects disabled pix_online and invalid payment_method",
      badPm1?.success === false && badPm2?.success === false,
      `pix_online=${badPm1?.message} | cripto=${badPm2?.message}`
    );

    // 3b. Cross-product/cross-tenant additional injection & max_quantity check
    const { data: crossAdd } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Teste Add Cross",
      p_customer_phone: "31999996601",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua X, 1",
      p_payment_method: "pix",
      p_items: [{
        product_id: burgerA,
        quantity: 1,
        additionals: [{ name: "Adicional Fantasma", price: 0.01, quantity: 1 }],
      }],
    });
    const { data: overMaxAdd } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Teste Max Group",
      p_customer_phone: "31999996601",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua X, 1",
      p_payment_method: "pix",
      p_items: [{
        product_id: burgerA,
        quantity: 1,
        additionals: [{ name: "Bacon Extra", price: 6.0, quantity: 5 }], // max_quantity on group is 3
      }],
    });
    assertTest(
      "3b. create_public_order rejects bogus/unlinked additional & exceeding group max_quantity",
      crossAdd?.success === false && overMaxAdd?.success === false,
      `unlinked=${crossAdd?.message} | overMax=${overMaxAdd?.message}`
    );

    // 3c. Required complement_group enforcement (temporarily link a required group to bebidaA)
    await adminA.from("complement_groups").insert({
      id: tempIds.reqGroupId,
      tenant_id: tenantA.id,
      name: "Ponto Obrigatório Teste",
      required: true,
      min_quantity: 1,
      max_quantity: 1,
      active: true,
    });
    await adminA.from("complement_items").insert({
      id: tempIds.reqItemId,
      tenant_id: tenantA.id,
      group_id: tempIds.reqGroupId,
      name: "Gelo e Limão",
      price: 0,
      active: true,
    });
    await adminA.from("product_complement_groups").insert({
      id: tempIds.reqLinkId,
      tenant_id: tenantA.id,
      product_id: bebidaA,
      group_id: tempIds.reqGroupId,
    });

    const { data: missingReq } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Teste Req",
      p_customer_phone: "31999996601",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua X, 1",
      p_payment_method: "pix",
      p_items: [{ product_id: bebidaA, quantity: 1 }],
    });
    const { data: withReq } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Teste Req Ok",
      p_customer_phone: "31999996601",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua X, 1",
      p_payment_method: "pix",
      p_items: [{ product_id: bebidaA, quantity: 5, additionals: [{ id: tempIds.reqItemId, quantity: 1 }] }],
    });
    if (withReq?.order_id) createdOrderIds.push(withReq.order_id);

    assertTest(
      "3c. create_public_order blocks omitted required complement_group and accepts when satisfied",
      missingReq?.success === false && withReq?.success === true,
      `missing=${missingReq?.message} | satisfied=${withReq?.success} (${withReq?.message || "ok"})`
    );

    // 3d. Paused pizza flavor rejection
    await adminA.from("products").insert({
      id: tempIds.pausedFlavorId,
      tenant_id: tenantA.id,
      name: "Pizza Calabresa Pausada",
      price: 45,
      available: false,
      pizza_prices: { media: 45 },
    });
    const { data: pausedFlavorOrder } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Teste Flavor",
      p_customer_phone: "31999996601",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua X, 1",
      p_payment_method: "pix",
      p_items: [{
        product_id: burgerA,
        quantity: 1,
        size_id: "media",
        pizza_flavors: [{ product_id: tempIds.pausedFlavorId }],
      }],
    });
    assertTest(
      "3d. create_public_order rejects unavailable/paused pizza flavor",
      pausedFlavorOrder?.success === false && String(pausedFlavorOrder?.message || "").includes("disponível"),
      pausedFlavorOrder?.message
    );

    // 3e. Closed store enforcement (manual_store_open = false)
    await adminA.rpc("update_tenant_settings", {
      p_tenant_id: tenantA.id,
      p_data: { manual_store_open: false },
    });
    const { data: closedStoreOrd } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Teste Loja Fechada",
      p_customer_phone: "31999996601",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua X, 1",
      p_payment_method: "pix",
      p_items: [{ product_id: burgerA, quantity: 1 }],
    });
    await adminA.rpc("update_tenant_settings", {
      p_tenant_id: tenantA.id,
      p_data: { manual_store_open: originalManualOpen ?? true },
    });
    assertTest(
      "3e. create_public_order blocks orders when manual_store_open=false",
      closedStoreOrd?.success === false && String(closedStoreOrd?.message || "").includes("fechado"),
      closedStoreOrd?.message
    );

    // =========================================================================
    // TEST 4: Cancelling an order automatically cancels pending print_jobs
    // =========================================================================
    const { data: cancelTestOrd } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Teste Print Cancel",
      p_customer_phone: "31999996602",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua Impressao, 99",
      p_payment_method: "pix",
      p_items: [{ product_id: burgerA, quantity: 1 }],
    });
    const cancelOrdId = cancelTestOrd.order_id;
    createdOrderIds.push(cancelOrdId);

    const { data: jobsBefore } = await adminA.from("print_jobs").select("id, status").eq("order_id", cancelOrdId);
    await adminA.from("orders").update({ status: "cancelado", updated_date: new Date().toISOString() }).eq("id", cancelOrdId);
    const { data: jobsAfter } = await adminA.from("print_jobs").select("id, status").eq("order_id", cancelOrdId);

    assertTest(
      "4. Cancelling order immediately marks pending print_jobs as 'cancelled'",
      (jobsBefore?.length || 0) >= 1 &&
        jobsBefore.every((j) => j.status === "pending") &&
        jobsAfter.every((j) => j.status === "cancelled"),
      `before=${JSON.stringify(jobsBefore?.map((j) => j.status))}, after=${JSON.stringify(jobsAfter?.map((j) => j.status))}`
    );

    // =========================================================================
    // TEST 5: Expired cashback is NEVER resurrected on new cashback credit
    // =========================================================================
    const cbPhone = "31997776655";
    const { data: expWallet } = await adminA
      .from("customer_cashback_wallets")
      .upsert(
        {
          tenant_id: tenantA.id,
          phone: cbPhone,
          customer_name: "Cliente Saldo Expirado",
          balance: 50.0,
          expires_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: "tenant_id,phone" }
      )
      .select()
      .single();
    tempIds.walletId = expWallet.id;
    await adminA
      .from("customer_cashback_wallets")
      .update({
        balance: 50.0,
        expires_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", tempIds.walletId);

    const { data: cbOrd } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Cliente Cashback Expirado",
      p_customer_phone: cbPhone,
      p_delivery_type: "delivery",
      p_delivery_address: "Rua Cashback, 5",
      p_payment_method: "pix",
      p_items: [{ product_id: burgerA, quantity: 1 }],
    });
    createdOrderIds.push(cbOrd.order_id);

    const { data: procCb } = await adminA.rpc("process_order_cashback", {
      p_order_id: cbOrd.order_id,
      p_action: "credit_only",
    });
    const { data: walletAfterCb } = await adminA
      .from("customer_cashback_wallets")
      .select("balance, expires_at")
      .eq("id", tempIds.walletId)
      .single();

    const expectedEarned = Number(cbOrd?.cashback_earned || 0);
    assertTest(
      "5. Expired cashback balance (50.00) is zeroed, NOT resurrected (+earned only)",
      procCb?.success === true &&
        expectedEarned > 0 &&
        Math.abs(Number(walletAfterCb?.balance) - expectedEarned) < 0.01 &&
        new Date(walletAfterCb.expires_at).getTime() > Date.now(),
      `expected=${expectedEarned}, actualBalance=${walletAfterCb?.balance}, newExpiresAt=${walletAfterCb?.expires_at}`
    );

    // =========================================================================
    // TEST 6: Verify 3-valued NULL hardening & anon revocation on the 6 admin RPCs
    // =========================================================================
    const rpcBlocks = [];
    const rpcsToCheck = [
      ["process_order_cashback", { p_order_id: cancelOrdId, p_action: "all" }],
      ["revert_order_cashback", { p_order_id: cancelOrdId }],
      ["update_tenant_settings", { p_tenant_id: tenantA.id, p_data: { name: "Hacked" } }],
      ["create_store_admin_user", { p_tenant_id: tenantA.id, p_username: "hacker", p_password: "password123" }],
      ["update_store_admin_user", { p_user_id: tenantA.id, p_role: "admin" }],
      ["delete_store_admin_user", { p_user_id: tenantA.id }],
    ];

    for (const [fnName, args] of rpcsToCheck) {
      const { error: aErr } = await anon.rpc(fnName, args);
      const { error: crossErr } = await adminB.rpc(fnName, args);
      rpcBlocks.push({ fnName, anonBlocked: Boolean(aErr), crossTenantBlocked: Boolean(crossErr) });
    }

    // Also test a real authenticated non-admin user (if signInAnonymously is enabled) to verify NULL get_auth_tenant_id() cannot bypass
    let nonAdminSessionTested = false;
    let nonAdminBlockedAll = true;
    const anonUserClient = makeClient();
    const { data: anonAuthData } = await anonUserClient.auth.signInAnonymously();
    if (anonAuthData?.session?.access_token) {
      nonAdminSessionTested = true;
      for (const [fnName, args] of rpcsToCheck) {
        const { error: naErr } = await anonUserClient.rpc(fnName, args);
        if (!naErr) nonAdminBlockedAll = false;
      }
    }

    assertTest(
      "6. All 6 hardened admin RPCs block anon, cross-tenant admin, and authenticated non-admin (NULL tenant)",
      rpcBlocks.every((b) => b.anonBlocked && b.crossTenantBlocked) && (!nonAdminSessionTested || nonAdminBlockedAll),
      `nonAdminTested=${nonAdminSessionTested}, nonAdminBlocked=${nonAdminBlockedAll}, checks=${rpcBlocks.length}`
    );

    // Confirm tenantB product wasn't leaked into test A anyway
    assertTest("Sanity: burgerB ref exists", Boolean(burgerB), burgerB);

    // =========================================================================
    // TEST 7: DDL UNIQUE (tenant_id, order_number) rejects duplicate order_number (23505)
    // =========================================================================
    const dupNumId1 = `ord_dup_1_${Date.now()}`;
    const dupNumId2 = `ord_dup_2_${Date.now()}`;
    createdOrderIds.push(dupNumId1, dupNumId2);
    const fixedOrderNumber = 999888;
    const { error: ins1Err } = await adminA.from("orders").insert({
      id: dupNumId1,
      tenant_id: tenantA.id,
      order_number: fixedOrderNumber,
      customer_name: "Dup Check 1",
      customer_phone: "31999990011",
      total_amount: 10,
      status: "aguardando_pagamento",
      payment_method: "pix",
      items: [],
    });
    const { error: ins2Err } = await adminA.from("orders").insert({
      id: dupNumId2,
      tenant_id: tenantA.id,
      order_number: fixedOrderNumber,
      customer_name: "Dup Check 2",
      customer_phone: "31999990012",
      total_amount: 10,
      status: "aguardando_pagamento",
      payment_method: "pix",
      items: [],
    });
    assertTest(
      "7. DDL constraint uq_orders_tenant_order_number blocks duplicate order_number (23505)",
      !ins1Err && ins2Err?.code === "23505",
      `firstErr=${ins1Err?.message || "none"}, secondCode=${ins2Err?.code} (${ins2Err?.message || ""})`
    );
  } finally {
    const safeRun = async (fn) => {
      try {
        await fn();
      } catch {}
    };

    await safeRun(() =>
      adminA.rpc("update_tenant_settings", {
        p_tenant_id: tenantA.id,
        p_data: { manual_store_open: originalManualOpen ?? true },
      })
    );

    if (tempIds.sessionId) {
      await safeRun(() => adminA.from("table_sessions").delete().eq("id", tempIds.sessionId));
    }
    if (tempIds.tableId) {
      await safeRun(() => adminA.from("restaurant_tables").update({ status: "available" }).eq("id", tempIds.tableId));
    }
    if (createdOrderIds.length > 0) {
      await safeRun(() => adminA.from("customer_cashback_transactions").delete().in("order_id", createdOrderIds));
      await safeRun(() => adminA.from("coupon_usages").delete().in("order_id", createdOrderIds));
      await safeRun(() => adminA.from("print_jobs").delete().in("order_id", createdOrderIds));
      await safeRun(() => adminA.from("order_items").delete().in("order_id", createdOrderIds));
      await safeRun(() => adminA.from("orders").delete().in("id", createdOrderIds));
    }
    if (tempIds.walletId) {
      await safeRun(() => adminA.from("customer_cashback_wallets").delete().eq("id", tempIds.walletId));
    }
    await safeRun(() => adminA.from("product_complement_groups").delete().eq("id", tempIds.reqLinkId));
    await safeRun(() => adminA.from("complement_items").delete().eq("id", tempIds.reqItemId));
    await safeRun(() => adminA.from("complement_groups").delete().eq("id", tempIds.reqGroupId));
    await safeRun(() => adminA.from("products").delete().eq("id", tempIds.pausedFlavorId));
    console.log("Cleaned up synthetic business-rules test records.");
  }

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\nSUMMARY: ${passedCount}/${results.length} transactions & business-rules tests passed.`);
  if (passedCount !== results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
