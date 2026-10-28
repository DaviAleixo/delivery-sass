import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { listWindowsPrinters, sendTextToPrinter } from "./printerService.js";
import { formatOrderToThermalText } from "./ticketFormatter.js";

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
const CONFIG_FILE = path.join(appDir, "spooler-config.json");

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch (_e) {}
  return { selectedPrinter: "", paperWidth: "80mm" };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("Erro ao salvar spooler-config.json:", err);
  }
}

let currentConfig = loadConfig();

// Inicializa detectando impressora padrão caso não esteja configurada ainda
listWindowsPrinters().then(({ defaultPrinter }) => {
  if (!currentConfig.selectedPrinter && defaultPrinter) {
    currentConfig.selectedPrinter = defaultPrinter;
    saveConfig(currentConfig);
  }
}).catch(() => {});

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Private-Network": "true",
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // Tratamento de CORS Preflight (com suporte a Private Network Access para sites HTTPS)
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Private-Network": "true",
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // 1. Rota de Verificação de Status
  if (req.method === "GET" && (pathname === "/" || pathname === "/status" || pathname === "/health")) {
    return sendJson(res, 200, {
      status: "online",
      service: "PedeMuleke Spooler",
      version: "1.0.0",
      selectedPrinter: currentConfig.selectedPrinter || "Padrao do Windows",
      paperWidth: currentConfig.paperWidth || "80mm",
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Rota para Listar Impressoras do Windows
  if (req.method === "GET" && pathname === "/printers") {
    try {
      const { printers, defaultPrinter } = await listWindowsPrinters();
      return sendJson(res, 200, {
        printers,
        defaultPrinter,
        selectedPrinter: currentConfig.selectedPrinter || defaultPrinter,
        paperWidth: currentConfig.paperWidth || "80mm",
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
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
        return sendJson(res, 200, { success: true, config: currentConfig });
      } catch (err) {
        return sendJson(res, 400, { error: "JSON invalido" });
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
          return sendJson(res, 400, { error: "Pedido invalido" });
        }

        const paperWidth = payload.paperWidth || currentConfig.paperWidth || "80mm";
        const targetPrinter = payload.printerName || currentConfig.selectedPrinter || undefined;

        // Se o cliente enviar o texto já formatado, usa direto. Senão formata o pedido térmico
        const textToPrint = payload.rawText || formatOrderToThermalText(order, {
          paperWidth,
          storeName: payload.storeName || order.restaurant_name,
        });

        console.log(`[${new Date().toLocaleTimeString()}] 🖨️ Imprimindo Pedido #${String(order.id || "").slice(-6).toUpperCase()}...`);

        const result = await sendTextToPrinter(textToPrint, targetPrinter);

        if (result.success) {
          return sendJson(res, 200, {
            success: true,
            orderId: order.id,
            printer: result.printer,
            printedAt: new Date().toISOString(),
          });
        } else {
          return sendJson(res, 500, {
            success: false,
            error: result.error,
          });
        }
      } catch (err) {
        console.error("Erro ao processar /print:", err);
        return sendJson(res, 500, { error: err.message });
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
    return sendJson(res, result.success ? 200 : 500, result);
  }

  // Rota desconhecida
  sendJson(res, 404, { error: "Rota nao encontrada" });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ ERRO: A porta ${PORT} já está sendo utilizada por outra instância do Spooler ou programa.`);
    console.error("Verifique se o pedemuleke-spooler.exe já está aberto na barra de tarefas do Windows.\n");
  } else {
    console.error("Erro no servidor de impressão:", err);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("===============================================================");
  console.log("   🟢 PEDEMULEKE SPOOLER - IMPRESSAO AUTOMATICA ATIVA          ");
  console.log("===============================================================");
  console.log(`   STATUS:        ONLINE E PRONTO PARA IMPRIMIR 🟢`);
  console.log(`   IMPRESSORA:    ${currentConfig.selectedPrinter || "Padrao do Windows"}`);
  console.log(`   BOBINA:        ${currentConfig.paperWidth}`);
  console.log(`   PORTA LOCAL:   http://127.0.0.1:${PORT}`);
  console.log("---------------------------------------------------------------");
  console.log("   💡 DICA: Mantenha esta janela aberta durante o expediente.");
  console.log("   Os pedidos do painel web imprimirao aqui automaticamente!");
  console.log("===============================================================");
  console.log("");
});
