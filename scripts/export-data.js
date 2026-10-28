/**
 * Script de Exportação e Snapshot Local de Dados do PedeMuleke
 * Organizado por Empresa (Multi-Tenant) + Snapshot Geral
 * Execução: npm run backup:export
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Carrega variáveis do arquivo .env de forma nativa (sem dependências extras)
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [k, ...v] = trimmed.split("=");
        if (k && v.length) {
          process.env[k.trim()] = v.join("=").trim().replace(/^["']|["']$/g, "");
        }
      }
    });
  }
} catch {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://zecuwijuiqsaoeafonsv.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

if (!SUPABASE_KEY) {
  console.error("❌ Erro: VITE_SUPABASE_ANON_KEY não encontrada no arquivo .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLES = [
  "tenants",
  "categories",
  "products",
  "product_complement_groups",
  "coupons",
  "orders",
  "shift_closings",
  "restaurant_tables",
  "table_sessions",
];

async function runExport() {
  console.log("🚀 Iniciando exportação de dados do PedeMuleke...");
  const dateKey = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const baseBackupDir = path.resolve(process.cwd(), "backups");
  const generalDir = path.join(baseBackupDir, "banco_completo");
  const companiesDir = path.join(baseBackupDir, "por_empresa");

  fs.mkdirSync(generalDir, { recursive: true });
  fs.mkdirSync(companiesDir, { recursive: true });

  // 1. Carrega todas as tabelas
  const allData = {};
  for (const table of TABLES) {
    try {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        console.warn(`⚠️ Aviso na tabela ${table}:`, error.message);
        allData[table] = [];
      } else {
        allData[table] = data || [];
        console.log(`✓ Tabela '${table}': ${allData[table].length} registros carregados.`);
      }
    } catch (err) {
      console.warn(`Erro ao ler tabela ${table}:`, err.message);
      allData[table] = [];
    }
  }

  // 2. Salva o Snapshot Geral da Plataforma (Todas as empresas juntas)
  const generalSnapshot = {
    backup_type: "full_database_snapshot",
    exported_at: new Date().toISOString(),
    total_tenants: (allData.tenants || []).length,
    tables: allData,
  };
  const generalFilename = `snapshot_completo_${timestamp}.json`;
  const generalPath = path.join(generalDir, generalFilename);
  fs.writeFileSync(generalPath, JSON.stringify(generalSnapshot, null, 2), "utf-8");
  console.log(`\n📁 [1/2] Snapshot Geral salvo em: backups/banco_completo/${generalFilename}`);

  // 3. Organiza e Separa os dados POR EMPRESA
  const tenants = allData.tenants || [];
  console.log(`\n🏢 [2/2] Organizando dados individuais por empresa (${tenants.length} lojas):`);

  for (const tenant of tenants) {
    const slug = tenant.slug || tenant.name?.toLowerCase().replace(/[^a-z0-9]/g, "_") || tenant.id;
    const tenantDir = path.join(companiesDir, slug);
    fs.mkdirSync(tenantDir, { recursive: true });

    const tenantId = tenant.id;

    const tenantData = {
      tenant_info: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        phone: tenant.phone,
        address: tenant.address,
        is_active: tenant.is_active,
        subscription_status: tenant.subscription_status,
      },
      exported_at: new Date().toISOString(),
      date_key: dateKey,
      cardapio: {
        categorias: (allData.categories || []).filter((c) => c.tenant_id === tenantId),
        produtos: (allData.products || []).filter((p) => p.tenant_id === tenantId),
        grupos_adicionais: (allData.product_complement_groups || []).filter((g) => g.tenant_id === tenantId),
        cupons: (allData.coupons || []).filter((cp) => cp.tenant_id === tenantId),
      },
      operacao: {
        pedidos: (allData.orders || []).filter((o) => o.tenant_id === tenantId),
        mesas: (allData.restaurant_tables || []).filter((t) => t.tenant_id === tenantId),
        sessoes_mesa: (allData.table_sessions || []).filter((s) => s.tenant_id === tenantId),
        fechamentos_caixa: (allData.shift_closings || []).filter((sc) => sc.tenant_id === tenantId),
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
      `   ➔ 📦 ${tenant.name || slug}: ${tenantData.cardapio.produtos.length} produtos, ${tenantData.operacao.pedidos.length} pedidos salvos em backups/por_empresa/${slug}/${tenantFilename}`
    );
  }

  console.log("\n========================================================");
  console.log("✅ Backup estruturado por empresa concluído com sucesso!");
  console.log("========================================================\n");
}

runExport();
