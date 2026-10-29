import fs from 'fs';
import path from 'path';

// Lê todas as migrações na ordem cronológica correta
const migrationsDir = path.resolve('supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log(`Encontrados ${migrationFiles.length} arquivos de migration.`);

let combinedSql = `-- =====================================================================
-- 🚀 PEDEMULEKE — REPLICAÇÃO DEFINITIVA DE BANCO DE PRODUÇÃO
-- Projeto Alvo: jqwtnzdsaivbjudvjhld (PedeMuleke Prod)
-- Gerado automaticamente a partir das migrações consolidadas do sistema
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

`;

for (const file of migrationFiles) {
  // Ignora o rollback baseline
  if (file.includes('rollback')) continue;
  
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
  combinedSql += `\n-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n`;
  combinedSql += `-- MIGRATION: ${file}\n`;
  combinedSql += `-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n`;
  combinedSql += content;
  combinedSql += `\n`;
}

// Adiciona script de superadmin seguro (sem estourar erro se auth.users ainda não existir)
const setupAdminPath = path.resolve('supabase/scripts/setup_superadmin.sql');
if (fs.existsSync(setupAdminPath)) {
  let adminSql = fs.readFileSync(setupAdminPath, 'utf-8');
  // Substitui o RAISE EXCEPTION por RAISE NOTICE caso o usuário ainda não tenha sido criado no Auth
  adminSql = adminSql.replace(
    /IF v_user_id IS NULL THEN\s+RAISE EXCEPTION[^;]+;\s+END IF;/g,
    `IF v_user_id IS NULL THEN
        RAISE NOTICE 'Aviso: Usuário davi ainda não criado no Supabase Auth. Você poderá criar depois em Authentication -> Users.';
        RETURN;
    END IF;`
  );
  combinedSql += `\n-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n`;
  combinedSql += `-- SETUP SUPERADMIN INICIAL (CONDICIONAL)\n`;
  combinedSql += `-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n`;
  combinedSql += adminSql;
}

const outputPath = path.resolve('supabase/master_clone_pedemuleke.sql');
fs.writeFileSync(outputPath, combinedSql, 'utf-8');

console.log(`✅ Arquivo mestre compilado com sucesso: ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
