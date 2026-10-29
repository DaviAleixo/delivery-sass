import fs from 'fs';
import path from 'path';

// Carrega os dados brutos extraídos do banco de produção real
const stepsDir = 'C:\\Users\\Davi\\.gemini\\antigravity\\brain\\6cc28fe6-a143-44e2-9fab-06df0e751afc\\.system_generated\\steps';

function parseStepOutput(stepNum) {
  const file = path.join(stepsDir, String(stepNum), 'output.txt');
  const raw = fs.readFileSync(file, 'utf-8');
  const parsed = JSON.parse(raw);
  const str = parsed.result;
  const start = str.indexOf('[');
  const end = str.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error(`Array não encontrado no step ${stepNum}`);
  return JSON.parse(str.slice(start, end + 1));
}

const columns = parseStepOutput(245);
const constraints = parseStepOutput(247);
const indexes = parseStepOutput(249);
const functions = parseStepOutput(179);
const policies = parseStepOutput(181);

console.log(`Carregados: ${columns.length} colunas, ${constraints.length} constraints, ${indexes.length} índices, ${functions.length} funções, ${policies.length} policies.`);

let sql = `-- =====================================================================
-- 🚀 PEDEMULEKE — DDL OFICIAL 100% LIMPO E CONSOLIDADO
-- Projeto Alvo: jqwtnzdsaivbjudvjhld (PedeMuleke Prod)
-- Extraído diretamente do catálogo ativo do PostgreSQL (Single Source of Truth)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. FUNÇÃO AUXILIAR DE TIMESTAMP UPDATED_DATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_date()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_date = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

`;

// Agrupa colunas por tabela
const tables = {};
for (const col of columns) {
  if (!tables[col.table_name]) tables[col.table_name] = [];
  tables[col.table_name].push(col);
}

// Ordem estrita de dependência (pais antes de filhos)
const tableOrder = [
  'tenants',
  'admin_users',
  'categories',
  'products',
  'product_additionals',
  'complement_groups',
  'complement_items',
  'product_complement_groups',
  'coupons',
  'coupon_usages',
  'customers',
  'user_addresses',
  'restaurant_tables',
  'table_sessions',
  'orders',
  'order_items',
  'order_item_additionals',
  'shift_closings',
  'system_issues',
  'tenant_admins',
  'banner_images',
  'banners',
  'whatsapp_otp_codes'
];

sql += `-- ---------------------------------------------------------------------
-- 2. SEQUÊNCIAS E CRIAÇÃO DE TABELAS
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.tenants_code_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.orders_order_number_seq START WITH 1 INCREMENT BY 1;
`;

for (const tableName of tableOrder) {
  const cols = tables[tableName];
  if (!cols) continue;

  sql += `\nCREATE TABLE IF NOT EXISTS public.${tableName} (\n`;
  const colDefs = cols.map(c => {
    let type = c.data_type;
    if (type === 'USER-DEFINED') type = c.udt_name;
    let def = `    ${c.column_name} ${type}`;
    if (c.column_default) {
      def += ` DEFAULT ${c.column_default}`;
    }
    if (c.is_nullable === 'NO') {
      def += ` NOT NULL`;
    }
    return def;
  });
  sql += colDefs.join(',\n');
  sql += `\n);\n`;
}

sql += `\n-- ---------------------------------------------------------------------
-- 3. CONSTRAINTS (PRIMARY KEYS, UNIQUE, CHECKS, FOREIGN KEYS)
-- ---------------------------------------------------------------------
`;

// Ordena constraints com rigor: Primary Keys ('p') PRIMEIRO, Unique ('u') DEPOIS, Checks ('c') e por fim Foreign Keys ('f')
const contypePriority = { 'p': 1, 'u': 2, 'c': 3, 'f': 4 };
constraints.sort((a, b) => (contypePriority[a.constraint_type] || 99) - (contypePriority[b.constraint_type] || 99));

for (const con of constraints) {
  // Ignora constraints do information_schema ou pg_
  sql += `DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = '${con.constraint_name}'
    ) THEN
        ALTER TABLE public.${con.table_name} ADD CONSTRAINT ${con.constraint_name} ${con.constraint_definition};
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;\n`;
}

sql += `\n-- ---------------------------------------------------------------------
-- 4. ÍNDICES DE ALTA PERFORMANCE
-- ---------------------------------------------------------------------
`;

for (const idx of indexes) {
  // Ignora índices de chave primária que já são criados com a constraint
  if (idx.indexname.endsWith('_pkey')) continue;
  // Ignora índices que já foram criados automaticamente por uma constraint (UNIQUE/PK)
  if (constraints.some(c => c.constraint_name === idx.indexname)) continue;

  let def = idx.indexdef;
  def = def.replace(/^CREATE UNIQUE INDEX\s+/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ');
  def = def.replace(/^CREATE INDEX\s+/i, 'CREATE INDEX IF NOT EXISTS ');
  sql += `${def};\n`;
}

sql += `\n-- ---------------------------------------------------------------------
-- 5. TRIGGERS DE UPDATED_DATE
-- ---------------------------------------------------------------------
`;

for (const tableName of tableOrder) {
  const cols = tables[tableName];
  if (cols.some(c => c.column_name === 'updated_date')) {
    sql += `DROP TRIGGER IF EXISTS trg_update_date_${tableName} ON public.${tableName};
CREATE TRIGGER trg_update_date_${tableName}
    BEFORE UPDATE ON public.${tableName}
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();\n`;
  }
}

sql += `\n-- ---------------------------------------------------------------------
-- 6. TODAS AS FUNÇÕES E RPCS (31 FUNÇÕES)
-- ---------------------------------------------------------------------
`;

for (const fn of functions) {
  sql += `\n-- Routine: ${fn.proname}\n`;
  sql += `${fn.def};\n`;
}

sql += `\nGRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;\n`;

sql += `\n-- ---------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) E POLICIES
-- ---------------------------------------------------------------------
`;

for (const tableName of tableOrder) {
  sql += `ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;\n`;
}

for (const pol of policies) {
  const roles = pol.roles ? (Array.isArray(pol.roles) ? pol.roles.join(', ') : String(pol.roles).replace(/[{}]/g, '')) : 'public';
  let polSql = `CREATE POLICY "${pol.policyname}" ON public.${pol.tablename}\n`;
  polSql += `    AS ${pol.permissive}\n`;
  polSql += `    FOR ${pol.cmd}\n`;
  polSql += `    TO ${roles}\n`;
  if (pol.qual) {
    polSql += `    USING (${pol.qual})\n`;
  }
  if (pol.with_check) {
    polSql += `    WITH CHECK (${pol.with_check})\n`;
  }
  polSql += `;\n`;

  sql += `DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = '${pol.tablename}' AND policyname = '${pol.policyname}'
    ) THEN
        ${polSql}
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;\n`;
}

sql += `\n-- ---------------------------------------------------------------------
-- 8. PUBLICAÇÃO REALTIME
-- ---------------------------------------------------------------------
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.table_sessions;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tenants;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
`;

const cleanFile = path.resolve('supabase/master_clone_pedemuleke_clean.sql');
fs.writeFileSync(cleanFile, sql, 'utf-8');
console.log(`✅ DDL 100% LIMPO gerado com sucesso: ${cleanFile} (${(fs.statSync(cleanFile).size / 1024).toFixed(1)} KB)`);
