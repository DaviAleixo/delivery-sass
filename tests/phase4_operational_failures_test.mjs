/**
 * FASE 4 — TESTES DE FALHAS OPERACIONAIS E RECUPERAÇÃO
 * Arquivo: tests/phase4_operational_failures_test.mjs
 * Execução: node tests/phase4_operational_failures_test.mjs
 *
 * IMPORTANTE: Roda 100% isolado (proxy local fault-injector + subprocesso Spooler em porta efêmera),
 * SEM desligar a internet do Windows nem reiniciar o computador.
 *
 * Cenários cobertos:
 * 1. Queda de internet do estabelecimento & perda temporária de conexão com Supabase (proxy fault-injector)
 * 2. Reinicialização do navegador (recuperação idempotente de checkout + catch-up FIFO)
 * 3. Fechamento inesperado do KDS (reconciliação de pedidos criados durante a queda)
 * 4. Realtime desconectado e reconectado (quebra de socket -> eventos perdidos -> catch-up + retomada live)
 * 5. Dois operadores alterando o mesmo pedido (bloqueio terminal cancelado/entregue via trigger DB)
 * 6. Impressora desligada/inexistente + distinção de 3 etapas (Spooler -> Windows Queue -> Limite Físico)
 * 7. Spooler encerrado / reinício no meio da impressão + persistência/flush de pendingAcks após queda de rede
 * 8. Atomicidade entre registro do pedido e criação de print_jobs (aguardando_pagamento -> pendente)
 */

import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { getOrCreateCheckoutOrderId } from "../src/utils/checkoutIdempotency.js";

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

function makeClient(url = SUPABASE_URL) {
  return createClient(url, SUPABASE_ANON_KEY, {
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
    throw new Error(`Falha login admin (${slug}): ${JSON.stringify(body)}`);
  }
  await client.auth.setSession(body.session);
  return { client, session: body.session };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Proxy HTTP local isolado para simular queda de internet / Supabase apenas no processo de teste.
 */
async function startFaultProxy(targetBaseUrl) {
  const target = new URL(targetBaseUrl);
  let offline = false;
  let blockActionSubstring = null;
  let blockedHits = 0;

  const server = http.createServer(async (req, res) => {
    if (offline || (blockActionSubstring && req.url.includes(blockActionSubstring))) {
      blockedHits++;
      res.writeHead(503, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Simulated isolated network outage (proxy offline)" }));
    }

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const bodyBuf = Buffer.concat(chunks);

    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];

    try {
      const upstreamRes = await fetch(`${target.origin}${req.url}`, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : bodyBuf,
      });
      const resBuf = Buffer.from(await upstreamRes.arrayBuffer());
      const outHeaders = {};
      upstreamRes.headers.forEach((v, k) => {
        if (!["content-encoding", "transfer-encoding", "connection"].includes(k.toLowerCase())) {
          outHeaders[k] = v;
        }
      });
      res.writeHead(upstreamRes.status, outHeaders);
      res.end(resBuf);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    setOffline: (val) => {
      offline = Boolean(val);
    },
    setBlockedSubstring: (sub) => {
      blockActionSubstring = sub;
    },
    getBlockedHits: () => blockedHits,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function startSpoolerSubprocess({ port, configFile, supabaseUrl }) {
  const child = spawn(process.execPath, [path.resolve(__dirname, "../desktop-spooler/server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      SPOOLER_CONFIG_FILE: configFile,
      PEDEMULEKE_SUPABASE_URL: supabaseUrl,
      PEDEMULEKE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (d) => (logs += d.toString()));
  child.stderr.on("data", (d) => (logs += d.toString()));
  return {
    child,
    getLogs: () => logs,
    waitReady: async () => {
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/status`);
          if (res.ok) return await res.json();
        } catch {}
        await sleep(200);
      }
      throw new Error(`Spooler subprocess did not boot on port ${port}: ${logs}`);
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
  const runTag = `PHASE4_OPS_${Date.now()}`;
  const createdOrderIds = [];
  const createdSectorIds = [];
  const tempFiles = [];
  let spoolerProc = null;
  const proxy = await startFaultProxy(SUPABASE_URL);

  const { client: adminClient, session: adminSession } = await loginAdmin("test-empresa-04");
  const { data: tenant } = await adminClient
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", "test-empresa-04")
    .single();

  const { data: products } = await anon
    .from("products")
    .select("id, name, price")
    .eq("tenant_id", tenant.id)
    .eq("available", true)
    .limit(1);
  const sampleProduct = products[0];

  console.log("=========================================================================");
  console.log("🛠️  FASE 4 — TESTES DE FALHAS OPERACIONAIS (ISOLADO)");
  console.log(`🏪 Tenant: ${tenant.slug} (${tenant.id}) | Proxy isolado: ${proxy.url}`);
  console.log("=========================================================================\n");

  try {
    // -----------------------------------------------------------------------
    // CENÁRIO 1 & 2: Queda de internet / perda temporária Supabase + reinício do navegador
    // -----------------------------------------------------------------------
    {
      const memStorage = new Map();
      globalThis.window = {
        sessionStorage: {
          getItem: (k) => (memStorage.has(k) ? memStorage.get(k) : null),
          setItem: (k, v) => memStorage.set(k, String(v)),
          removeItem: (k) => memStorage.delete(k),
        },
      };

      const cart = [{ id: sampleProduct.id, quantity: 1, notes: "sem cebola", additionals: [] }];
      const stableOrderId = getOrCreateCheckoutOrderId(tenant.slug, cart);
      const faultClient = makeClient(proxy.url);

      // 1A) Internet cai completamente para o projeto
      proxy.setOffline(true);
      const offlineRes = await faultClient.rpc("create_public_order", {
        p_order_id: stableOrderId,
        p_tenant_id: tenant.id,
        p_customer_name: "Offline Recovery",
        p_customer_phone: "31999994001",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Offline, 1",
        p_payment_method: "pix",
        p_items: [{ product_id: sampleProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S1`,
      });

      // 1B) Internet volta; navegador é fechado e reaberto mantendo sessionStorage do checkout
      proxy.setOffline(false);
      const recoveredIdAfterReload = getOrCreateCheckoutOrderId(tenant.slug, cart);
      delete globalThis.window;

      const onlineFirst = await faultClient.rpc("create_public_order", {
        p_order_id: recoveredIdAfterReload,
        p_tenant_id: tenant.id,
        p_customer_name: "Offline Recovery",
        p_customer_phone: "31999994001",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Offline, 1",
        p_payment_method: "pix",
        p_items: [{ product_id: sampleProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S1`,
      });
      createdOrderIds.push(onlineFirst.data?.order_id);

      // Replay após reconexão / F5
      const onlineReplay = await faultClient.rpc("create_public_order", {
        p_order_id: recoveredIdAfterReload,
        p_tenant_id: tenant.id,
        p_customer_name: "Offline Recovery",
        p_customer_phone: "31999994001",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Offline, 1",
        p_payment_method: "pix",
        p_items: [{ product_id: sampleProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S1`,
      });

      assertTest(
        "1 & 2. Queda isolada de internet/Supabase + reinicialização do navegador recuperam pedido sem duplicidade",
        Boolean(offlineRes.error) &&
          proxy.getBlockedHits() >= 1 &&
          recoveredIdAfterReload === stableOrderId &&
          onlineFirst.data?.success === true &&
          onlineFirst.data?.idempotent_replay === false &&
          onlineReplay.data?.idempotent_replay === true &&
          onlineReplay.data?.order_number === onlineFirst.data?.order_number,
        `offlineBlockedHits=${proxy.getBlockedHits()}, recoveredSameUUID=${recoveredIdAfterReload === stableOrderId}, orderNum=${onlineFirst.data?.order_number}, replay=${onlineReplay.data?.idempotent_replay}`
      );
    }

    // -----------------------------------------------------------------------
    // CENÁRIO 3 & 4: Fechamento inesperado do KDS + Realtime desconectado e reconectado
    // -----------------------------------------------------------------------
    {
      const liveEvents = [];
      await adminClient.realtime.setAuth(adminSession.access_token);

      const waitSub = (client, chName) =>
        new Promise((resolve, reject) => {
          let subOk = false;
          let pgOk = false;
          const maybe = () => {
            if (subOk && pgOk) resolve(ch);
          };
          const ch = client
            .channel(chName)
            .on("system", {}, (s) => {
              if (s?.extension === "postgres_changes" && s?.status === "ok") {
                pgOk = true;
                maybe();
              }
            })
            .on(
              "postgres_changes",
              { event: "INSERT", schema: "public", table: "orders", filter: `tenant_id=eq.${tenant.id}` },
              (p) => {
                if (String(p?.new?.notes || "").includes(`${runTag}_S34`)) liveEvents.push(p.new);
              }
            )
            .subscribe((st) => {
              if (st === "SUBSCRIBED") {
                subOk = true;
                maybe();
              } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") {
                reject(new Error(`Realtime ${st}`));
              }
            });
          setTimeout(() => reject(new Error("Realtime handshake timeout")), 8000);
        });

      const ch1 = await waitSub(adminClient, `kds_drop_1_${Date.now()}`);

      // Evento 1 com Realtime ativo
      const o1 = await anon.rpc("create_public_order", {
        p_tenant_id: tenant.id,
        p_customer_name: "KDS Online #1",
        p_customer_phone: "31999994002",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua KDS, 1",
        p_payment_method: "pix",
        p_items: [{ product_id: sampleProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S34_1`,
      });
      createdOrderIds.push(o1.data?.order_id);

      for (let i = 0; i < 20 && liveEvents.length < 1; i++) await sleep(150);

      // Simula fechamento inesperado do KDS + queda do WebSocket Realtime
      await adminClient.removeChannel(ch1);
      await adminClient.realtime.disconnect();

      // Pedido #2 entra enquanto KDS está fechado / Realtime desconectado
      const o2 = await anon.rpc("create_public_order", {
        p_tenant_id: tenant.id,
        p_customer_name: "KDS Offline #2",
        p_customer_phone: "31999994003",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua KDS, 2",
        p_payment_method: "pix",
        p_items: [{ product_id: sampleProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S34_2`,
      });
      createdOrderIds.push(o2.data?.order_id);

      // KDS reabre (nova sessão/cliente) + Realtime reconecta + executa catch-up FIFO das últimas 12h
      const { client: reopenClient, session: reopenSession } = await loginAdmin("test-empresa-04");
      await reopenClient.realtime.setAuth(reopenSession.access_token);
      const ch2 = await waitSub(reopenClient, `kds_reopen_2_${Date.now()}`);

      const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: catchupOrders } = await reopenClient
        .from("orders")
        .select("id, order_number, created_date, status, print_status")
        .eq("tenant_id", tenant.id)
        .in("print_status", ["pending", "failed"])
        .gte("created_date", cutoff)
        .order("created_date", { ascending: true });

      const recoveredO2 = (catchupOrders || []).some((o) => o.id === o2.data?.order_id);

      // Pedido #3 chega ao vivo após reconexão Realtime
      const o3 = await anon.rpc("create_public_order", {
        p_tenant_id: tenant.id,
        p_customer_name: "KDS Reconnect #3",
        p_customer_phone: "31999994004",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua KDS, 3",
        p_payment_method: "pix",
        p_items: [{ product_id: sampleProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S34_3`,
      });
      createdOrderIds.push(o3.data?.order_id);

      const liveDeadline = Date.now() + 6000;
      while (Date.now() < liveDeadline && !liveEvents.some((e) => e.id === o3.data?.order_id)) {
        await sleep(150);
      }
      await reopenClient.removeChannel(ch2);
      await reopenClient.realtime.disconnect();

      const gotO1 = liveEvents.some((e) => e.id === o1.data?.order_id);
      const gotO3 = liveEvents.some((e) => e.id === o3.data?.order_id);

      assertTest(
        "3 & 4. Fechamento do KDS + desconexão/reconexão Realtime: pedido perdido na queda recuperado via catch-up + retomada live",
        gotO1 && recoveredO2 && gotO3,
        `liveBeforeDrop=${gotO1}, recoveredWhileDown=${recoveredO2}, liveAfterReconnect=${gotO3}`
      );
    }

    // -----------------------------------------------------------------------
    // CENÁRIO 5: Dois operadores alterando o mesmo pedido (terminal guard)
    // -----------------------------------------------------------------------
    {
      const { data: opOrd } = await anon.rpc("create_public_order", {
        p_tenant_id: tenant.id,
        p_customer_name: "Operadores Concorrentes",
        p_customer_phone: "31999994005",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Operador, 5",
        p_payment_method: "pix",
        p_items: [{ product_id: sampleProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S5`,
      });
      createdOrderIds.push(opOrd.order_id);

      // Operador A cancela; logo em seguida (ou em corrida) Operador B no KDS tenta mover para 'preparando'
      const { error: cancelErr } = await adminClient
        .from("orders")
        .update({ status: "cancelado", cancel_reason: "Cliente desistiu" })
        .eq("id", opOrd.order_id);

      const { error: staleReactivateErr } = await adminClient
        .from("orders")
        .update({ status: "preparando" })
        .eq("id", opOrd.order_id);

      const { data: ordState } = await adminClient
        .from("orders")
        .select("status")
        .eq("id", opOrd.order_id)
        .single();

      // Testa também regressão de 'entregue' -> 'preparando'
      const { data: delivOrd } = await anon.rpc("create_public_order", {
        p_tenant_id: tenant.id,
        p_customer_name: "Entregue Guard",
        p_customer_phone: "31999994006",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Operador, 6",
        p_payment_method: "pix",
        p_items: [{ product_id: sampleProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S5B`,
      });
      createdOrderIds.push(delivOrd.order_id);

      await adminClient.from("orders").update({ status: "entregue" }).eq("id", delivOrd.order_id);
      const { error: regressErr } = await adminClient
        .from("orders")
        .update({ status: "preparando" })
        .eq("id", delivOrd.order_id);
      const { data: delivState } = await adminClient
        .from("orders")
        .select("status")
        .eq("id", delivOrd.order_id)
        .single();

      assertTest(
        "5. Dois operadores no mesmo pedido: cancelado não ressuscita e entregue não regride para preparando",
        !cancelErr &&
          Boolean(staleReactivateErr) &&
          ordState?.status === "cancelado" &&
          Boolean(regressErr) &&
          delivState?.status === "entregue",
        `cancelReactivateBlocked=${staleReactivateErr?.message || "none"}, status1=${ordState?.status}, deliveredRegressBlocked=${regressErr?.message || "none"}, status2=${delivState?.status}`
      );
    }

    // -----------------------------------------------------------------------
    // CENÁRIO 6, 7 & 8: Impressora desligada/inexistente, distinção 3 etapas,
    //                   Spooler encerrado / reinício + pendingAcks com proxy offline
    // -----------------------------------------------------------------------
    {
      const tmpConfigPath = path.join(os.tmpdir(), `pm_test_spooler_cfg_${Date.now()}.json`);
      tempFiles.push(tmpConfigPath);
      const testPort = 19100 + Math.floor(Math.random() * 400);

      // Cria setor de teste com impressora inexistente para testar falha controlada do Windows WinSpool
      const { data: sec } = await adminClient
        .from("production_sectors")
        .insert({
          tenant_id: tenant.id,
          name: `Setor Falha ${Date.now()}`,
          printer_name: "PEDEMULEKE_IMPRESSORA_DESLIGADA_999",
          printer_type: "thermal_raw",
          paper_width: "80mm",
          content_mode: "production_only",
          operation_mode: "both",
          copies: 1,
          is_active: true,
        })
        .select("id")
        .single();
      if (sec?.id) createdSectorIds.push(sec.id);

      // Subprocesso Spooler isolado apontando para nosso proxy HTTP
      const fakePendingJobId = crypto.randomUUID();
      fs.writeFileSync(
        tmpConfigPath,
        JSON.stringify({
          selectedPrinter: "PEDEMULEKE_IMPRESSORA_DESLIGADA_999",
          paperWidth: "80mm",
          pendingAcks: [],
        }),
        "utf-8"
      );

      spoolerProc = startSpoolerSubprocess({
        port: testPort,
        configFile: tmpConfigPath,
        supabaseUrl: proxy.url,
      });
      const bootStatus = await spoolerProc.waitReady();

      // 6A) Testa envio direto ao Spooler HTTP local quando a impressora está desligada/inexistente no Windows
      const printRes = await fetch(`http://127.0.0.1:${testPort}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: { id: "ord_spool_fail_1", order_number: 888, customer_name: "Teste Impressora Off", items: [] },
          printerName: "PEDEMULEKE_IMPRESSORA_DESLIGADA_999",
          copies: 1,
        }),
      });
      const printBody = await printRes.json();
      const statusAfterFail = await fetch(`http://127.0.0.1:${testPort}/status`).then((r) => r.json());

      // 6B) Pareia o Spooler na nuvem pelo proxy, cria pedido com print_job e simula morte súbita (SIGKILL) + reboot
      const { data: pairCodeRes } = await adminClient.rpc("generate_spooler_pairing_code", {
        p_tenant_id: tenant.id,
      });
      const pairHttpRes = await fetch(`http://127.0.0.1:${testPort}/cloud/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairingCode: pairCodeRes.pairing_code,
          supabaseUrl: proxy.url,
          anonKey: SUPABASE_ANON_KEY,
        }),
      });
      const pairBody = await pairHttpRes.json();

      // Aguarda um ciclo para ver o Spooler tentar imprimir o job via cloud poll e marcar 'failed' (impressora inexistente!)
      const { data: pOrd } = await anon.rpc("create_public_order", {
        p_tenant_id: tenant.id,
        p_customer_name: "Spooler Cloud Fail",
        p_customer_phone: "31999994007",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Impressora, 7",
        p_payment_method: "pix",
        p_items: [{ product_id: sampleProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S6`,
      });
      createdOrderIds.push(pOrd.order_id);

      // Garante um print_job pendente roteado para a impressora inexistente
      await adminClient.from("print_jobs").delete().eq("order_id", pOrd.order_id);
      const { data: insertedJob } = await adminClient
        .from("print_jobs")
        .insert({
          tenant_id: tenant.id,
          order_id: pOrd.order_id,
          sector_key: sec?.id ? String(sec.id) : "fail_probe",
          sector_name: "Setor Falha Teste",
          printer_name: "PEDEMULEKE_IMPRESSORA_DESLIGADA_999",
          printer_type: "thermal_raw",
          paper_width: "80mm",
          content_mode: "production_only",
          copies: 1,
          items_payload: [{ product_id: sampleProduct.id, product_name: sampleProduct.name, quantity: 1 }],
          status: "pending",
        })
        .select("id, status")
        .single();

      // Espera o cloud poll do Spooler processar e reportar failed no banco (até 20s sob carga da suíte consolidada)
      let jobAfterSpool = null;
      for (let i = 0; i < 50; i++) {
        const { data: pj } = await adminClient
          .from("print_jobs")
          .select("id, status, attempts, error_message")
          .eq("id", insertedJob.id)
          .single();
        if (pj && (pj.status === "failed" || pj.status === "printed")) {
          jobAfterSpool = pj;
          break;
        }
        await sleep(400);
      }

      // 7) Encerra abruptamente (SIGKILL), injeta um pendingAck persistido (simulando queda de internet antes do ACK),
      //    e reinicia o Spooler (simulando reinicialização do PC) verificando que o pendingAck é enviado antes do poll!
      spoolerProc.kill();
      await sleep(300);

      const { data: ackOrd } = await anon.rpc("create_public_order", {
        p_tenant_id: tenant.id,
        p_customer_name: "Spooler Reboot ACK",
        p_customer_phone: "31999994008",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Reboot, 8",
        p_payment_method: "pix",
        p_items: [{ product_id: sampleProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S7_ACK`,
      });
      createdOrderIds.push(ackOrd.order_id);

      await adminClient.from("print_jobs").delete().eq("order_id", ackOrd.order_id);
      const { data: pendingAckJob } = await adminClient
        .from("print_jobs")
        .insert({
          tenant_id: tenant.id,
          order_id: ackOrd.order_id,
          sector_key: "reboot_ack_test",
          sector_name: "Caixa Reboot",
          printer_type: "thermal_raw",
          paper_width: "80mm",
          content_mode: "full_ticket",
          copies: 1,
          items_payload: [{ product_id: sampleProduct.id, product_name: sampleProduct.name, quantity: 1 }],
          status: "printing",
          attempts: 1,
        })
        .select("id")
        .single();

      const persistedCfg = JSON.parse(fs.readFileSync(tmpConfigPath, "utf-8"));
      persistedCfg.pendingAcks = [
        {
          jobId: pendingAckJob.id,
          status: "printed",
          errorMessage: null,
          deliveryStage: "windows_spool_accepted",
          queuedAt: new Date().toISOString(),
        },
      ];
      fs.writeFileSync(tmpConfigPath, JSON.stringify(persistedCfg, null, 2), "utf-8");

      spoolerProc = startSpoolerSubprocess({
        port: testPort,
        configFile: tmpConfigPath,
        supabaseUrl: proxy.url,
      });
      await spoolerProc.waitReady();

      let ackFlushedJob = null;
      for (let i = 0; i < 20; i++) {
        const { data: pj } = await adminClient
          .from("print_jobs")
          .select("id, status, printed_at")
          .eq("id", pendingAckJob.id)
          .single();
        if (pj?.status === "printed") {
          ackFlushedJob = pj;
          break;
        }
        await sleep(300);
      }

      const statusAfterReboot = await fetch(`http://127.0.0.1:${testPort}/status`).then((r) => r.json());
      const { data: ordPrintState } = await adminClient
        .from("orders")
        .select("print_status, print_count")
        .eq("id", ackOrd.order_id)
        .single();

      spoolerProc.kill();
      spoolerProc = null;

      assertTest(
        "6. Impressora desligada/inexistente rejeitada explicitamente na etapa Windows + diferenciação das 3 etapas",
        printRes.status === 500 &&
          printBody.deliveryStage === "windows_spool_rejected" &&
          printBody.physicalConfirmationSupported === false &&
          statusAfterFail.lastPrintStage === "windows_spool_rejected" &&
          bootStatus.physicalConfirmationSupported === false &&
          pairBody.cloudConnected === true &&
          jobAfterSpool?.status === "failed",
        `http=${printRes.status}, stage=${printBody.deliveryStage}, physicalTelemetry=${printBody.physicalConfirmationSupported}, cloudJobStatus=${jobAfterSpool?.status}, attempts=${jobAfterSpool?.attempts}`
      );

      assertTest(
        "7. Spooler encerrado + reinicialização recupera e envia pendingAcks pendentes sem reimprimir nem duplicar print_count",
        ackFlushedJob?.status === "printed" &&
          statusAfterReboot.pendingAcksCount === 0 &&
          ordPrintState?.print_status === "printed" &&
          Number(ordPrintState?.print_count) === 1,
        `flushedJob=${ackFlushedJob?.status}, pendingAcksAfterReboot=${statusAfterReboot.pendingAcksCount}, printCount=${ordPrintState?.print_count}`
      );
    }

    // -----------------------------------------------------------------------
    // CENÁRIO 8: Transição atômica pedido -> print_jobs (aguardando_pagamento vs pendente)
    // -----------------------------------------------------------------------
    {
      const { data: waitOrd } = await anon.rpc("create_public_order", {
        p_tenant_id: tenant.id,
        p_customer_name: "Atomicity Pix Jobs",
        p_customer_phone: "31999994009",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Trigger, 9",
        p_payment_method: "pix",
        p_items: [{ product_id: sampleProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S8`,
      });
      createdOrderIds.push(waitOrd.order_id);

      // Coloca pedido em aguardando_pagamento sem jobs, depois simula transição para 'pendente'
      await adminClient.from("print_jobs").delete().eq("order_id", waitOrd.order_id);
      await adminClient.from("orders").update({ status: "aguardando_pagamento" }).eq("id", waitOrd.order_id);

      const { count: jobsWhileWaiting } = await adminClient
        .from("print_jobs")
        .select("id", { count: "exact", head: true })
        .eq("order_id", waitOrd.order_id);

      // Garante ao menos 1 setor ativo para validar criação transacional pelo trigger
      const { data: activeSecs } = await adminClient
        .from("production_sectors")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true);

      await adminClient.from("orders").update({ status: "pendente" }).eq("id", waitOrd.order_id);
      const { count: jobsAfterConfirm } = await adminClient
        .from("print_jobs")
        .select("id", { count: "exact", head: true })
        .eq("order_id", waitOrd.order_id);

      assertTest(
        "8. Registro do pedido e criação de print_jobs sincronizam atomicamente na transição de status",
        jobsWhileWaiting === 0 && ((activeSecs?.length || 0) === 0 || jobsAfterConfirm > 0),
        `whileWaiting=${jobsWhileWaiting}, afterPendente=${jobsAfterConfirm}, activeSectors=${activeSecs?.length || 0}`
      );
    }
  } finally {
    if (spoolerProc) spoolerProc.kill();
    await proxy.close();
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }

    console.log("\n🧹 Limpando dados sintéticos da Fase 4...");
    for (let i = 0; i < createdOrderIds.length; i += 50) {
      const chunk = createdOrderIds.slice(i, i + 50).filter(Boolean);
      if (!chunk.length) continue;
      await adminClient.from("print_jobs").delete().in("order_id", chunk);
      await adminClient.from("order_items").delete().in("order_id", chunk);
      await adminClient.from("orders").delete().in("id", chunk);
    }
    if (createdSectorIds.length > 0) {
      await adminClient.from("production_sectors").delete().in("id", createdSectorIds);
    }
    await adminClient.from("orders").delete().eq("tenant_id", tenant.id).ilike("notes", `${runTag}%`);
    console.log(`   🧹 Limpos ${createdOrderIds.filter(Boolean).length} pedido(s) e ${createdSectorIds.length} setor(es).`);
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n=== RESUMO FASE 4 FALHAS OPERACIONAIS: ${passed}/${results.length} aprovados ===`);
  if (passed !== results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro fatal na Fase 4:", err);
  process.exit(1);
});

