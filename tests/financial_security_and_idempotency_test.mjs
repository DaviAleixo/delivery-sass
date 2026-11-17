import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
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
  await client.auth.setSession({
    access_token: body.session.access_token,
    refresh_token: body.session.refresh_token,
  });
  let tenantId = body.user?.tenant_id || body.tenant_id || body.tenant?.id;
  if (!tenantId) {
    const { data: t } = await client.from("tenants").select("id").eq("slug", slug).single();
    tenantId = t?.id;
  }
  return { client, tenantId };
}

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`✅ PASS: ${msg}`);
    passed += 1;
  } else {
    console.error(`❌ FAIL: ${msg}`);
    failed += 1;
  }
}

async function run() {
  const anon = makeClient();
  const { client: adminA, tenantId: tenantA } = await loginAdmin("test-empresa-04");
  const { client: adminB, tenantId: tenantB } = await loginAdmin("test-empresa-05");

  const createdIdsA = [];

  try {
    // 1. Anon bloqueado em tabelas e RPCs
    const { data: anonAcc, error: anonAccErr } = await anon.from("financial_accounts").select("*").limit(1);
    assert(Boolean(anonAccErr) || (Array.isArray(anonAcc) && anonAcc.length === 0), "1. Anon bloqueado em financial_accounts");

    const { error: anonRpcErr } = await anon.rpc("get_financial_overview", { p_tenant_id: tenantA });
    assert(Boolean(anonRpcErr), "2. Anon bloqueado em get_financial_overview");

    const { error: anonCreateErr } = await anon.rpc("create_financial_entry", {
      p_tenant_id: tenantA,
      p_entry_type: "income",
      p_description: "Hack anon",
      p_amount: 999,
      p_account_code: "safe",
    });
    assert(Boolean(anonCreateErr), "3. Anon bloqueado em create_financial_entry");

    // 2. Isolamento Cross-Tenant (IDOR)
    const { error: crossOverviewErr } = await adminA.rpc("get_financial_overview", { p_tenant_id: tenantB });
    assert(Boolean(crossOverviewErr), "4. Cross-tenant bloqueado em get_financial_overview (A -> B)");

    const { error: crossCreateErr } = await adminA.rpc("create_financial_entry", {
      p_tenant_id: tenantB,
      p_entry_type: "expense",
      p_description: "IDOR test",
      p_amount: 50,
      p_account_code: "safe",
    });
    assert(Boolean(crossCreateErr), "5. Cross-tenant bloqueado em create_financial_entry (A -> B)");

    // Cria um lançamento em B e tenta baixar/excluir como A
    const { data: entryBRes } = await adminB.rpc("create_financial_entry", {
      p_tenant_id: tenantB,
      p_entry_type: "expense",
      p_description: "Conta B teste",
      p_amount: 25,
      p_account_code: "bank",
      p_status: "pending",
    });
    const entryBId = entryBRes?.entry?.id;
    const { error: crossPayErr } = await adminA.rpc("mark_financial_entry_paid", {
      p_tenant_id: tenantB,
      p_entry_id: entryBId,
    });
    const { error: crossDelErr } = await adminA.rpc("delete_financial_entry", {
      p_tenant_id: tenantA,
      p_entry_id: entryBId,
    });
    assert(Boolean(crossPayErr) && Boolean(crossDelErr), "6. Cross-tenant bloqueado em baixa e exclusão");
    if (entryBId) await adminB.rpc("delete_financial_entry", { p_tenant_id: tenantB, p_entry_id: entryBId });

    // 3. Validações de valor e autotransferência
    const { error: negErr } = await adminA.rpc("create_financial_entry", {
      p_tenant_id: tenantA,
      p_entry_type: "expense",
      p_description: "Valor negativo",
      p_amount: -10,
      p_account_code: "safe",
    });
    const { error: selfTransErr } = await adminA.rpc("create_financial_entry", {
      p_tenant_id: tenantA,
      p_entry_type: "transfer",
      p_description: "Self transfer",
      p_amount: 10,
      p_account_code: "safe",
      p_target_account_code: "safe",
    });
    assert(Boolean(negErr) && Boolean(selfTransErr), "7. Bloqueia valor negativo/zero e autotransferência");

    // 4. Corrida paralela (10 chamadas idênticas simultâneas) em create_financial_entry com mesma origem
    const beforeOverview = (await adminA.rpc("get_financial_overview", { p_tenant_id: tenantA })).data;
    const baseSafe = Number(beforeOverview.accounts.safe.balance || 0);

    const sharedSourceId = crypto.randomUUID();
    const burstCreate = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        adminA.rpc("create_financial_entry", {
          p_tenant_id: tenantA,
          p_entry_type: "transfer",
          p_description: "Sangria teste corrida",
          p_amount: 100,
          p_account_code: "drawer",
          p_target_account_code: "safe",
          p_source_type: "cash_bleed",
          p_source_id: sharedSourceId,
        })
      )
    );
    const createOk = burstCreate.filter((r) => !r.error);
    const nonDedupCount = createOk.filter((r) => r.data?.deduplicated === false).length;
    const afterBurstOverview = (await adminA.rpc("get_financial_overview", { p_tenant_id: tenantA })).data;
    const safeAfterBurst = Number(afterBurstOverview.accounts.safe.balance || 0);

    assert(
      createOk.length === 10 && nonDedupCount === 1 && Math.abs(safeAfterBurst - (baseSafe + 100)) < 0.01,
      `8. Rajada 10x create_financial_entry deduplicada atomicamente (criadas=${nonDedupCount}, deltaCofre=${safeAfterBurst - baseSafe})`
    );

    // Tenta excluir lançamento automático do caixa (deve bloquear!)
    const autoEntryId = createOk[0]?.data?.entry?.id;
    const { error: delAutoErr } = await adminA.rpc("delete_financial_entry", {
      p_tenant_id: tenantA,
      p_entry_id: autoEntryId,
    });
    assert(Boolean(delAutoErr), "9. Impede exclusão manual de lançamento automático do PDV/Caixa");

    // Reverte com transferência manual inversa para deixar o cofre zerado como antes
    if (autoEntryId) {
      const { data: revRes } = await adminA.rpc("create_financial_entry", {
        p_tenant_id: tenantA,
        p_entry_type: "expense",
        p_description: "Estorno teste cofre",
        p_amount: 100,
        p_account_code: "safe",
      });
      if (revRes?.entry?.id) createdIdsA.push(revRes.entry.id);
    }

    // 5. Rajada 10x simultânea em mark_financial_entry_paid
    const { data: pendingRes } = await adminA.rpc("create_financial_entry", {
      p_tenant_id: tenantA,
      p_entry_type: "expense",
      p_description: "Boleto teste corrida baixa",
      p_amount: 75,
      p_account_code: "bank",
      p_status: "pending",
    });
    const pendingId = pendingRes?.entry?.id;
    createdIdsA.push(pendingId);

    const bankBeforePay = Number(
      (await adminA.rpc("get_financial_overview", { p_tenant_id: tenantA })).data.accounts.bank.balance || 0
    );

    const burstPay = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        adminA.rpc("mark_financial_entry_paid", {
          p_tenant_id: tenantA,
          p_entry_id: pendingId,
          p_account_code: "bank",
        })
      )
    );
    const payFirstCount = burstPay.filter((r) => !r.error && r.data?.already_paid === false).length;
    const bankAfterPay = Number(
      (await adminA.rpc("get_financial_overview", { p_tenant_id: tenantA })).data.accounts.bank.balance || 0
    );
    assert(
      payFirstCount === 1 && Math.abs(bankAfterPay - (bankBeforePay - 75)) < 0.01,
      `10. Rajada 10x mark_financial_entry_paid baixou apenas 1 vez (baixas=${payFirstCount}, deltaBanco=${bankAfterPay - bankBeforePay})`
    );

    // 6. Rajada 10x simultânea em delete_financial_entry (não pode estornar saldo 2x!)
    const burstDel = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        adminA.rpc("delete_financial_entry", {
          p_tenant_id: tenantA,
          p_entry_id: pendingId,
        })
      )
    );
    const delSuccessCount = burstDel.filter((r) => !r.error && r.data?.deleted === true).length;
    const bankAfterDel = Number(
      (await adminA.rpc("get_financial_overview", { p_tenant_id: tenantA })).data.accounts.bank.balance || 0
    );
    assert(
      delSuccessCount === 1 && Math.abs(bankAfterDel - bankBeforePay) < 0.01,
      `11. Rajada 10x delete_financial_entry estornou apenas 1 vez (exclusoes=${delSuccessCount})`
    );

    // 7. Parcelamento 3x com 1ª paga + KPIs de Contas a Pagar/Receber
    const { data: instRes, error: instErr } = await adminA.rpc("create_financial_installments", {
      p_tenant_id: tenantA,
      p_entry_type: "expense",
      p_description: "Fornecedor Teste Parcela",
      p_counterparty: "Distribuidora X",
      p_category: "Fornecedores / Insumos",
      p_amount: 50,
      p_account_code: "bank",
      p_installments: 3,
      p_mark_first_paid: true,
    });
    assert(!instErr && instRes?.count === 3, "12. Parcelamento 3x criado atomicamente");
    for (const item of instRes?.items || []) {
      await adminA.rpc("delete_financial_entry", { p_tenant_id: tenantA, p_entry_id: item.id });
    }
  } finally {
    for (const id of createdIdsA) {
      try {
        await adminA.rpc("delete_financial_entry", { p_tenant_id: tenantA, p_entry_id: id });
      } catch {
        // ignore if already deleted
      }
    }
  }

  console.log(`\nResumo: ${passed}/${passed + failed} testes aprovados.`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
