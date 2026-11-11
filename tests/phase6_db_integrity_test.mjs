/**
 * FASE 6 — TESTES DE INTEGRIDADE DO BANCO, CONCORRÊNCIA SEM DEADLOCKS & BACKUP
 * Arquivo: tests/phase6_db_integrity_test.mjs
 * Execução: node tests/phase6_db_integrity_test.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
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
  return client;
}

const results = [];
function assertTest(name, passed, detail) {
  results.push({ name, passed: Boolean(passed), detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name} -> ${detail}`);
}

async function main() {
  const anon = makeClient();
  const runTag = `PHASE6_DB_${Date.now()}`;
  const createdOrderIds = [];
  const createdPhones = new Set();
  const adminA = await loginAdmin("test-empresa-04");
  const adminB = await loginAdmin("test-empresa-05");

  const [{ data: tenantA }, { data: tenantB }] = await Promise.all([
    adminA.from("tenants").select("id, slug").eq("slug", "test-empresa-04").single(),
    adminB.from("tenants").select("id, slug").eq("slug", "test-empresa-05").single(),
  ]);

  const { data: prodA } = await adminA
    .from("products")
    .select("id, price")
    .eq("tenant_id", tenantA.id)
    .eq("available", true)
    .limit(1)
    .single();

  console.log("=========================================================================");
  console.log("🗄️  FASE 6 — TESTES DE INTEGRIDADE DO BANCO & BACKUP");
  console.log(`🏪 Tenants: ${tenantA.slug} & ${tenantB.slug}`);
  console.log("=========================================================================\n");

  try {
    // 1. Operações simultâneas multi-tabela sem deadlock e sem colisão de order_number
    {
      const phone = `31944${String(Date.now()).slice(-6)}`;
      createdPhones.add(phone);

      const batch = await Promise.all(
        Array.from({ length: 12 }, (_, idx) => {
          const oid = crypto.randomUUID();
          createdOrderIds.push(oid);
          return anon.rpc("create_public_order", {
            p_order_id: oid,
            p_tenant_id: idx % 2 === 0 ? tenantA.id : tenantB.id,
            p_customer_name: `DB Integrity #${idx}`,
            p_customer_phone: phone,
            p_delivery_type: "delivery",
            p_delivery_address: `Rua DB ${idx}`,
            p_payment_method: "pix",
            p_items: [
              {
                product_id: idx % 2 === 0 ? prodA.id : `prod_${tenantB.slug}_burger`,
                quantity: 1,
              },
            ],
            p_notes: runTag,
          });
        })
      );

      const allOk = batch.every((r) => !r.error && r.data?.success === true);
      const numsA = batch.filter((_, i) => i % 2 === 0).map((r) => r.data?.order_number);
      const numsB = batch.filter((_, i) => i % 2 === 1).map((r) => r.data?.order_number);
      const dupA = numsA.length - new Set(numsA).size;
      const dupB = numsB.length - new Set(numsB).size;

      // Garante também integridade referencial: todo pedido criado tem >=1 order_item associado
      const idsA = batch.filter((_, i) => i % 2 === 0).map((r) => r.data?.order_id);
      const { data: itemsA } = await adminA.from("order_items").select("order_id").in("order_id", idsA);
      const coveredOrdersA = new Set((itemsA || []).map((x) => x.order_id));

      assertTest(
        "1. 12 criações simultâneas multi-tenant: 0 deadlocks, 0 colisões de order_number, 100% order_items ligados",
        allOk && dupA === 0 && dupB === 0 && coveredOrdersA.size === idsA.length,
        `allOk=${allOk}, dupA=${dupA}, dupB=${dupB}, itemsLinked=${coveredOrdersA.size}/${idsA.length}`
      );
    }

    // 2. Restrição UNIQUE (tenant_id, order_number) ativa no DDL (código PostgreSQL 23505)
    {
      const oid1 = crypto.randomUUID();
      const oid2 = crypto.randomUUID();
      createdOrderIds.push(oid1, oid2);
      const { data: first } = await anon.rpc("create_public_order", {
        p_order_id: oid1,
        p_tenant_id: tenantA.id,
        p_customer_name: "DDL Unique 1",
        p_customer_phone: "31988886001",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua DDL, 1",
        p_payment_method: "pix",
        p_items: [{ product_id: prodA.id, quantity: 1 }],
        p_notes: runTag,
      });

      const { error: dupInsertErr } = await adminA.from("orders").insert({
        id: oid2,
        tenant_id: tenantA.id,
        order_number: first.order_number,
        customer_name: "DDL Unique Dup",
        customer_phone: "31988886002",
        total: 10,
        total_amount: 10,
        status: "pendente",
        items: [],
        notes: runTag,
      });

      assertTest(
        "2. Restrição DDL uq_orders_tenant_order_number rejeita duplicidade com erro 23505",
        dupInsertErr?.code === "23505",
        `code=${dupInsertErr?.code || "none"} (${dupInsertErr?.message || ""})`
      );
    }

    // 3. Integridade do histórico financeiro e ledger de cashback (saldo === soma das transações)
    {
      const cbPhone = `31933${String(Date.now()).slice(-6)}`;
      createdPhones.add(cbPhone);
      const oid = crypto.randomUUID();
      createdOrderIds.push(oid);

      const { data: cOrd } = await anon.rpc("create_public_order", {
        p_order_id: oid,
        p_tenant_id: tenantA.id,
        p_customer_name: "Ledger Audit",
        p_customer_phone: cbPhone,
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Ledger, 10",
        p_payment_method: "pix",
        p_items: [{ product_id: prodA.id, quantity: 3 }],
        p_notes: runTag,
      });
      await adminA.from("orders").update({ status: "entregue" }).eq("id", cOrd.order_id);
      await adminA.rpc("process_order_cashback", { p_order_id: cOrd.order_id, p_action: "credit_only" });

      // Ordem entregue + estornada em corrida não quebra reconciliação carteira vs transações
      await adminA.rpc("revert_order_cashback", { p_order_id: cOrd.order_id });

      const { data: wallet } = await adminA
        .from("customer_cashback_wallets")
        .select("id, balance")
        .eq("tenant_id", tenantA.id)
        .eq("phone", cbPhone)
        .single();
      const { data: txs } = await adminA
        .from("customer_cashback_transactions")
        .select("amount")
        .eq("wallet_id", wallet.id);

      const ledgerSum = (txs || []).reduce((acc, r) => acc + Number(r.amount || 0), 0);
      assertTest(
        "3. Reconciliação estrita do histórico financeiro (carteira.balance === SUM(transações) e >= 0)",
        Number(wallet.balance) >= 0 && Math.abs(Number(wallet.balance) - ledgerSum) < 0.01,
        `balance=R$${wallet.balance}, ledgerSum=R$${ledgerSum.toFixed(2)}, txCount=${txs?.length || 0}`
      );
    }

    // 4. Segurança do script de backup (recusa rodar com anon key sem SERVICE_ROLE_KEY para evitar snapshot vazio)
    {
      const envWithoutServiceRole = { ...process.env };
      delete envWithoutServiceRole.SUPABASE_SERVICE_ROLE_KEY;
      const exportRun = spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/export-data.js")], {
        cwd: path.resolve(__dirname, ".."),
        env: envWithoutServiceRole,
        encoding: "utf-8",
      });
      // Nota: se .env.local possuir SERVICE_ROLE_KEY e rodar com sucesso, também valida; se não, deve sair != 0 com erro explícito (jamais 0 silencioso!)
      const hasExplicitError = (exportRun.stderr || exportRun.stdout || "").includes("SUPABASE_SERVICE_ROLE_KEY");
      const safeBehavior = exportRun.status !== 0 ? hasExplicitError : (exportRun.stdout || "").includes("checksum") || (exportRun.stdout || "").includes("sha256");

      assertTest(
        "4. Script backup:export protege contra backup silenciosamente vazio sem SERVICE_ROLE_KEY",
        safeBehavior,
        `exitCode=${exportRun.status}, protected=${hasExplicitError}`
      );
    }
  } finally {
    console.log("\n🧹 Limpando dados sintéticos da Fase 6...");
    for (let i = 0; i < createdOrderIds.length; i += 50) {
      const chunk = createdOrderIds.slice(i, i + 50);
      await adminA.from("print_jobs").delete().in("order_id", chunk);
      await adminA.from("order_items").delete().in("order_id", chunk);
      await adminA.from("customer_cashback_transactions").delete().in("order_id", chunk);
      await adminA.from("orders").delete().in("id", chunk);
      await adminB.from("print_jobs").delete().in("order_id", chunk);
      await adminB.from("order_items").delete().in("order_id", chunk);
      await adminB.from("orders").delete().in("id", chunk);
    }
    if (createdPhones.size > 0) {
      await adminA.from("customer_cashback_wallets").delete().eq("tenant_id", tenantA.id).in("phone", Array.from(createdPhones));
    }
    console.log(`   🧹 Limpeza concluída.`);
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n=== RESUMO FASE 6 INTEGRIDADE DO BANCO: ${passed}/${results.length} aprovados ===`);
  if (passed !== results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro fatal na Fase 6:", err);
  process.exit(1);
});

