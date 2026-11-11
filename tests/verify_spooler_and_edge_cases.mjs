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
    body: JSON.stringify({ action: "login", storeIdentifier: slug, username: "admin", password: "TestAdmin@2026!" }),
  });
  const body = await res.json();
  if (body?.session?.access_token) {
    await client.auth.setSession(body.session);
  }
  return client;
}

async function main() {
  const anon = makeClient();
  const adminA = await loginAdmin("test-empresa-04");
  const adminB = await loginAdmin("test-empresa-05");

  const { data: tenantA } = await adminA.from("tenants").select("id, slug").eq("slug", "test-empresa-04").single();
  const { data: tenantB } = await adminB.from("tenants").select("id, slug").eq("slug", "test-empresa-05").single();

  // 1. Cross-tenant orders read check as Admin A reading Tenant B orders (created via create_public_order)
  const { data: ordBRes } = await anon.rpc("create_public_order", {
    p_tenant_id: tenantB.id,
    p_customer_name: "Vitima Loja B",
    p_customer_phone: "31999998888",
    p_delivery_type: "delivery",
    p_delivery_address: "Rua B, 20",
    p_payment_method: "pix",
    p_items: [{ product_id: `prod_${tenantB.slug}_burger`, quantity: 1 }],
  });
  const ordBId = ordBRes?.order_id;
  const { data: leakedToAdminA } = await adminA.from("orders").select("id, customer_name").eq("id", ordBId);
  console.log("1. Cross-tenant Admin A leu pedido da Loja B (esperado 0):", leakedToAdminA?.length || 0, "registro(s)");

  // 2. Spooler + print_jobs concurrency test (10 pedidos com 2 setores: Cozinha + Bar = 20 print_jobs)
  const createdIdsA = [];
  for (let i = 0; i < 10; i++) {
    const { data: po } = await anon.rpc("create_public_order", {
      p_tenant_id: tenantA.id,
      p_customer_name: `Spooler Test ${i}`,
      p_customer_phone: "31999990001",
      p_delivery_type: "delivery",
      p_delivery_address: "Rua A, 10",
      p_payment_method: "pix",
      p_items: [
        { product_id: `prod_${tenantA.slug}_burger`, quantity: 1 },
        { product_id: `prod_${tenantA.slug}_bebida`, quantity: 1 },
      ],
    });
    if (po?.order_id) createdIdsA.push(po.order_id);
  }

  const { data: jobsCreated } = await adminA
    .from("print_jobs")
    .select("id, order_id, sector_name, status")
    .in("order_id", createdIdsA);
  console.log(`2. Print jobs criados para 10 pedidos (2 setores cada): ${jobsCreated?.length || 0} (esperado: 20)`);

  // Pair spooler and fire 4 concurrent pollers!
  const { data: pairRes, error: pairErr } = await adminA.rpc("generate_spooler_pairing_code", { p_tenant_id: tenantA.id });
  console.log("3a. generate_spooler_pairing_code:", { pairRes, pairErr: pairErr?.message });
  if (pairRes?.pairing_code) {
    const { data: spPair } = await anon.rpc("spooler_pair", { p_pairing_code: pairRes.pairing_code });
    const polls = await Promise.all(
      Array.from({ length: 4 }, () => anon.rpc("spooler_poll", { p_station_token: spPair.stationToken }))
    );
    const jobCountsPerPoller = polls.map((p) => p.data?.jobs?.length || 0);
    const allPolledIds = polls.flatMap((p) => (p.data?.jobs || []).map((j) => j.id));
    const uniquePolledIds = new Set(allPolledIds);
    console.log(`3b. 4 pollers simultâneos: contagens=${JSON.stringify(jobCountsPerPoller)}, total=${allPolledIds.length}, únicos=${uniquePolledIds.size}, duplicados=${allPolledIds.length - uniquePolledIds.size}`);

    for (const jid of uniquePolledIds) {
      await anon.rpc("spooler_ack", { p_station_token: spPair.stationToken, p_job_id: jid, p_status: "printed" });
    }
    const { data: ordCheck } = await adminA.from("orders").select("id, print_status, print_count").in("id", createdIdsA);
    const printedOrders = (ordCheck || []).filter((o) => o.print_status === "printed").length;
    console.log(`4. Pedidos marcados como print_status='printed' após ACK de todos setores: ${printedOrders}/${createdIdsA.length}`);
  }

  // 5. Test mercadopago Edge Function tenant_id coupon isolation + additionals recalc
  // Order in Tenant B with coupon 'TESTE10' AND Bacon Extra (6.00) on Burger (29.90) + R$5.00 delivery = 37.31
  const { data: ordMpRes } = await anon.rpc("create_public_order", {
    p_tenant_id: tenantB.id,
    p_customer_name: "Teste MP Recalc",
    p_customer_phone: "31999990001",
    p_delivery_type: "delivery",
    p_delivery_address: "Rua B, 50",
    p_payment_method: "pix",
    p_coupon_code: "TESTE10",
    p_items: [
      {
        product_id: `prod_${tenantB.slug}_burger`,
        quantity: 1,
        additionals: [{ name: "Bacon Extra", price: 6.0, quantity: 1 }],
      },
    ],
  });
  const ordMpId = ordMpRes?.order_id;

  const mpRes = await fetch(`${SUPABASE_URL}/functions/v1/mercadopago`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create_pix_payment",
      accessToken: "APP_USR-invalid-probe-token",
      orderId: ordMpId,
      payerEmail: "teste@gmail.com",
      payerName: "Teste MP",
    }),
  });
  const mpBody = await mpRes.json().catch(() => ({}));
  const { data: ordMpAfter } = await adminB.from("orders").select("total_amount, subtotal, discount_amount").eq("id", ordMpId).single();
  console.log(`5. MercadoPago Edge Function status=${mpRes.status}, order após recalculo (esperado total=37.31):`, ordMpAfter, "mpError:", mpBody?.error);

  // Authenticated cleanup
  await adminA.from("print_jobs").delete().in("order_id", createdIdsA);
  await adminA.from("order_items").delete().in("order_id", createdIdsA);
  await adminA.from("orders").delete().in("id", createdIdsA);

  const idsB = [ordBId, ordMpId].filter(Boolean);
  await adminB.from("print_jobs").delete().in("order_id", idsB);
  await adminB.from("order_items").delete().in("order_id", idsB);
  await adminB.from("orders").delete().in("id", idsB);

  const failures = [];
  if ((leakedToAdminA?.length || 0) !== 0) failures.push("cross-tenant leak");
  if ((jobsCreated?.length || 0) !== 20) failures.push(`print_jobs=${jobsCreated?.length}`);
  if (Math.abs(Number(ordMpAfter?.total_amount) - 37.31) > 0.01) failures.push(`mp recalc total=${ordMpAfter?.total_amount}`);
  if (failures.length > 0) {
    console.error("FAILURES:", failures);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
