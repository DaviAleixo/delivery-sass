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

async function loadBundledModule(relPath) {
  const { build } = await import("esbuild");
  const out = await build({
    entryPoints: [path.resolve(__dirname, relPath)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    alias: { "@": path.resolve(__dirname, "../src") },
  });
  const code = out.outputFiles[0].text;
  const encoded = Buffer.from(code, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

async function runUnitChecks() {
  const { settingsSchema } = await loadBundledModule("../src/schemas/settingsSchema.js");
  const { generateWhatsAppClosingText } = await loadBundledModule("../src/utils/shiftClosingWhatsAppFormatter.js");
  const { calculateShiftClosing, findOrphanShiftOrders } = await loadBundledModule("../src/utils/shiftClosingCalculator.js");

  const parsedDefault = settingsSchema.safeParse({
    restaurant_name: "PedeMuleke Test",
    whatsapp: "11999999999",
  });
  assertTest(
    "settingsSchema defaults blind_cash_closing to false",
    parsedDefault.success && parsedDefault.data.blind_cash_closing === false,
    `success=${parsedDefault.success}, val=${parsedDefault.data?.blind_cash_closing}`
  );

  const parsedTrue = settingsSchema.safeParse({
    restaurant_name: "PedeMuleke Test",
    whatsapp: "11999999999",
    blind_cash_closing: true,
  });
  assertTest(
    "settingsSchema accepts blind_cash_closing: true",
    parsedTrue.success && parsedTrue.data.blind_cash_closing === true,
    `success=${parsedTrue.success}, val=${parsedTrue.data?.blind_cash_closing}`
  );

  // Teste calculadora de turno atravessando a meia-noite via customRange
  const orders = [
    { id: "o1", status: "finalizado", payment_method: "dinheiro", order_type: "pickup", total_amount: 50, created_date: "2026-11-10T22:30:00-03:00" },
    { id: "o2", status: "finalizado", payment_method: "dinheiro", order_type: "pickup", total_amount: 35, created_date: "2026-11-11T01:15:00-03:00" },
    { id: "o_outside", status: "finalizado", payment_method: "dinheiro", order_type: "pickup", total_amount: 99, created_date: "2026-11-10T15:00:00-03:00" },
  ];
  const calc = calculateShiftClosing({
    orders,
    customRange: {
      start: "2026-11-10T21:00:00-03:00",
      end: "2026-11-11T02:00:00-03:00",
    },
  });
  assertTest(
    "calculateShiftClosing customRange inclui vendas após meia-noite e exclui turno anterior",
    calc.summary.totalOrders === 2 && Math.abs(calc.payments.cash.total - 85) < 0.01,
    `orders=${calc.summary.totalOrders}, cash=${calc.payments.cash.total}`
  );

  const waText = generateWhatsAppClosingText(
    {
      ...calc,
      cashDrawer: {
        ...calc.cashDrawer,
        openedBy: "Maria Caixa",
        blindClosing: true,
        initialFloat: 100,
        cashSales: 85,
        supplies: 20,
        bleeds: 50,
        expenses: 15,
        expectedCashInDrawer: 140,
        countedCash: 135,
        difference: -5,
        justification: "Diferença de troco no balcão",
      },
    },
    "Burger Gold"
  );
  assertTest(
    "generateWhatsAppClosingText exibe conferência completa e justificativa",
    waText.includes("Maria Caixa") &&
      waText.includes("Modo Cego") &&
      waText.includes("Troco Inicial: R$ 100,00") &&
      waText.includes("FALTA / QUEBRA") &&
      waText.includes("Diferença de troco no balcão"),
    `len=${waText.length}`
  );

  // Teste activeCashSessionId + findOrphanShiftOrders
  const nowIso = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const sessOrders = [
    { id: "rescued_pre_open", cash_session_id: "sess-B", status: "confirmado", payment_method: "dinheiro", order_type: "delivery", total_amount: 40, created_date: threeHoursAgo },
    { id: "prev_shift", cash_session_id: "sess-A", status: "entregue", payment_method: "dinheiro", order_type: "pickup", total_amount: 90, created_date: threeHoursAgo },
    { id: "still_orphan", cash_session_id: null, status: "pendente", payment_method: "pix", order_type: "delivery", total_amount: 55, created_date: oneHourAgo },
    { id: "canceled_orphan", cash_session_id: null, status: "cancelado", payment_method: "dinheiro", order_type: "delivery", total_amount: 70, created_date: oneHourAgo },
  ];
  const orphans = findOrphanShiftOrders(sessOrders, threeHoursAgo);
  assertTest(
    "findOrphanShiftOrders detecta apenas pedidos não-cancelados sem vínculo",
    orphans.length === 1 && orphans[0].id === "still_orphan",
    `count=${orphans.length}, id=${orphans[0]?.id}`
  );

  const sessCalc = calculateShiftClosing({
    orders: sessOrders,
    activeCashSessionId: "sess-B",
    customRange: {
      start: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      end: nowIso,
    },
  });
  assertTest(
    "calculateShiftClosing com activeCashSessionId inclui resgatados pré-abertura e exclui outro turno",
    sessCalc.summary.totalOrders === 1 && Math.abs(sessCalc.payments.cash.total - 40) < 0.01,
    `orders=${sessCalc.summary.totalOrders}, cash=${sessCalc.payments.cash.total}`
  );
}

async function main() {
  await runUnitChecks();

  const anon = makeClient();
  const adminA = await loginAdmin("test-empresa-04");
  const adminB = await loginAdmin("test-empresa-05");

  const { data: tenantA } = await adminA
    .from("tenants")
    .select("id, slug, blind_cash_closing")
    .eq("slug", "test-empresa-04")
    .single();
  const { data: tenantB } = await adminB
    .from("tenants")
    .select("id, slug")
    .eq("slug", "test-empresa-05")
    .single();

  const originalBlind = Boolean(tenantA.blind_cash_closing);
  const createdSessionIds = [];
  const createdOrderIds = [];

  try {
    // Limpa qualquer sessão aberta pré-existente do tenant A de testes passados
    await adminA
      .from("cash_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: "Cleanup" })
      .eq("tenant_id", tenantA.id)
      .eq("status", "open");

    // 1. Ativa blind_cash_closing via update_tenant_settings RPC
    const { data: updatedTenant, error: cfgErr } = await adminA.rpc("update_tenant_settings", {
      p_tenant_id: tenantA.id,
      p_data: { blind_cash_closing: true },
    });
    assertTest(
      "update_tenant_settings persiste blind_cash_closing = true",
      !cfgErr && updatedTenant?.blind_cash_closing === true,
      `err=${cfgErr?.message}, blind=${updatedTenant?.blind_cash_closing}`
    );

    // 2. Burst concorrente de open_cash_session (apenas 1 deve suceder)
    const burst = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        adminA.rpc("open_cash_session", {
          p_tenant_id: tenantA.id,
          p_initial_float: 100,
          p_operator: `Operador Teste ${i}`,
          p_notes: "Teste concorrência",
        })
      )
    );
    const successes = burst.filter((r) => !r.error && r.data?.session?.id);
    const failures = burst.filter((r) => r.error);
    if (successes[0]?.data?.session?.id) {
      createdSessionIds.push(successes[0].data.session.id);
    }
    assertTest(
      "open_cash_session impede abertura concorrente duplicada (5x -> 1 sucesso, 4 bloqueios)",
      successes.length === 1 && failures.length === 4,
      `success=${successes.length}, fail=${failures.length}`
    );

    const sessionId = successes[0]?.data?.session?.id;

    // 3. Movimentações: suprimento, sangria, despesa + rejeição de valor <= 0
    const { data: supMov, error: supErr } = await adminA.rpc("add_cash_movement", {
      p_tenant_id: tenantA.id,
      p_session_id: sessionId,
      p_type: "supply",
      p_title: "Suprimento de Moedas",
      p_amount: 50,
      p_operator: "Maria",
      p_category: "moedas",
      p_notes: "Troco",
    });
    const { data: bleedMov, error: bleedErr } = await adminA.rpc("add_cash_movement", {
      p_tenant_id: tenantA.id,
      p_session_id: sessionId,
      p_type: "bleed",
      p_title: "Sangria Cofre",
      p_amount: 80,
      p_operator: "Maria",
      p_category: "cofre",
      p_notes: "Retirada segura",
    });
    const { data: expMov, error: expErr } = await adminA.rpc("add_cash_movement", {
      p_tenant_id: tenantA.id,
      p_session_id: sessionId,
      p_type: "expense",
      p_title: "Despesa: Gelo",
      p_amount: 25,
      p_operator: "Maria",
      p_category: "gelo",
      p_notes: "2 sacos",
    });
    const { error: badAmtErr } = await adminA.rpc("add_cash_movement", {
      p_tenant_id: tenantA.id,
      p_session_id: sessionId,
      p_type: "bleed",
      p_title: "Invalida",
      p_amount: 0,
    });
    assertTest(
      "add_cash_movement registra in/out corretos e bloqueia valor <= 0",
      !supErr && supMov?.direction === "in" && !bleedErr && bleedMov?.direction === "out" && !expErr && expMov?.direction === "out" && Boolean(badAmtErr),
      `sup=${supMov?.direction}, bleed=${bleedMov?.direction}, exp=${expMov?.direction}, badAmtBlocked=${Boolean(badAmtErr)}`
    );

    // 4. Isolamento multi-tenant & bloqueio anon
    const { error: crossRpcErr } = await adminB.rpc("add_cash_movement", {
      p_tenant_id: tenantA.id,
      p_session_id: sessionId,
      p_type: "bleed",
      p_title: "Hack",
      p_amount: 10,
    });
    const { data: crossRows } = await adminB
      .from("cash_sessions")
      .select("id")
      .eq("tenant_id", tenantA.id);
    const { error: anonRpcErr } = await anon.rpc("open_cash_session", {
      p_tenant_id: tenantA.id,
      p_initial_float: 10,
    });
    assertTest(
      "RLS e RPC bloqueiam acesso cruzado (Tenant B) e usuário anônimo",
      Boolean(crossRpcErr) && (crossRows || []).length === 0 && Boolean(anonRpcErr),
      `crossRpcBlocked=${Boolean(crossRpcErr)}, crossRows=${(crossRows || []).length}, anonBlocked=${Boolean(anonRpcErr)}, tenantB=${tenantB.slug}`
    );

    // 5. close_cash_session rejeita divergência sem justificativa
    const { error: noJustErr } = await adminA.rpc("close_cash_session", {
      p_tenant_id: tenantA.id,
      p_session_id: sessionId,
      p_expected_cash: 200,
      p_counted_cash: 185,
      p_difference: -15,
      p_justification: "   ",
      p_closed_by: "Maria",
      p_blind_closing: true,
    });
    assertTest(
      "close_cash_session exige justificativa quando há divergência",
      Boolean(noJustErr),
      `err=${noJustErr?.message}`
    );

    // 6. close_cash_session fecha corretamente com justificativa e permite reabertura posterior
    const { data: closedSess, error: closeOkErr } = await adminA.rpc("close_cash_session", {
      p_tenant_id: tenantA.id,
      p_session_id: sessionId,
      p_expected_cash: 200,
      p_counted_cash: 185,
      p_difference: -15,
      p_justification: "Erro no troco do pedido #12",
      p_closed_by: "Maria",
      p_blind_closing: true,
    });

    const { data: reopened, error: reopenErr } = await adminA.rpc("open_cash_session", {
      p_tenant_id: tenantA.id,
      p_initial_float: 150,
      p_operator: "João Noite",
    });
    if (reopened?.session?.id) createdSessionIds.push(reopened.session.id);

    assertTest(
      "close_cash_session conclui com auditoria e libera novo turno",
      !closeOkErr &&
        closedSess?.status === "closed" &&
        Number(closedSess?.difference_amount) === -15 &&
        closedSess?.justification === "Erro no troco do pedido #12" &&
        !reopenErr &&
        reopened?.session?.status === "open",
      `closedStatus=${closedSess?.status}, diff=${closedSess?.difference_amount}, reopenOk=${!reopenErr}`
    );

    // 7. Auto-vínculo com caixa aberto, pedido órfão com caixa fechado e resgate na abertura
    const openOrdId = `test_cash_open_${Date.now()}`;
    createdOrderIds.push(openOrdId);
    const { data: ordWhileOpen, error: ordOpenErr } = await adminA
      .from("orders")
      .insert([{
        id: openOrdId,
        tenant_id: tenantA.id,
        customer_name: "Cliente Caixa Aberto",
        customer_phone: "11999990001",
        status: "confirmado",
        order_type: "pickup",
        payment_method: "dinheiro",
        total_amount: 42,
        total: 42,
        subtotal: 42,
        items: [],
      }])
      .select("id, cash_session_id")
      .single();

    assertTest(
      "Trigger auto-vincula novo pedido ao cash_session aberto",
      !ordOpenErr && ordWhileOpen?.cash_session_id === reopened.session.id,
      `err=${ordOpenErr?.message}, linked=${ordWhileOpen?.cash_session_id}`
    );

    // Fecha o caixa e cria um pedido órfão (simulando venda online com caixa fechado)
    await adminA.rpc("close_cash_session", {
      p_tenant_id: tenantA.id,
      p_session_id: reopened.session.id,
      p_expected_cash: 192,
      p_counted_cash: 192,
      p_difference: 0,
      p_justification: "",
      p_closed_by: "João Noite",
    });

    const orphanOrdId = `test_cash_orphan_${Date.now()}`;
    createdOrderIds.push(orphanOrdId);
    const { data: ordWhileClosed, error: ordClosedErr } = await adminA
      .from("orders")
      .insert([{
        id: orphanOrdId,
        tenant_id: tenantA.id,
        customer_name: "Cliente Delivery Caixa Fechado",
        customer_phone: "11999990002",
        status: "pendente",
        order_type: "delivery",
        payment_method: "dinheiro",
        total_amount: 65,
        total: 65,
        subtotal: 65,
        items: [],
      }])
      .select("id, cash_session_id")
      .single();

    const { data: orphanSummary, error: orphanListErr } = await adminA.rpc("get_orphan_orders_for_tenant", {
      p_tenant_id: tenantA.id,
    });
    const foundOrphan = (orphanSummary?.orders || []).some((o) => o.id === orphanOrdId);

    const { data: rescuedSession, error: rescueOpenErr } = await adminA.rpc("open_cash_session", {
      p_tenant_id: tenantA.id,
      p_initial_float: 100,
      p_operator: "Ana Resgate",
      p_notes: "Resgate automático",
      p_attach_order_ids: [orphanOrdId],
    });
    if (rescuedSession?.session?.id) createdSessionIds.push(rescuedSession.session.id);

    const { data: ordAfterRescue } = await adminA
      .from("orders")
      .select("id, cash_session_id")
      .eq("id", orphanOrdId)
      .single();

    assertTest(
      "Pedido com caixa fechado nasce sem vínculo, aparece em órfãos e é resgatado ao abrir turno",
      !ordClosedErr &&
        ordWhileClosed?.cash_session_id === null &&
        !orphanListErr &&
        foundOrphan &&
        !rescueOpenErr &&
        Number(rescuedSession?.attached_orders_count) === 1 &&
        ordAfterRescue?.cash_session_id === rescuedSession?.session?.id,
      `initialLink=${ordWhileClosed?.cash_session_id}, foundOrphan=${foundOrphan}, rescuedCount=${rescuedSession?.attached_orders_count}, finalLink=${ordAfterRescue?.cash_session_id}`
    );
  } finally {
    // Cleanup rigoroso do estado de teste
    if (createdOrderIds.length > 0) {
      await adminA.from("orders").delete().in("id", createdOrderIds);
    }
    if (createdSessionIds.length > 0) {
      await adminA.from("cash_sessions").delete().in("id", createdSessionIds);
    }
    await adminA.rpc("update_tenant_settings", {
      p_tenant_id: tenantA.id,
      p_data: { blind_cash_closing: originalBlind },
    });
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\nResumo: ${results.length - failed.length}/${results.length} testes passaram.`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro fatal nos testes:", err);
  process.exit(1);
});
