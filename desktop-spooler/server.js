import http from "http";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { listWindowsPrinters, sendTextToPrinter } from "./printerService.js";
import { formatOrderToThermalText } from "./ticketFormatter.js";

const DEFAULT_SUPABASE_URL = "https://zecuwijuiqsaoeafonsv.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplY3V3aWp1aXFzYW9lYWZvbnN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MjUwMTMsImV4cCI6MjEwNzIwMTAxM30.MtFRYa2nlrIDWqVWHj2WVlIwjmpuj8d_O8Xv5TG_x3I";
const CLOUD_POLL_INTERVAL_MS = 4000;

let appDir = process.cwd();
try {
  if (process.execPath && process.execPath.endsWith(".exe") && !process.execPath.toLowerCase().includes("node.exe")) {
    appDir = path.dirname(process.execPath);
  } else if (typeof import.meta?.url !== "undefined") {
    appDir = path.dirname(fileURLToPath(import.meta.url));
  }
} catch (_e) {
  appDir = process.cwd();
}

const PORT = process.env.PORT || 9100;
const CONFIG_FILE = process.env.SPOOLER_CONFIG_FILE || path.join(appDir, "spooler-config.json");

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      if (!Array.isArray(parsed.pendingAcks)) parsed.pendingAcks = [];
      return parsed;
    }
  } catch (_e) {}
  return { selectedPrinter: "", paperWidth: "80mm", pendingAcks: [] };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("Erro ao salvar spooler-config.json:", err);
  }
}

let currentConfig = loadConfig();
let isCloudPolling = false;
let lastCloudPollAt = null;
let lastCloudPrintAt = null;
let lastPrintStage = null;

async function callSupabaseRpc(rpcName, params, cfg = currentConfig) {
  const baseUrl = String(cfg.supabaseUrl || process.env.PEDEMULEKE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const anonKey = String(cfg.anonKey || process.env.PEDEMULEKE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();

  const res = await fetch(`${baseUrl}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(params || {}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

async function pairWithCode(pairingCode, overrideCloud = {}) {
  const code = String(pairingCode || "").trim().toUpperCase();
  if (!code) {
    throw new Error("Codigo de pareamento invalido.");
  }

  const rpcRes = await callSupabaseRpc("spooler_pair", { p_pairing_code: code }, overrideCloud);
  if (!rpcRes?.success || !rpcRes?.stationToken) {
    throw new Error(rpcRes?.error || "Codigo de pareamento nao encontrado.");
  }

  currentConfig.stationToken = rpcRes.stationToken;
  currentConfig.tenantId = rpcRes.tenantId || null;
  currentConfig.tenantName = rpcRes.tenantName || null;
  currentConfig.tenantSlug = rpcRes.tenantSlug || null;
  if (overrideCloud.supabaseUrl) currentConfig.supabaseUrl = overrideCloud.supabaseUrl;
  if (overrideCloud.anonKey) currentConfig.anonKey = overrideCloud.anonKey;
  saveConfig(currentConfig);

  console.log(`\n🟢 PAREADO COM A LOJA: ${currentConfig.tenantName || currentConfig.tenantSlug}!`);
  console.log("   Agora os pedidos imprimem mesmo se o navegador estiver fechado.\n");
  return rpcRes;
}

function enqueuePendingAck(entry) {
  if (!Array.isArray(currentConfig.pendingAcks)) currentConfig.pendingAcks = [];
  if (!currentConfig.pendingAcks.some((a) => a.jobId === entry.jobId)) {
    currentConfig.pendingAcks.push(entry);
    if (currentConfig.pendingAcks.length > 200) {
      currentConfig.pendingAcks = currentConfig.pendingAcks.slice(-200);
    }
    saveConfig(currentConfig);
  }
}

async function flushPendingAcks() {
  if (!currentConfig.stationToken || !Array.isArray(currentConfig.pendingAcks) || currentConfig.pendingAcks.length === 0) {
    return;
  }
  const remaining = [];
  for (let i = 0; i < currentConfig.pendingAcks.length; i++) {
    const ack = currentConfig.pendingAcks[i];
    try {
      await callSupabaseRpc("spooler_ack", {
        p_station_token: currentConfig.stationToken,
        p_job_id: ack.jobId,
        p_status: ack.status,
        p_error_message: ack.errorMessage || null,
      });
    } catch (_err) {
      remaining.push(...currentConfig.pendingAcks.slice(i));
      break;
    }
  }
  currentConfig.pendingAcks = remaining;
  saveConfig(currentConfig);
}

async function pollCloudJobsOnce() {
  if (!currentConfig.stationToken || isCloudPolling) return;
  isCloudPolling = true;
  try {
    await flushPendingAcks();
    if (Array.isArray(currentConfig.pendingAcks) && currentConfig.pendingAcks.length > 0) {
      return;
    }

    const res = await callSupabaseRpc("spooler_poll", {
      p_station_token: currentConfig.stationToken,
    });
    lastCloudPollAt = new Date().toISOString();

    if (!res?.success) {
      if (String(res?.error || "").toLowerCase().includes("nao autorizada")) {
        console.warn("⚠️ Token de estacao revogado ou invalido. Refaca o pareamento no painel.");
      }
      return;
    }

    const jobs = Array.isArray(res.jobs) ? res.jobs : [];
    for (const job of jobs) {
      const paperWidth = job.paper_width || currentConfig.paperWidth || "80mm";
      const targetPrinter = job.printer_name || currentConfig.selectedPrinter || undefined;
      const copies = Math.max(1, Math.min(5, parseInt(job.copies, 10) || 1));

      const textToPrint = formatOrderToThermalText(job.order, {
        paperWidth,
        storeName: job.storeName || currentConfig.tenantName || job.order?.restaurant_name,
        sectorName: job.sector_id ? job.sector_name : undefined,
        contentMode: job.content_mode || "full_ticket",
        items: Array.isArray(job.items_payload) ? job.items_payload : undefined,
      });

      const sectorLabel = job.sector_name || "Geral";
      const orderNum = String(job.order?.order_number || job.order_id || "").slice(-6).toUpperCase();
      console.log(`[${new Date().toLocaleTimeString()}] ☁️ Imprimindo Nuvem #${orderNum} [${sectorLabel}] (${copies}x -> ${targetPrinter || "Padrao"})...`);

      let printResult = { success: false, deliveryStage: "spooler_received", error: "Falha desconhecida" };
      for (let i = 0; i < copies; i++) {
        printResult = await sendTextToPrinter(textToPrint, targetPrinter);
        if (!printResult.success) break;
      }

      lastPrintStage = printResult.deliveryStage || (printResult.success ? "windows_spool_accepted" : "windows_spool_rejected");
      if (printResult.success) {
        lastCloudPrintAt = new Date().toISOString();
      }

      const ackStatus = printResult.success ? "printed" : "failed";
      const ackErrMsg = printResult.success ? null : (printResult.error || "Erro ao enviar para impressora");
      try {
        await callSupabaseRpc("spooler_ack", {
          p_station_token: currentConfig.stationToken,
          p_job_id: job.id,
          p_status: ackStatus,
          p_error_message: ackErrMsg,
        });
      } catch (ackErr) {
        console.error("Erro ao confirmar ACK na nuvem (salvo para retry):", ackErr.message);
        enqueuePendingAck({
          jobId: job.id,
          status: ackStatus,
          errorMessage: ackErrMsg,
          deliveryStage: lastPrintStage,
          queuedAt: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    // Silencioso em quedas temporarias de rede para tentar novamente no proximo ciclo
    if (process.env.DEBUG_SPOOLER === "true") {
      console.error("[Cloud Poll Error]:", err.message);
    }
  } finally {
    isCloudPolling = false;
  }
}

// Inicializa detectando impressora padrão caso não esteja configurada ainda
listWindowsPrinters().then(({ defaultPrinter }) => {
  if (!currentConfig.selectedPrinter && defaultPrinter) {
    currentConfig.selectedPrinter = defaultPrinter;
    saveConfig(currentConfig);
  }
}).catch(() => {});

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const hostname = (parsed.hostname || "").toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (
      hostname === "pedemuleke.com" ||
      hostname.endsWith(".pedemuleke.com") ||
      hostname === "pedemuleke.com.br" ||
      hostname.endsWith(".pedemuleke.com.br")
    ) {
      return true;
    }

    const extraOrigins = [
      ...(Array.isArray(currentConfig.allowedOrigins) ? currentConfig.allowedOrigins : []),
      ...String(process.env.SPOOLER_ALLOWED_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ];
    return extraOrigins.includes(origin) || extraOrigins.includes(hostname);
  } catch {
    return false;
  }
}

function buildCorsHeaders(origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Spooler-Token",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin",
  };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function sendJson(res, statusCode, data, origin) {
  res.writeHead(statusCode, buildCorsHeaders(origin));
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const reply = (statusCode, data) => sendJson(res, statusCode, data, origin);

  const rawHost = String(req.headers.host || "").split(":")[0].toLowerCase();
  if (rawHost && rawHost !== "127.0.0.1" && rawHost !== "localhost") {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ error: "Host nao autorizado pelo Spooler PedeMuleke" }));
  }

  if (origin && !isAllowedOrigin(origin)) {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8", Vary: "Origin" });
    return res.end(JSON.stringify({ error: "Origem nao autorizada pelo Spooler PedeMuleke" }));
  }

  // Tratamento de CORS Preflight (com suporte a Private Network Access para sites HTTPS)
  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(origin));
    return res.end();
  }

  // Token opcional caso o lojista configure authToken no config.json
  if (currentConfig.authToken && ["POST", "PUT", "DELETE"].includes(req.method)) {
    const providedToken = req.headers["x-spooler-token"];
    if (providedToken !== currentConfig.authToken) {
      return reply(401, { error: "Token de autenticacao do Spooler invalido ou ausente" });
    }
  }

  // Bloqueia CSRF via <form> simples exigindo Content-Type application/json em métodos mutantes
  if (["POST", "PUT", "DELETE"].includes(req.method)) {
    const reqCt = String(req.headers["content-type"] || "").toLowerCase();
    if (!reqCt.includes("application/json")) {
      return reply(415, { error: "Content-Type application/json obrigatorio" });
    }
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // 1. Rota de Verificação de Status
  if (req.method === "GET" && (pathname === "/" || pathname === "/status" || pathname === "/health")) {
    return reply(200, {
      status: "online",
      service: "PedeMuleke Spooler",
      version: "2.0.0",
      selectedPrinter: currentConfig.selectedPrinter || "Padrao do Windows",
      paperWidth: currentConfig.paperWidth || "80mm",
      cloudConnected: Boolean(currentConfig.stationToken),
      tenantName: currentConfig.tenantName || null,
      lastCloudPollAt,
      lastCloudPrintAt,
      lastPrintStage,
      pendingAcksCount: Array.isArray(currentConfig.pendingAcks) ? currentConfig.pendingAcks.length : 0,
      physicalConfirmationSupported: false,
      timestamp: new Date().toISOString(),
    });
  }

  // 1b. Rotas de Pareamento Autonomo na Nuvem (Etapa 2)
  if (req.method === "POST" && pathname === "/cloud/pair") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (payload.stationToken) {
          currentConfig.stationToken = String(payload.stationToken).trim();
          currentConfig.tenantId = payload.tenantId || currentConfig.tenantId || null;
          currentConfig.tenantName = payload.tenantName || currentConfig.tenantName || null;
          currentConfig.tenantSlug = payload.tenantSlug || currentConfig.tenantSlug || null;
          if (payload.supabaseUrl) currentConfig.supabaseUrl = payload.supabaseUrl;
          if (payload.anonKey) currentConfig.anonKey = payload.anonKey;
          saveConfig(currentConfig);
          pollCloudJobsOnce();
          return reply(200, {
            success: true,
            cloudConnected: true,
            tenantName: currentConfig.tenantName,
          });
        }

        if (payload.pairingCode) {
          const info = await pairWithCode(payload.pairingCode, {
            supabaseUrl: payload.supabaseUrl,
            anonKey: payload.anonKey,
          });
          pollCloudJobsOnce();
          return reply(200, {
            success: true,
            cloudConnected: true,
            tenantName: info.tenantName,
          });
        }

        return reply(400, { error: "Informe pairingCode ou stationToken." });
      } catch (err) {
        return reply(400, { error: err?.message || "Erro ao parear" });
      }
    });
    return;
  }

  if (req.method === "POST" && pathname === "/cloud/unpair") {
    delete currentConfig.stationToken;
    delete currentConfig.tenantId;
    delete currentConfig.tenantName;
    delete currentConfig.tenantSlug;
    saveConfig(currentConfig);
    console.log("⚪ Pareamento em nuvem desconectado nesta estacao.");
    return reply(200, { success: true, cloudConnected: false });
  }

  // 2. Rota para Listar Impressoras do Windows
  if (req.method === "GET" && pathname === "/printers") {
    try {
      const { printers, defaultPrinter } = await listWindowsPrinters();
      return reply(200, {
        printers,
        defaultPrinter,
        selectedPrinter: currentConfig.selectedPrinter || defaultPrinter,
        paperWidth: currentConfig.paperWidth || "80mm",
      });
    } catch (err) {
      return reply(500, { error: err.message });
    }
  }

  // 3. Rota para Salvar Configuração (Trocar Impressora ou Largura do Papel)
  if (req.method === "POST" && pathname === "/config") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (payload.selectedPrinter !== undefined) {
          currentConfig.selectedPrinter = payload.selectedPrinter;
        }
        if (payload.paperWidth) {
          currentConfig.paperWidth = payload.paperWidth;
        }
        saveConfig(currentConfig);
        return reply(200, { success: true, config: currentConfig });
      } catch (_err) {
        return reply(400, { error: "JSON invalido" });
      }
    });
    return;
  }

  // 4. Rota Principal de Impressão de Pedido
  if (req.method === "POST" && pathname === "/print") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const order = payload.order || payload;

        if (!order || (!order.id && !payload.rawText)) {
          return reply(400, { error: "Pedido invalido" });
        }

        const paperWidth = payload.paperWidth || currentConfig.paperWidth || "80mm";
        const targetPrinter = payload.printerName || currentConfig.selectedPrinter || undefined;
        const sectorName = payload.sectorName || undefined;
        const contentMode = payload.contentMode || "full_ticket";
        const copies = Math.max(1, Math.min(5, parseInt(payload.copies, 10) || 1));

        // Se o cliente enviar o texto já formatado, usa direto. Senão formata o pedido térmico
        const textToPrint = payload.rawText || formatOrderToThermalText(order, {
          paperWidth,
          storeName: payload.storeName || order.restaurant_name,
          sectorName,
          contentMode,
          items: Array.isArray(payload.items) ? payload.items : undefined,
        });

        const sectorLog = sectorName ? ` [${sectorName}]` : "";
        console.log(`[${new Date().toLocaleTimeString()}] 🖨️ Imprimindo Pedido #${String(order.id || "").slice(-6).toUpperCase()}${sectorLog} (${copies}x -> ${targetPrinter || "Padrao"})...`);

        let lastResult = { success: false, error: "Nenhuma via processada" };
        for (let i = 0; i < copies; i++) {
          lastResult = await sendTextToPrinter(textToPrint, targetPrinter);
          if (!lastResult.success) break;
        }

        if (lastResult.success) {
          lastPrintStage = lastResult.deliveryStage || "windows_spool_accepted";
          return reply(200, {
            success: true,
            orderId: order.id,
            sectorName: sectorName || null,
            copies,
            printer: lastResult.printer,
            deliveryStage: lastPrintStage,
            physicalConfirmationSupported: false,
            printedAt: new Date().toISOString(),
          });
        } else {
          lastPrintStage = lastResult.deliveryStage || "windows_spool_rejected";
          return reply(500, {
            success: false,
            deliveryStage: lastPrintStage,
            physicalConfirmationSupported: false,
            error: lastResult.error,
          });
        }
      } catch (err) {
        console.error("Erro ao processar /print:", err);
        return reply(500, { error: err.message });
      }
    });
    return;
  }

  // 5. Rota de Teste de Impressão
  if (req.method === "POST" && pathname === "/test") {
    const targetPrinter = currentConfig.selectedPrinter || undefined;
    const is58 = currentConfig.paperWidth === "58mm";
    const width = is58 ? 32 : 42;
    const divider = "=".repeat(width);

    const testText = [
      divider,
      is58 ? "  TESTE IMPRESSAO SILENCIOSA" : "     TESTE DE IMPRESSAO SILENCIOSA    ",
      is58 ? "      PEDEMULEKE SPOOLER    " : "           PEDEMULEKE SPOOLER         ",
      divider,
      "",
      `Data/Hora: ${new Date().toLocaleString("pt-BR")}`,
      `Impressora: ${targetPrinter || "Padrao do Windows"}`,
      `Largura: ${currentConfig.paperWidth}`,
      `Status: Comunicacao 100% OK!`,
      "",
      "Se voce esta lendo esta comanda,",
      "sua impressao automatica silenciosa",
      "esta configurada com sucesso!",
      "",
      divider,
      "",
      "",
      "",
      "", // Espaço para avanço além da faca de corte
    ].join("\r\n");

    const result = await sendTextToPrinter(testText, targetPrinter);
    return reply(result.success ? 200 : 500, result);
  }

  // Rota desconhecida
  reply(404, { error: "Rota nao encontrada" });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ ERRO: A porta ${PORT} já está sendo utilizada por outra instância do Spooler ou programa.`);
    console.error("Verifique se o pedemuleke-spooler.exe já está aberto na barra de tarefas do Windows.\n");
  } else {
    console.error("Erro no servidor de impressão:", err);
  }
});

server.listen(PORT, "127.0.0.1", async () => {
  console.log("");
  console.log("===============================================================");
  console.log("   🟢 PEDEMULEKE SPOOLER v2.0 - IMPRESSAO AUTOMATICA           ");
  console.log("===============================================================");
  console.log(`   STATUS:        ONLINE E PRONTO PARA IMPRIMIR 🟢`);
  console.log(`   IMPRESSORA:    ${currentConfig.selectedPrinter || "Padrao do Windows"}`);
  console.log(`   BOBINA:        ${currentConfig.paperWidth}`);
  console.log(`   MODO NUVEM:    ${currentConfig.stationToken ? `CONECTADO (${currentConfig.tenantName || "Loja"})` : "Nao pareado (Somente aba aberta)"}`);
  console.log(`   PORTA LOCAL:   http://127.0.0.1:${PORT}`);
  console.log("---------------------------------------------------------------");
  console.log("   💡 DICA: Mantenha esta janela aberta durante o expediente.");
  if (!currentConfig.stationToken) {
    console.log("   Para imprimir com o navegador fechado, digite o codigo (ex: PM-ABC-123)");
    console.log("   e aperte ENTER, ou clique em 'Parear Nuvem' dentro do painel web.");
  } else {
    console.log("   Os pedidos imprimem mesmo com o navegador fechado!");
  }
  console.log("===============================================================");
  console.log("");

  const pairArg = process.argv.find((a) => a.startsWith("--pair="));
  if (pairArg) {
    const code = pairArg.slice("--pair=".length).trim();
    if (code) {
      await pairWithCode(code).catch((err) => console.error("❌ Falha ao parear:", err.message));
    }
  }

  // Worker contínuo em nuvem (só faz requisições se a loja estiver pareada)
  pollCloudJobsOnce();
  setInterval(pollCloudJobsOnce, CLOUD_POLL_INTERVAL_MS);

  // Entrada opcional de código de pareamento direto no terminal do .exe
  if (process.stdin && process.stdin.isTTY) {
    try {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.on("line", async (line) => {
        const clean = String(line || "").trim().toUpperCase();
        if (!clean) return;
        if (clean.startsWith("PM-")) {
          try {
            await pairWithCode(clean);
            pollCloudJobsOnce();
          } catch (err) {
            console.error(`❌ Erro ao parear codigo ${clean}: ${err.message}`);
          }
        }
      });
    } catch (_rlErr) {}
  }
});
