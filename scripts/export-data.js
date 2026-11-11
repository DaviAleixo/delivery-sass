/**
 * Script de Exportação e Snapshot Local de Dados do PedeMuleke
 * Organizado por Empresa (Multi-Tenant) + Snapshot Geral com Checksum SHA-256
 * Execução: SUPABASE_SERVICE_ROLE_KEY=... npm run backup:export
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import path from "path";

function loadEnvFile(envPath) {
  try {
    if (!fs.existsSync(envPath)) return;
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [k, ...v] = trimmed.split("=");
        if (k && v.length && !process.env[k.trim()]) {
          process.env[k.trim()] = v.join("=").trim().replace(/^["']|["']$/g, "");
        }
      }
    });
  } catch {}
}

loadEnvFile(path.resolve(process.cwd(), ".env"));
loadEnvFile(path.resolve(process.cwd(), ".env.local"));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://zecuwijuiqsaoeafonsv.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_KEY) {
  console.error("❌ Erro: SUPABASE_SERVICE_ROLE_KEY é obrigatória para exportar dados protegidos por RLS (evita backup silenciosamente vazio com anon key).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = [
  "tenants",
  "categories",
  "products",
  "complement_groups",
  "complement_items",
  "product_complement_groups",
  "product_additionals",
  "coupons",
  "coupon_usages",
  "orders",
  "order_items",
  "production_sectors",
  "print_jobs",
  "shift_closings",
  "restaurant_tables",
  "table_sessions",
  "customer_cashback_wallets",
  "customer_cashback_transactions",
];

function sanitizeTenantForBackup(tenant) {
  if (!tenant || typeof tenant !== "object") return tenant;
  const clone = { ...tenant };
  if (clone.payment_methods && typeof clone.payment_methods === "object") {
    const pm = { ...clone.payment_methods };
    if ("mp_access_token" in pm) pm.mp_access_token = pm.mp_access_token ? "[REDACTED]" : null;
    clone.payment_methods = pm;
  }
  return clone;
}

async function fetchAllRows(table) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`Falha ao exportar '${table}': ${error.message}`);
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function runExport() {
  console.log("🚀 Iniciando exportação completa e verificável de dados do PedeMuleke...");
  const dateKey = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const baseBackupDir = path.resolve(process.cwd(), "backups");
  const generalDir = path.join(baseBackupDir, "banco_completo");
  const companiesDir = path.join(baseBackupDir, "por_empresa");

  fs.mkdirSync(generalDir, { recursive: true });
  fs.mkdirSync(companiesDir, { recursive: true });

  const allData = {};
  const rowCounts = {};

  for (const table of TABLES) {
    const rows = await fetchAllRows(table);
    allData[table] = table === "tenants" ? rows.map(sanitizeTenantForBackup) : rows;
    rowCounts[table] = allData[table].length;
    console.log(`✓ Tabela '${table}': ${rowCounts[table]} registros carregados.`);
  }

  const tablesJson = JSON.stringify(allData);
  const checksumSha256 = crypto.createHash("sha256").update(tablesJson).digest("hex");

  const generalSnapshot = {
    backup_type: "full_database_snapshot",
    exported_at: new Date().toISOString(),
    total_tenants: (allData.tenants || []).length,
    row_counts: rowCounts,
    checksum_sha256: checksumSha256,
    tables: allData,
  };
  const generalFilename = `snapshot_completo_${timestamp}.json`;
  const generalPath = path.join(generalDir, generalFilename);
  fs.writeFileSync(generalPath, JSON.stringify(generalSnapshot, null, 2), "utf-8");
  console.log(`\n📁 [1/2] Snapshot Geral salvo em: backups/banco_completo/${generalFilename} (sha256=${checksumSha256.slice(0, 12)}...)`);

  const tenants = allData.tenants || [];
  console.log(`\n🏢 [2/2] Organizando dados individuais por empresa (${tenants.length} lojas):`);

  for (const tenant of tenants) {
    const slug = tenant.slug || tenant.name?.toLowerCase().replace(/[^a-z0-9]/g, "_") || tenant.id;
    const tenantDir = path.join(companiesDir, slug);
    fs.mkdirSync(tenantDir, { recursive: true });

    const tenantId = tenant.id;
    const tenantData = {
      tenant_info: tenant,
      exported_at: new Date().toISOString(),
      date_key: dateKey,
      cardapio: {
        categorias: (allData.categories || []).filter((c) => c.tenant_id === tenantId),
        produtos: (allData.products || []).filter((p) => p.tenant_id === tenantId),
        grupos_complementos: (allData.complement_groups || []).filter((g) => g.tenant_id === tenantId),
        itens_complementos: (allData.complement_items || []).filter((i) => i.tenant_id === tenantId),
        vinculos_complementos: (allData.product_complement_groups || []).filter((g) => g.tenant_id === tenantId),
        adicionais: (allData.product_additionals || []).filter((a) => a.tenant_id === tenantId),
        cupons: (allData.coupons || []).filter((cp) => cp.tenant_id === tenantId),
      },
      operacao: {
        pedidos: (allData.orders || []).filter((o) => o.tenant_id === tenantId),
        itens_pedido: (allData.order_items || []).filter((oi) => oi.tenant_id === tenantId),
        setores_producao: (allData.production_sectors || []).filter((s) => s.tenant_id === tenantId),
        jobs_impressao: (allData.print_jobs || []).filter((pj) => pj.tenant_id === tenantId),
        mesas: (allData.restaurant_tables || []).filter((t) => t.tenant_id === tenantId),
        sessoes_mesa: (allData.table_sessions || []).filter((s) => s.tenant_id === tenantId),
        fechamentos_caixa: (allData.shift_closings || []).filter((sc) => sc.tenant_id === tenantId),
        carteiras_cashback: (allData.customer_cashback_wallets || []).filter((w) => w.tenant_id === tenantId),
        transacoes_cashback: (allData.customer_cashback_transactions || []).filter((tx) => tx.tenant_id === tenantId),
      },
      metricas_resumo: {
        total_produtos: (allData.products || []).filter((p) => p.tenant_id === tenantId).length,
        total_pedidos: (allData.orders || []).filter((o) => o.tenant_id === tenantId).length,
      },
    };

    const tenantFilename = `backup_${slug}_${dateKey}.json`;
    const tenantFilePath = path.join(tenantDir, tenantFilename);
    fs.writeFileSync(tenantFilePath, JSON.stringify(tenantData, null, 2), "utf-8");

    console.log(
      `   ➔ 📦 ${tenant.name || slug}: ${tenantData.cardapio.produtos.length} produtos, ${tenantData.operacao.pedidos.length} pedidos`
    );
  }

  console.log("\n========================================================");
  console.log("✅ Backup estruturado por empresa concluído com sucesso!");
  console.log("========================================================\n");
}

runExport().catch((err) => {
  console.error("❌ Erro na exportação de backup:", err.message);
  process.exit(1);
});
