// Scheduled live-restriction checks: records the T-72h and T-24h check for upcoming events. Run hourly from cron: `npm run watch:events`.
// Idempotent (one of each per event). It records what the feed shows; it never publishes or edits a rule or restriction.
import { loadEnv } from "./env";
loadEnv();

async function main() {
  const { runDueEventChecks } = await import("../src/lib/restriction-checks");
  const { pool } = await import("../src/lib/db");
  const results = await runDueEventChecks();
  for (const r of results) console.log(r.eventId, r.trigger, r.recorded ? "recorded" : "already recorded / no feed");
  if (results.length === 0) console.log("no event checks due");
  await pool().end();
}
main();
