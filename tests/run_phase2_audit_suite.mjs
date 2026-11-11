import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const suites = [
  { name: "Payment Integrity (MercadoPago & PIX Convert)", file: "tests/payment_integrity_test.mjs" },
  { name: "Order Idempotency (Client Key & Postgres ON CONFLICT)", file: "tests/order_idempotency_test.mjs" },
  { name: "Transactions, Business Rules, Concurrency & Cashback", file: "tests/transactions_business_rules_test.mjs" },
  { name: "Realtime WebSocket Sync & Multiplexing", file: "tests/realtime_sync_test.mjs" },
  { name: "Spooler Concurrency & Multi-Tenant Isolation", file: "tests/verify_spooler_and_edge_cases.mjs" },
  { name: "Red Team / Pentest Hardening Suite", file: "tests/redteam_kali_pentest.mjs" },
  { name: "Phase 3 Financial Concurrency (8 Scenarios)", file: "tests/phase3_financial_concurrency_test.mjs" },
  { name: "Phase 4 Operational Failures & Recovery", file: "tests/phase4_operational_failures_test.mjs" },
  { name: "Phase 5 Multi-Tenant Security, Storage & Local Spooler", file: "tests/phase5_multitenant_security_test.mjs" },
  { name: "Phase 6 Database Integrity, Constraints, Deadlocks & Backup", file: "tests/phase6_db_integrity_test.mjs" },
];

const summary = [];
let hasFailure = false;

for (const suite of suites) {
  console.log(`\n============================================================`);
  console.log(`RUNNING: ${suite.name} (${suite.file})`);
  console.log(`============================================================`);
  const start = Date.now();
  const res = spawnSync(process.execPath, [path.resolve(rootDir, suite.file)], {
    cwd: rootDir,
    stdio: "inherit",
  });
  const elapsedMs = Date.now() - start;
  const passed = res.status === 0;
  if (!passed) hasFailure = true;
  summary.push({ name: suite.name, file: suite.file, passed, code: res.status, elapsedMs });
}

console.log(`\n============================================================`);
console.log(`CONSOLIDATED AUDIT REGRESSION SUMMARY`);
console.log(`============================================================`);
for (const row of summary) {
  console.log(`${row.passed ? "[PASS]" : "[FAIL]"} ${row.name} (${row.elapsedMs}ms)`);
}
const passedCount = summary.filter((s) => s.passed).length;
console.log(`\nTOTAL SUITES PASSED: ${passedCount}/${summary.length}`);

if (hasFailure) {
  process.exit(1);
}

