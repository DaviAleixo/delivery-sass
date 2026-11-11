import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRealtimeHub } from "../src/lib/realtimeHubCore.js";

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
  return { client, session: body.session };
}

const results = [];
function assertTest(name, condition, details) {
  results.push({ name, passed: Boolean(condition), details });
  console.log(`[${condition ? "PASS" : "FAIL"}] ${name} -> ${details}`);
}

async function testMultiplexingInMemory() {
  globalThis.window = globalThis;
  let createdChannels = 0;
  let removedChannels = 0;
  const fakeHandlers = new Map();

  const mockSupabase = {
    channel: (name) => {
      createdChannels++;
      const chObj = {
        _name: name,
        _cb: null,
        on: (_evt, _opts, cb) => {
          chObj._cb = cb;
          fakeHandlers.set(name, chObj);
          return chObj;
        },
        subscribe: (cb) => {
          cb?.("SUBSCRIBED");
          return chObj;
        },
      };
      return chObj;
    },
    removeChannel: () => {
      removedChannels++;
      return Promise.resolve("ok");
    },
  };

  const { subscribeTableRealtime, isRealtimeChannelActive, getActiveRealtimeChannelCount } = createRealtimeHub({
    getClient: () => mockSupabase,
    isConfigured: () => true,
  });

  let hit1 = 0;
  let hit2 = 0;
  let hit3 = 0;
  const filter = "tenant_id=eq.mux-test-tenant";
  const unsub1 = subscribeTableRealtime({ table: "orders", filter, onEvent: () => hit1++ });
  const unsub2 = subscribeTableRealtime({ table: "orders", filter, onEvent: () => hit2++ });
  const unsub3 = subscribeTableRealtime({ table: "orders", filter, onEvent: () => hit3++ });

  const chCountWhile3Subs = createdChannels;
  const activeFlag = isRealtimeChannelActive("orders", filter);
  const hubSize = getActiveRealtimeChannelCount();

  // Trigger simulated WebSocket event through the single channel
  const ch = [...fakeHandlers.values()][0];
  ch._cb({ eventType: "INSERT", new: { id: "ord_sim" } });

  unsub1();
  const removedAfterUnsub1 = removedChannels;
  unsub2();
  const removedAfterUnsub2 = removedChannels;
  unsub3();
  const removedAfterUnsub3 = removedChannels;

  delete globalThis.window;

  assertTest(
    "1. realtimeHub multiplexes 3 subscribers (Layout+Orders+Tables) into 1 WebSocket channel",
    chCountWhile3Subs === 1 &&
      activeFlag === true &&
      hubSize === 1 &&
      hit1 === 1 &&
      hit2 === 1 &&
      hit3 === 1 &&
      removedAfterUnsub1 === 0 &&
      removedAfterUnsub2 === 0 &&
      removedAfterUnsub3 === 1,
    `created=${chCountWhile3Subs}, hits=[${hit1},${hit2},${hit3}], removedSeq=[${removedAfterUnsub1},${removedAfterUnsub2},${removedAfterUnsub3}]`
  );
}

async function testMenuHasNoUnconditionalAnonTableCalls() {
  const menuSrc = fs.readFileSync(path.resolve(__dirname, "../src/pages/Menu.jsx"), "utf-8");
  const guarded = menuSrc.includes("if (!isSupabaseConfigured() && isTableOrder && effectiveTableNumber)");
  assertTest(
    "2. Menu.jsx guards legacy TableSession/RestaurantTable client calls behind !isSupabaseConfigured()",
    guarded,
    `guarded=${guarded}`
  );
}

async function testLiveSupabaseRealtimeDelivery() {
  const anon = makeClient();
  const { client: adminA, session: sessA } = await loginAdmin("test-empresa-04");
  const { client: adminB, session: sessB } = await loginAdmin("test-empresa-05");

  await adminA.realtime.setAuth(sessA.access_token);
  await adminB.realtime.setAuth(sessB.access_token);

  const { data: tenantA } = await adminA.from("tenants").select("id, slug").eq("slug", "test-empresa-04").single();
  const { data: tbl } = await adminA
    .from("restaurant_tables")
    .select("id, table_number")
    .eq("tenant_id", tenantA.id)
    .limit(1)
    .single();

  // Clean any existing open session on tbl first
  await adminA
    .from("table_sessions")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("table_id", tbl.id)
    .in("status", ["open", "bill_requested"]);

  const eventsA = { restaurant_tables: [], table_sessions: [], print_jobs: [], orders: [] };
  const eventsCrossB = [];
  const systemMsgs = [];

  const subPromise = new Promise((resolve, reject) => {
    let joinedCount = 0;
    let pgSubscribedA = false;
    const maybeResolve = () => {
      if (joinedCount === 2 && pgSubscribedA) resolve();
    };
    const checkJoined = (status, err) => {
      if (status === "SUBSCRIBED") {
        joinedCount++;
        maybeResolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        reject(new Error(`Realtime channel error: ${status} ${err?.message || ""}`));
      }
    };

    const chA = adminA
      .channel(`test_rt_a_${Date.now()}`)
      .on("system", {}, (sys) => {
        systemMsgs.push(sys);
        if (sys?.extension === "postgres_changes" && sys?.status === "ok") {
          pgSubscribedA = true;
          maybeResolve();
        }
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantA.id}` },
        (p) => eventsA.orders.push(p)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurant_tables", filter: `tenant_id=eq.${tenantA.id}` },
        (p) => eventsA.restaurant_tables.push(p)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "table_sessions", filter: `tenant_id=eq.${tenantA.id}` },
        (p) => eventsA.table_sessions.push(p)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "print_jobs", filter: `tenant_id=eq.${tenantA.id}` },
        (p) => eventsA.print_jobs.push(p)
      )
      .subscribe(checkJoined);

    const chB = adminB
      .channel(`test_rt_b_${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "table_sessions" },
        (p) => {
          if (p.new?.tenant_id === tenantA.id || p.old?.tenant_id === tenantA.id) {
            eventsCrossB.push(p);
          }
        }
      )
      .subscribe(checkJoined);

    globalThis.__testChannels = [chA, chB];
  });

  let createdSessionId = null;
  let createdOrderId = null;

  try {
    await Promise.race([
      subPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error("Timed out waiting for Realtime SUBSCRIBED")), 8000)),
    ]);

    // Wait briefly so postgres_changes bindings settle after SUBSCRIBED, then trigger mutations
    await new Promise((r) => setTimeout(r, 800));
    await adminA.from("restaurant_tables").update({ status: "available" }).eq("id", tbl.id);

    const { data: openRes } = await adminA.rpc("open_table_session", {
      p_tenant_id: tenantA.id,
      p_table_id: tbl.id,
      p_customer_name: "Realtime Mesa Teste",
      p_people_count: 2,
    });
    createdSessionId = openRes?.session?.id;

    await adminA.rpc("add_table_session_partial_payment", {
      p_session_id: createdSessionId,
      p_payment: { id: "pay_rt_1", amount: 15, method: "pix" },
    });

    const { data: ordRes } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: "Realtime Print Test",
      p_customer_phone: "31999995501",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua Realtime, 10",
      p_payment_method: "pix",
      p_items: [{ product_id: `prod_${tenantA.slug}_burger`, quantity: 1 }],
    });
    createdOrderId = ordRes?.order_id;

    // Wait up to 6s for Realtime events to arrive
    const deadline = Date.now() + 6000;
    while (
      Date.now() < deadline &&
      (eventsA.orders.length === 0 ||
        eventsA.restaurant_tables.length === 0 ||
        eventsA.table_sessions.length < 2 ||
        eventsA.print_jobs.length === 0)
    ) {
      await new Promise((r) => setTimeout(r, 150));
    }

    console.log("Realtime system msgs:", JSON.stringify(systemMsgs), "orders events:", eventsA.orders.length);

    assertTest(
      "3a. Live Supabase Realtime delivers restaurant_tables UPDATE event",
      eventsA.restaurant_tables.some((e) => e.new?.id === tbl.id && e.new?.status === "occupied"),
      `received=${eventsA.restaurant_tables.length}`
    );
    assertTest(
      "3b. Live Supabase Realtime delivers table_sessions INSERT & UPDATE (partial payment) events",
      eventsA.table_sessions.some((e) => e.eventType === "INSERT" && e.new?.id === createdSessionId) &&
        eventsA.table_sessions.some((e) => e.eventType === "UPDATE" && e.new?.payment_details?.payments?.length === 1),
      `events=${eventsA.table_sessions.map((e) => e.eventType).join(",")}`
    );
    assertTest(
      "3c. Live Supabase Realtime delivers print_jobs INSERT event",
      eventsA.print_jobs.some((e) => e.new?.order_id === createdOrderId),
      `received=${eventsA.print_jobs.length}`
    );
    assertTest(
      "3d. RLS isolates Realtime: cross-tenant admin B receives 0 events from Tenant A",
      eventsCrossB.length === 0,
      `crossLeaked=${eventsCrossB.length}`
    );
  } finally {
    if (Array.isArray(globalThis.__testChannels)) {
      for (const ch of globalThis.__testChannels) {
        try {
          await adminA.removeChannel(ch).catch(() => {});
          await adminB.removeChannel(ch).catch(() => {});
        } catch {}
      }
      delete globalThis.__testChannels;
    }
    try {
      await adminA.realtime.disconnect();
      await adminB.realtime.disconnect();
    } catch {}
    if (createdSessionId) {
      await adminA.from("table_sessions").delete().eq("id", createdSessionId);
    }
    await adminA.from("restaurant_tables").update({ status: "available" }).eq("id", tbl.id);
    if (createdOrderId) {
      await adminA.from("print_jobs").delete().in("order_id", [createdOrderId]);
      await adminA.from("order_items").delete().in("order_id", [createdOrderId]);
      await adminA.from("orders").delete().in("id", [createdOrderId]);
    }
    console.log("Cleaned up synthetic realtime test records.");
  }
}

async function main() {
  await testMultiplexingInMemory();
  await testMenuHasNoUnconditionalAnonTableCalls();
  await testLiveSupabaseRealtimeDelivery();

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\nSUMMARY: ${passedCount}/${results.length} realtime sync tests passed.`);
  if (passedCount !== results.length) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
