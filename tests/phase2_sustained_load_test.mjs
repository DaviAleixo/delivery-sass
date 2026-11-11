/**
 * FASE 2 — SUITE DE CARGA SUSTENTADA PROGRESSIVA COM CIRCUIT BREAKERS
 * Arquivo: tests/phase2_sustained_load_test.mjs
 *
 * Exemplos de uso:
 *   node tests/phase2_sustained_load_test.mjs --dry-run
 *   node tests/phase2_sustained_load_test.mjs --profile=free-safe --duration-min=15 --orders=1200
 *   node tests/phase2_sustained_load_test.mjs --profile=free-safe --duration-min=3 --orders=300
 *   node tests/phase2_sustained_load_test.mjs --profile=progressive-20-500 --authorize-paid-env
 *
 * Segurança & Isolamento:
 * - Opera EXCLUSIVAMENTE em tenants cujo slug começa com "test-empresa-" (nunca toca PedeMuleke, Vruum Burguer ou visual).
 * - Bloqueia perfis >80 empresas ou >2500 pedidos ou >30min sem --authorize-paid-env (proteção contra estouro no Free).
 * - Interrompe automaticamente (Circuit Breaker) em caso de erro >2%, p95 >3500ms, HTTP 429, queda de Realtime ou colisão de order_number.
 */

import { createClient } from "@supabase/supabase-js";
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

const BYTES_PER_ORDER_ESTIMATE = 3272; // Medido no schema atual (orders + order_items + print_jobs)
const PROD_SLUGS_DENYLIST = new Set(["teste", "pedemuleke", "vruum-burguer", "visual"]);

function parseArgs(argv) {
  const args = {
    profile: "free-safe",
    dryRun: false,
    cleanup: true,
    authorizePaidEnv: false,
    orders: null,
    durationMin: null,
    maxErrorRatePct: 2.0,
    maxP95Ms: 3500,
    rushRps: 12,
    kdsChannelsCap: 15,
  };

  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw === "--no-cleanup") args.cleanup = false;
    else if (raw === "--authorize-paid-env") args.authorizePaidEnv = true;
    else if (raw.startsWith("--profile=")) args.profile = raw.split("=")[1];
    else if (raw.startsWith("--orders=")) args.orders = Number(raw.split("=")[1]);
    else if (raw.startsWith("--duration-min=")) args.durationMin = Number(raw.split("=")[1]);
    else if (raw.startsWith("--max-error-pct=")) args.maxErrorRatePct = Number(raw.split("=")[1]);
    else if (raw.startsWith("--max-p95-ms=")) args.maxP95Ms = Number(raw.split("=")[1]);
    else if (raw.startsWith("--rush-rps=")) args.rushRps = Number(raw.split("=")[1]);
    else if (raw.startsWith("--kds-channels=")) args.kdsChannelsCap = Number(raw.split("=")[1]);
  }
  return args;
}

function buildStagePlan(args) {
  if (args.profile === "progressive-20-500") {
    const totalOrders = args.orders ?? 10000;
    const totalMin = args.durationMin ?? 60;
    return {
      name: "progressive-20-500",
      requiresPaidAuth: true,
      targetTotalOrders: totalOrders,
      targetDurationSec: Math.round(totalMin * 60),
      stages: [
        { name: "stage-1-20-empresas", simulatedCompanies: 20, shareOrders: 0.10, shareDuration: 0.15, burstRps: 5 },
        { name: "stage-2-100-empresas", simulatedCompanies: 100, shareOrders: 0.20, shareDuration: 0.25, burstRps: 8 },
        { name: "stage-3-250-empresas", simulatedCompanies: 250, shareOrders: 0.30, shareDuration: 0.30, burstRps: 12 },
        { name: "stage-4-500-empresas", simulatedCompanies: 500, shareOrders: 0.40, shareDuration: 0.30, burstRps: 16 },
      ],
    };
  }

  // Perfil padrão seguro para Supabase Free (Nano 0.5 GB RAM, 60 conns PG, 200 Realtime peak, 5 GB egress)
  const totalOrders = args.orders ?? 1200;
  const totalMin = args.durationMin ?? 15;
  return {
    name: "free-safe",
    requiresPaidAuth: false,
    targetTotalOrders: totalOrders,
    targetDurationSec: Math.round(totalMin * 60),
    stages: [
      { name: "stage-1-warmup", simulatedCompanies: 17, shareOrders: 0.20, shareDuration: 0.20, burstRps: 0 },
      { name: "stage-2-sustained", simulatedCompanies: 17, shareOrders: 0.55, shareDuration: 0.55, burstRps: 0 },
      { name: "stage-3-dinner-rush", simulatedCompanies: 17, shareOrders: 0.25, shareDuration: 0.25, burstRps: args.rushRps },
    ],
  };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loginTenantAdmin(slug) {
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
    throw new Error(`Falha login admin (${slug}): ${body?.error || `HTTP ${res.status}`}`);
  }
  await client.auth.setSession(body.session);
  return client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildStagePlan(args);
  const maxCompanies = Math.max(...plan.stages.map((s) => s.simulatedCompanies));

  // Guardrail obrigatório para Free / Nano
  if (
    (plan.requiresPaidAuth || maxCompanies > 80 || plan.targetTotalOrders > 2500 || plan.targetDurationSec > 1800) &&
    !args.authorizePaidEnv &&
    !args.dryRun
  ) {
    console.error("\n🛑 BLOQUEADO PELO GUARDRAIL DE SEGURANÇA (Plano Free / Nano):");
    console.error(
      `   Perfil="${plan.name}", empresas=${maxCompanies}, pedidos=${plan.targetTotalOrders}, duração=${Math.round(
        plan.targetDurationSec / 60
      )}min.`
    );
    console.error(
      "   Em plano Free (200 conns Realtime, 60 conns PG, 0.5 GB RAM, 5 GB egress), essa carga arrisca saturação ou bloqueio."
    );
    console.error("   Use --profile=free-safe OU passe --authorize-paid-env apenas em ambiente Pro/Small+ isolado.\n");
    process.exit(2);
  }

  const runTag = `PHASE2_LOAD_${Date.now()}`;
  const anon = makeClient();

  console.log("=========================================================================");
  console.log(`🚀 FASE 2 — TESTE DE CARGA SUSTENTADA (${plan.name})`);
  console.log(`📡 Endpoint: ${SUPABASE_URL}`);
  console.log(`🏷️  Run Tag:  ${runTag}`);
  console.log(`🎯 Alvo:     ${plan.targetTotalOrders} pedidos em ${Math.round(plan.targetDurationSec / 60)} min`);
  console.log("=========================================================================\n");

  const { data: tenants, error: tenantsErr } = await anon
    .from("tenants_public")
    .select("id, slug, name, is_active, plan, salon_mode, accepts_delivery, accepts_takeaway, accepts_dine_in")
    .order("slug", { ascending: true });

  if (tenantsErr) {
    throw new Error(`Falha ao consultar tenants_public: ${tenantsErr.message}`);
  }

  const testTenants = (tenants || []).filter(
    (t) =>
      t.is_active &&
      t.slug.startsWith("test-empresa-") &&
      !PROD_SLUGS_DENYLIST.has(t.slug.toLowerCase())
  );

  if (testTenants.length === 0) {
    throw new Error("Nenhum tenant de teste 'test-empresa-*' encontrado.");
  }

  const activeOrderTenants = testTenants.filter(
    (t) => t.salon_mode !== "showcase" && t.plan !== "showcase" && (t.accepts_delivery || t.accepts_takeaway || t.accepts_dine_in)
  );
  const rejectProbeTenants = testTenants.filter((t) => t.salon_mode === "showcase" || t.plan === "showcase");

  // Descobre um produto disponível por loja de teste
  const { data: availProducts, error: prodErr } = await anon
    .from("products")
    .select("id, tenant_id, price")
    .in(
      "tenant_id",
      testTenants.map((t) => t.id)
    )
    .eq("available", true);

  if (prodErr) {
    throw new Error(`Falha ao carregar produtos de teste: ${prodErr.message}`);
  }

  const productByTenantId = new Map();
  for (const p of availProducts || []) {
    if (!productByTenantId.has(p.tenant_id)) productByTenantId.set(p.tenant_id, p);
  }

  const readyOrderTenants = activeOrderTenants.filter((t) => productByTenantId.has(t.id));
  if (readyOrderTenants.length === 0) {
    throw new Error("Nenhuma loja 'test-empresa-*' possui produto disponível para pedido.");
  }

  const estDbMb = ((plan.targetTotalOrders * BYTES_PER_ORDER_ESTIMATE) / (1024 * 1024)).toFixed(2);
  const estRealtimeMsgs = plan.targetTotalOrders * 5;
  const plannedKdsSockets = Math.min(args.kdsChannelsCap, readyOrderTenants.length);

  console.log(`🏪 Lojas isoladas detectadas: ${testTenants.length} (${readyOrderTenants.length} ativas + ${rejectProbeTenants.length} showcase)`);
  console.log(`🔌 WebSockets Realtime KDS planejados: ${plannedKdsSockets}`);
  console.log(`💾 Estimativa temporária no DB: ~${estDbMb} MB (~${estRealtimeMsgs} msgs Realtime)`);
  console.log(`🛡️  Circuit Breakers: errorRate > ${args.maxErrorRatePct}% | p95 > ${args.maxP95Ms}ms | HTTP 429 | colisão order_number\n`);

  if (args.dryRun) {
    console.log("📋 Plano de Estágios (DRY-RUN — nenhum pedido enviado):");
    for (const s of plan.stages) {
      const sOrders = Math.round(plan.targetTotalOrders * s.shareOrders);
      const sSec = Math.round(plan.targetDurationSec * s.shareDuration);
      console.log(
        `   - ${s.name}: empresas=${Math.min(s.simulatedCompanies, testTenants.length)} | pedidos=${sOrders} | janela=${sSec}s | burstRps=${s.burstRps}`
      );
    }
    console.log("\n✅ Dry-run concluído sem mutações.");
    return;
  }

  // Autentica admins por loja de teste para monitorar KDS via Realtime e limpar dados após o teste
  console.log("🔐 Autenticando admins das lojas de teste e abrindo canais Realtime KDS...");
  const adminByTenantId = new Map();
  for (const t of testTenants) {
    adminByTenantId.set(t.id, await loginTenantAdmin(t.slug));
  }

  const kdsEventsByOrderId = new Map(); // order_id -> { submittedAt, rpcAckAt, kdsReceivedAt, lagMs, tenantId }
  const pendingRealtimeIds = new Map(); // order_id -> { submittedAt, rpcAckAt, tenantId }
  const monitoredOrderIds = new Set();
  const realtimeLatencies = [];
  const kdsChannels = [];
  let realtimeChannelErrors = 0;
  let realtimeMessagesReceived = 0;

  const monitoredTenants = readyOrderTenants.slice(0, plannedKdsSockets);
  for (const t of monitoredTenants) {
    const admClient = adminByTenantId.get(t.id);
    const ch = admClient
      .channel(`phase2_kds_${t.id}_${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `tenant_id=eq.${t.id}` },
        (payload) => {
          const row = payload?.new;
          if (!row || !String(row.notes || "").includes(runTag)) return;
          realtimeMessagesReceived++;
          const now = Date.now();
          const tracked = pendingRealtimeIds.get(row.id) || kdsEventsByOrderId.get(row.id);
          if (tracked?.submittedAt && !kdsEventsByOrderId.get(row.id)?.kdsReceivedAt) {
            const e2eLag = Math.max(0, now - tracked.submittedAt);
            realtimeLatencies.push(e2eLag);
            pendingRealtimeIds.delete(row.id);
            kdsEventsByOrderId.set(row.id, { ...tracked, kdsReceivedAt: now, lagMs: e2eLag });
          } else if (!kdsEventsByOrderId.get(row.id)?.kdsReceivedAt) {
            kdsEventsByOrderId.set(row.id, { tenantId: t.id, kdsReceivedAt: now });
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          realtimeChannelErrors++;
        }
      });
    kdsChannels.push({ tenantId: t.id, client: admClient, channel: ch });
  }

  // Aguarda breve handshake dos WebSockets Realtime antes de iniciar a carga
  await sleep(1500);
  console.log(`📡 ${kdsChannels.length} canais KDS Realtime prontos (erros iniciais=${realtimeChannelErrors}).\n`);

  // Estado agregado e tracking para duplicidade + cleanup
  const createdIdsByTenant = new Map();
  const seenOrderNumbersByTenant = new Map();
  const allLatencies = [];
  const stageSummaries = [];
  const sampleUnexpectedErrors = [];

  let totalSent = 0;
  let totalAccepted = 0;
  let totalRuleRejected = 0;
  let totalUnexpectedErrors = 0;
  let totalRateLimited429 = 0;
  let totalIdempotentReplays = 0;
  let totalOrderNumberCollisions = 0;
  let circuitBreakerReason = null;

  const monitoredTenantSet = new Set(monitoredTenants.map((t) => t.id));
  const recentOrderPayloadsForRetry = [];
  let inFlight = 0;

  async function dispatchSingleOrder(idx, expectRuleReject = false) {
    const useRejectStore = expectRuleReject && rejectProbeTenants.length > 0;
    const tenant = useRejectStore
      ? rejectProbeTenants[idx % rejectProbeTenants.length]
      : readyOrderTenants[idx % readyOrderTenants.length];
    const prod = productByTenantId.get(tenant.id);

    // 5% de chance de testar replay idempotente com exatamente o mesmo p_order_id
    const doRetry = !useRejectStore && recentOrderPayloadsForRetry.length > 0 && idx % 20 === 19;
    let payload;
    let isRetry = false;
    if (doRetry) {
      payload = recentOrderPayloadsForRetry[idx % recentOrderPayloadsForRetry.length];
      isRetry = true;
    } else {
      const deliveryType = tenant.accepts_delivery ? "delivery" : tenant.accepts_takeaway ? "pickup" : "dine_in";
      payload = {
        p_order_id: crypto.randomUUID(),
        p_tenant_id: tenant.id,
        p_customer_name: `Load Cliente ${idx}`,
        p_customer_phone: `3198${String((idx % 8999999) + 1000000)}`,
        p_delivery_type: deliveryType,
        p_delivery_address: deliveryType === "delivery" ? `Av Carga ${idx}, Centro` : "",
        p_payment_method: idx % 2 === 0 ? "pix" : "dinheiro",
        p_items: [{ product_id: prod.id, quantity: 1 }],
        p_notes: `${runTag}#${idx}`,
      };
    }

    totalSent++;
    inFlight++;
    const t0 = Date.now();
    try {
      const { data, error } = await anon.rpc("create_public_order", payload);
      const latMs = Date.now() - t0;
      const rpcAckAt = Date.now();
      allLatencies.push(latMs);

      if (error) {
        const msg = String(error.message || error.code || "unknown_rpc_error");
        if (error.status === 429 || msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
          totalRateLimited429++;
        }
        totalUnexpectedErrors++;
        if (sampleUnexpectedErrors.length < 15) {
          sampleUnexpectedErrors.push({ idx, tenant: tenant.slug, error: msg, status: error.status || null });
        }
        return { ok: false, unexpected: true, latMs };
      }

      if (data?.success === false) {
        if (useRejectStore || tenant.salon_mode === "table_only") {
          totalRuleRejected++;
          return { ok: false, unexpected: false, ruleRejected: true, latMs };
        }
        totalUnexpectedErrors++;
        if (sampleUnexpectedErrors.length < 15) {
          sampleUnexpectedErrors.push({ idx, tenant: tenant.slug, error: data?.error || "rpc_success_false" });
        }
        return { ok: false, unexpected: true, latMs };
      }

      const orderId = data?.order_id;
      const orderNum = data?.order_number;

      if (isRetry || data?.idempotent_replay) {
        totalIdempotentReplays++;
        if (orderId !== payload.p_order_id) {
          totalOrderNumberCollisions++;
        }
        return { ok: true, idempotentReplay: true, latMs };
      }

      totalAccepted++;
      if (!createdIdsByTenant.has(tenant.id)) createdIdsByTenant.set(tenant.id, new Set());
      createdIdsByTenant.get(tenant.id).add(orderId);

      if (!seenOrderNumbersByTenant.has(tenant.id)) seenOrderNumbersByTenant.set(tenant.id, new Set());
      const numSet = seenOrderNumbersByTenant.get(tenant.id);
      if (orderNum !== undefined && orderNum !== null) {
        if (numSet.has(orderNum)) {
          totalOrderNumberCollisions++;
        }
        numSet.add(orderNum);
      }

      if (monitoredTenantSet.has(tenant.id) && orderId) {
        monitoredOrderIds.add(orderId);
        const prev = kdsEventsByOrderId.get(orderId);
        if (prev?.kdsReceivedAt && !prev?.lagMs) {
          const e2eLag = Math.max(0, prev.kdsReceivedAt - t0);
          realtimeLatencies.push(e2eLag);
          kdsEventsByOrderId.set(orderId, { ...prev, submittedAt: t0, rpcAckAt, lagMs: e2eLag });
        } else if (!prev?.kdsReceivedAt) {
          pendingRealtimeIds.set(orderId, { tenantId: tenant.id, submittedAt: t0, rpcAckAt });
        }
      }

      if (recentOrderPayloadsForRetry.length < 40) {
        recentOrderPayloadsForRetry.push(payload);
      }

      return { ok: true, latMs };
    } catch (err) {
      const latMs = Date.now() - t0;
      allLatencies.push(latMs);
      totalUnexpectedErrors++;
      if (sampleUnexpectedErrors.length < 15) {
        sampleUnexpectedErrors.push({ idx, tenant: tenant.slug, error: err.message });
      }
      return { ok: false, unexpected: true, latMs };
    } finally {
      inFlight--;
    }
  }

  const latencySpikes = [];
  let consecutiveHighP95Checks = 0;

  function evaluateCircuitBreaker(windowLatencies, isSlowCheck) {
    if (totalRateLimited429 > 0) return `HTTP 429 rate-limit detectado (${totalRateLimited429})`;
    if (totalOrderNumberCollisions > 0) return `Colisão de order_number detectada (${totalOrderNumberCollisions})`;
    if (kdsChannels.length > 0 && realtimeChannelErrors > Math.max(2, Math.ceil(kdsChannels.length * 0.2))) {
      return `Queda excessiva de canais Realtime (${realtimeChannelErrors}/${kdsChannels.length})`;
    }
    if (totalSent >= 30) {
      const errPct = (totalUnexpectedErrors / totalSent) * 100;
      if (errPct > args.maxErrorRatePct) {
        return `Taxa de erros ${errPct.toFixed(2)}% > limite ${args.maxErrorRatePct}%`;
      }
    }
    if (isSlowCheck && windowLatencies.length >= 25) {
      const wP95 = percentile(windowLatencies, 95);
      if (wP95 > args.maxP95Ms * 2.5) {
        return `Latência p95 crítica (${wP95}ms) > ${(args.maxP95Ms * 2.5).toFixed(0)}ms`;
      }
      if (wP95 > args.maxP95Ms) {
        consecutiveHighP95Checks++;
        latencySpikes.push({ atSent: totalSent, p95Ms: wP95, consecutive: consecutiveHighP95Checks });
        console.warn(`   ⚠️ Pico de latência na janela: p95=${wP95}ms (${consecutiveHighP95Checks}/2 checks consecutivos)`);
        if (consecutiveHighP95Checks >= 2) {
          return `Latência p95 sustentada acima de ${args.maxP95Ms}ms (${wP95}ms por 2 ciclos)`;
        }
      } else {
        consecutiveHighP95Checks = 0;
      }
    }
    return null;
  }

  const runStartedAt = Date.now();
  let globalIdx = 0;

  for (const stage of plan.stages) {
    if (circuitBreakerReason) break;

    const stageOrdersTarget = Math.max(1, Math.round(plan.targetTotalOrders * stage.shareOrders));
    const stageDurationMs = Math.max(5000, Math.round(plan.targetDurationSec * stage.shareDuration * 1000));
    const stageLatencies = [];
    const stageStart = Date.now();
    const stagePendingPromises = [];
    let stageSent = 0;
    let stageAccepted = 0;
    let stageRuleRejected = 0;
    let stageErrors = 0;

    console.log(
      `▶ Iniciando ${stage.name}: alvo=${stageOrdersTarget} pedidos em ${Math.round(stageDurationMs / 1000)}s (burstRps=${stage.burstRps})`
    );

    const intervalMs = Math.max(40, Math.floor(stageDurationMs / stageOrdersTarget));
    let lastLogAt = Date.now();

    while (stageSent < stageOrdersTarget && !circuitBreakerReason) {
      const now = Date.now();
      const elapsedStage = now - stageStart;

      // Se burstRps > 0, dispara duas janelas curtas de rush dentro do estágio (nos primeiros 20% e nos 60%-75%)
      const progress = elapsedStage / stageDurationMs;
      const inBurstWindow = stage.burstRps > 0 && ((progress >= 0.15 && progress <= 0.28) || (progress >= 0.6 && progress <= 0.72));
      const burstPerQuarterSec = Math.max(1, Math.round(stage.burstRps / 4));
      const batchSize = inBurstWindow ? Math.min(burstPerQuarterSec, stageOrdersTarget - stageSent, 6) : 1;

      for (let b = 0; b < batchSize && stageSent < stageOrdersTarget; b++) {
        const myIdx = globalIdx++;
        stageSent++;
        const expectReject = myIdx % 33 === 32; // ~3% valida rejeição de showcase
        const p = dispatchSingleOrder(myIdx, expectReject).then((res) => {
          stageLatencies.push(res.latMs);
          if (res.ok) stageAccepted++;
          else if (res.ruleRejected) stageRuleRejected++;
          else stageErrors++;
        });
        stagePendingPromises.push(p);
      }

      let slowCheckDue = false;
      if (now - lastLogAt >= 15000) {
        const memMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
        const curP95 = percentile(stageLatencies.slice(-60), 95);
        const curErrPct = totalSent > 0 ? ((totalUnexpectedErrors / totalSent) * 100).toFixed(2) : "0.00";
        console.log(
          `   [${stage.name}] enviados=${totalSent}/${plan.targetTotalOrders} | inFlight=${inFlight} | p95=${curP95}ms | err=${curErrPct}% | kdsMsgs=${realtimeMessagesReceived} | rss=${memMb}MB`
        );
        lastLogAt = now;
        slowCheckDue = true;
      }

      circuitBreakerReason = evaluateCircuitBreaker(stageLatencies.slice(-50), slowCheckDue);
      if (circuitBreakerReason) {
        console.warn(`\n🛑 CIRCUIT BREAKER ACIONADO: ${circuitBreakerReason}\n`);
        break;
      }

      await sleep(inBurstWindow ? 250 : intervalMs);
    }

    await Promise.allSettled(stagePendingPromises);
    const stageElapsedSec = Number(((Date.now() - stageStart) / 1000).toFixed(2));
    stageSummaries.push({
      stage: stage.name,
      elapsedSec: stageElapsedSec,
      sent: stageSent,
      accepted: stageAccepted,
      ruleRejected: stageRuleRejected,
      unexpectedErrors: stageErrors,
      p50Ms: percentile(stageLatencies, 50),
      p95Ms: percentile(stageLatencies, 95),
      p99Ms: percentile(stageLatencies, 99),
    });
  }

  // Aguarda breve janela para últimos eventos Realtime KDS chegarem
  await sleep(2500);

  // Verificação final de consistência / duplicidade no banco via admin autenticado
  let dbVerifiedCount = 0;
  let dbDupOrderNumbers = 0;
  try {
    for (const [tenantId, idSet] of createdIdsByTenant.entries()) {
      const adm = adminByTenantId.get(tenantId);
      if (!adm || idSet.size === 0) continue;
      const { data: rows } = await adm
        .from("orders")
        .select("id, order_number")
        .eq("tenant_id", tenantId)
        .ilike("notes", `${runTag}%`);
      if (rows) {
        dbVerifiedCount += rows.length;
        const seen = new Set();
        for (const r of rows) {
          if (seen.has(r.order_number)) dbDupOrderNumbers++;
          seen.add(r.order_number);
        }
      }
    }
  } finally {
    // Fecha canais Realtime KDS
    for (const item of kdsChannels) {
      try {
        await item.client.removeChannel(item.channel);
      } catch (_) {
        // ignora erro no shutdown
      }
    }

    // Limpeza dos pedidos sintéticos (preservando lojas e dados originais)
    var cleanedOrders = 0;
    if (args.cleanup) {
      console.log("\n🧹 Removendo pedidos sintéticos da carga nos tenants de teste...");
      for (const [tenantId, idSet] of createdIdsByTenant.entries()) {
        const adm = adminByTenantId.get(tenantId);
        if (!adm) continue;
        const ids = Array.from(idSet);
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50);
          await adm.from("print_jobs").delete().in("order_id", chunk);
          await adm.from("order_items").delete().in("order_id", chunk);
          await adm.from("orders").delete().in("id", chunk);
          cleanedOrders += chunk.length;
        }
        await adm.from("orders").delete().eq("tenant_id", tenantId).ilike("notes", `${runTag}%`);
      }
      console.log(`   🧹 ${cleanedOrders} pedido(s) sintético(s) removidos.`);
    }
  }

  const totalElapsedSec = Number(((Date.now() - runStartedAt) / 1000).toFixed(2));
  const monitoredExpectedCount = monitoredOrderIds.size;
  const kdsReceivedCount = realtimeLatencies.length;
  const kdsDeliveryRatePct = monitoredExpectedCount > 0 ? Number(((kdsReceivedCount / monitoredExpectedCount) * 100).toFixed(2)) : 0;

  const finalReport = {
    runTag,
    profile: plan.name,
    abortedByCircuitBreaker: circuitBreakerReason,
    durationSec: totalElapsedSec,
    throughputOrdersPerSec: Number((totalSent / Math.max(1, totalElapsedSec)).toFixed(2)),
    totals: {
      sent: totalSent,
      accepted: totalAccepted,
      idempotentReplaysVerified: totalIdempotentReplays,
      ruleRejectedExpected: totalRuleRejected,
      unexpectedErrors: totalUnexpectedErrors,
      errorRatePct: Number(((totalUnexpectedErrors / Math.max(1, totalSent)) * 100).toFixed(3)),
      rateLimited429: totalRateLimited429,
      clientOrderNumberCollisions: totalOrderNumberCollisions,
      dbVerifiedOrderCount: dbVerifiedCount,
      dbDupOrderNumbers,
      cleanedOrders,
    },
    latencyMs: {
      p50: percentile(allLatencies, 50),
      p95: percentile(allLatencies, 95),
      p99: percentile(allLatencies, 99),
      max: allLatencies.length ? Math.max(...allLatencies) : 0,
      spikesAboveThreshold: latencySpikes,
    },
    realtimeKds: {
      channelsOpened: kdsChannels.length,
      channelErrors: realtimeChannelErrors,
      messagesReceived: realtimeMessagesReceived,
      monitoredOrdersExpected: monitoredExpectedCount,
      kdsMatchedEvents: kdsReceivedCount,
      kdsDeliveryRatePct,
      kdsLatencyMs: {
        p50: percentile(realtimeLatencies, 50),
        p95: percentile(realtimeLatencies, 95),
        p99: percentile(realtimeLatencies, 99),
      },
    },
    workerResources: {
      rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
    },
    stages: stageSummaries,
    sampleUnexpectedErrors,
  };

  const outPath = path.resolve(__dirname, "last_phase2_load_report.json");
  fs.writeFileSync(outPath, JSON.stringify(finalReport, null, 2));

  console.log("\n=========================================================================");
  console.log("📊 RESUMO FASE 2 — CARGA SUSTENTADA");
  console.log(JSON.stringify(finalReport, null, 2));
  console.log(`Relatório salvo em: ${outPath}`);
  console.log("=========================================================================\n");

  if (circuitBreakerReason || totalUnexpectedErrors > 0 && (totalUnexpectedErrors / Math.max(1, totalSent)) * 100 > args.maxErrorRatePct || dbDupOrderNumbers > 0 || totalOrderNumberCollisions > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro fatal na Fase 2:", err);
  process.exit(1);
});
