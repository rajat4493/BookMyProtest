// Loads the Delhi / Jantar Mantar corpus as a human-run admin operation.
//   DELHI_STANDING_ORDER_URL=<official PDF url> npm run db:load-delhi
// Without the URL, Standing Order rules are loaded as DRAFT and nothing is published. The URL is never guessed.
import { loadEnv } from "./env";
loadEnv();

async function main() {
  const { one, pool } = await import("../src/lib/db");
  const { loadDelhiCorpus } = await import("../data/delhi/loader");
  const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  const admin = await one<{ id: string }>("SELECT id FROM users WHERE email=$1 AND role='admin'", [email]);
  if (!admin) throw new Error("ADMIN_EMAIL must be an existing admin user (run npm run db:seed first). Publishing needs a named human reviewer.");
  const report = await loadDelhiCorpus({ actor: { userId: admin.id }, standingOrderUrl: process.env.DELHI_STANDING_ORDER_URL ?? null, verifiedOn: process.env.VERIFIED_ON ?? new Date().toISOString().slice(0, 10) });
  console.log(JSON.stringify({ ...report, rules: undefined }, null, 2));
  const counts: Record<string, number> = {};
  for (const v of Object.values(report.rules)) counts[v.split(" (")[0]] = (counts[v.split(" (")[0]] ?? 0) + 1;
  console.log("rules:", counts);
  await pool().end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
