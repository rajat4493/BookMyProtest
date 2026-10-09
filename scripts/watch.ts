// Regulatory Watch job: checks every monitored source whose frequency has elapsed. Run from cron / a scheduler: `npm run watch`.
// It only records snapshots and opens review items; it never publishes or edits a rule.
import { loadEnv } from "./env";
loadEnv();

async function main() {
  const { runDueChecks } = await import("../src/lib/knowledge");
  const { pool } = await import("../src/lib/db");
  const results = await runDueChecks();
  for (const r of results) console.log(r.sourceId, r.result.kind, r.result.kind === "CHANGED" ? `(${r.result.affectedRuleIds.length} rule(s) flagged)` : "");
  if (results.length === 0) console.log("no sources due");
  await pool().end();
}
main();
