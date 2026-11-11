import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildCartFingerprint,
  getOrCreateCheckoutOrderId,
  clearCheckoutIdempotencyKey,
} from "../src/utils/checkoutIdempotency.js";

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

function testClientIdempotencyHelper() {
  // Mock window.sessionStorage in Node for checkoutIdempotency unit test
  const store = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };

  const tenantA = "tenant-test-a";
  const cart1 = [{ id: "prod_1", quantity: 2, notes: "sem cebola", additionals: [{ id: "add_1", quantity: 1 }] }];
  const cart1ReorderedAdds = [{ id: "prod_1", quantity: 2, notes: "sem cebola", additionals: [{ id: "add_1", quantity: 1 }] }];
  const cart2ChangedQty = [{ id: "prod_1", quantity: 3, notes: "sem cebola", additionals: [{ id: "add_1", quantity: 1 }] }];

  const id1 = getOrCreateCheckoutOrderId(tenantA, cart1);
  const id1Retry = getOrCreateCheckoutOrderId(tenantA, cart1ReorderedAdds);
  assertTest(
    "1a. Client helper keeps exact same UUID on retry with unchanged cart",
    Boolean(id1) && id1 === id1Retry,
    `id1=${id1}, retry=${id1Retry}`
  );

  const id2 = getOrCreateCheckoutOrderId(tenantA, cart2ChangedQty);
  assertTest(
    "1b. Client helper rotates UUID when cart fingerprint changes",
    Boolean(id2) && id2 !== id1 && buildCartFingerprint(cart1) !== buildCartFingerprint(cart2ChangedQty),
    `id1=${id1}, id2=${id2}`
  );

  clearCheckoutIdempotencyKey(tenantA);
  const id3 = getOrCreateCheckoutOrderId(tenantA, cart2ChangedQty);
  assertTest(
    "1c. Client helper rotates UUID after clearCheckoutIdempotencyKey",
    Boolean(id3) && id3 !== id2,
    `beforeClear=${id2}, afterClear=${id3}`
  );

  delete globalThis.window;
}

async function main() {
  testClientIdempotencyHelper();

  const anon = makeClient();
  const adminA = await loginAdmin("test-empresa-04");
  const { data: tenantA } = await adminA.from("tenants").select("id, slug").eq("slug", "test-empresa-04").single();
  const { data: tenantB } = await makeClient().from("tenants_public").select("id, slug").eq("slug", "test-empresa-05").single();

  const testCouponId = `cpn_idem_${Date.now()}`;
  const testCouponCode = `IDEM${Date.now().toString().slice(-5)}`;
  const testPhone = "31998887766";
  const createdOrderIds = [];
  let createdWalletId = null;

  try {
    // Seed temporary 1-use coupon + synthetic cashback wallet balance on test-empresa-04
    const { error: cpnErr } = await adminA.from("coupons").insert({
      id: testCouponId,
      tenant_id: tenantA.id,
      name: "Cupom Teste Idempotencia",
      code: testCouponCode,
      discount_type: "fixed",
      discount_value: 5.0,
      usage_limit: 1,
      active: true,
    });
    if (cpnErr) throw new Error(`Failed inserting temp coupon: ${cpnErr.message}`);

    const { data: wData, error: wErr } = await adminA
      .from("customer_cashback_wallets")
      .upsert(
        {
          tenant_id: tenantA.id,
          phone: testPhone,
          customer_name: "Cliente Idempotencia",
          balance: 10.0,
        },
        { onConflict: "tenant_id,phone" }
      )
      .select()
      .single();
    if (wErr) throw new Error(`Failed setting up temp wallet: ${wErr.message}`);
    createdWalletId = wData.id;

    // Reset synthetic wallet balance explicitly to 10.00 cleanly
    await adminA.from("customer_cashback_wallets").update({ balance: 10.0 }).eq("id", createdWalletId);

    // 2. Concurrent 10x burst with IDENTICAL p_order_id + 1-use coupon + cashback
    const burstOrderId = crypto.randomUUID();
    createdOrderIds.push(burstOrderId);

    const payload = {
      p_tenant_id: tenantA.id,
      p_customer_name: "Teste 4G Timeout",
      p_customer_phone: testPhone,
      p_delivery_type: "delivery",
      p_delivery_address: "Rua Idempotencia, 42",
      p_payment_method: "pix",
      p_coupon_code: testCouponCode,
      p_use_cashback: true,
      p_cashback_amount: 5.0,
      p_items: [{ product_id: `prod_${tenantA.slug}_burger`, quantity: 1 }],
      p_order_id: burstOrderId,
    };

    const concurrentCalls = await Promise.all(
      Array.from({ length: 10 }, () => anon.rpc("create_public_order", payload))
    );

    const rpcErrors = concurrentCalls.filter((r) => r.error);
    const successes = concurrentCalls.filter((r) => r.data?.success === true);
    const freshCreates = successes.filter((r) => r.data?.idempotent_replay === false);
    const replays = successes.filter((r) => r.data?.idempotent_replay === true);
    const uniqueOrderNumbers = new Set(successes.map((r) => r.data?.order_number));
    const uniqueTrackingTokens = new Set(successes.map((r) => r.data?.tracking_token));

    assertTest(
      "2a. 10x concurrent identical p_order_id calls all succeed without 23505",
      rpcErrors.length === 0 && successes.length === 10 && freshCreates.length === 1 && replays.length === 9,
      `errors=${rpcErrors.length}, successes=${successes.length}, fresh=${freshCreates.length}, replays=${replays.length}`
    );

    assertTest(
      "2b. All 10 concurrent responses return exact same order_number and tracking_token",
      uniqueOrderNumbers.size === 1 && uniqueTrackingTokens.size === 1,
      `uniqueNumbers=${uniqueOrderNumbers.size}, uniqueTokens=${uniqueTrackingTokens.size}`
    );

    // Sequential retry after commit (simulating 4G retry 2 seconds later even though coupon usage_limit=1)
    const { data: seqRetry, error: seqErr } = await anon.rpc("create_public_order", payload);
    assertTest(
      "2c. Sequential 4G retry recovers committed order even with 1-use coupon exhausted",
      !seqErr &&
        seqRetry?.success === true &&
        seqRetry?.idempotent_replay === true &&
        seqRetry?.order_id === burstOrderId &&
        seqRetry?.order_number === freshCreates[0]?.data?.order_number,
      JSON.stringify({ replay: seqRetry?.idempotent_replay, num: seqRetry?.order_number, msg: seqRetry?.message })
    );

    // Verify DB state: exactly 1 order, 1 order_item, 1 coupon_usage, 1 cashback debit tx, wallet balance = 5.00
    const { count: ordCount } = await adminA
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("id", burstOrderId);
    const { count: itemCount } = await adminA
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", burstOrderId);
    const { count: cpnUsageCount } = await adminA
      .from("coupon_usages")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", testCouponId);
    const { data: cbTxs } = await adminA
      .from("customer_cashback_transactions")
      .select("id, amount, type")
      .eq("order_id", burstOrderId);
    const { data: walletAfter } = await adminA
      .from("customer_cashback_wallets")
      .select("balance")
      .eq("id", createdWalletId)
      .single();

    assertTest(
      "2d. DB side effects occurred ONCE (1 order, 1 order_item, 1 coupon_usage, 1 cashback debit, wallet=5.00)",
      ordCount === 1 &&
        itemCount === 1 &&
        cpnUsageCount === 1 &&
        (cbTxs?.length || 0) === 1 &&
        Number(cbTxs?.[0]?.amount) === -5 &&
        Number(walletAfter?.balance) === 5,
      JSON.stringify({
        ordCount,
        itemCount,
        cpnUsageCount,
        cbTxCount: cbTxs?.length,
        cbAmount: cbTxs?.[0]?.amount,
        walletBalance: walletAfter?.balance,
      })
    );

    // 3. Security guard: replay with DIFFERENT customer phone or DIFFERENT tenant MUST be rejected!
    const { data: diffPhone } = await anon.rpc("create_public_order", {
      ...payload,
      p_customer_phone: "31911112222",
    });
    assertTest(
      "3a. Replay with same p_order_id but different customer phone is blocked (no token leak)",
      diffPhone?.success === false && !diffPhone?.tracking_token,
      JSON.stringify(diffPhone)
    );

    const { data: diffTenant } = await anon.rpc("create_public_order", {
      ...payload,
      p_tenant_id: tenantB.id,
      p_items: [{ product_id: `prod_${tenantB.slug}_burger`, quantity: 1 }],
    });
    assertTest(
      "3b. Replay with same p_order_id against another tenant is blocked",
      diffTenant?.success === false && !diffTenant?.tracking_token,
      JSON.stringify(diffTenant)
    );
  } finally {
    if (createdOrderIds.length > 0) {
      await adminA.from("customer_cashback_transactions").delete().in("order_id", createdOrderIds);
      await adminA.from("coupon_usages").delete().in("order_id", createdOrderIds);
      await adminA.from("print_jobs").delete().in("order_id", createdOrderIds);
      await adminA.from("order_items").delete().in("order_id", createdOrderIds);
      await adminA.from("orders").delete().in("id", createdOrderIds);
    }
    await adminA.from("coupons").delete().eq("id", testCouponId);
    if (createdWalletId) {
      await adminA.from("customer_cashback_wallets").delete().eq("id", createdWalletId);
    }
    console.log("Cleaned up synthetic idempotency test records.");
  }

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\nSUMMARY: ${passedCount}/${results.length} order idempotency tests passed.`);
  if (passedCount !== results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
