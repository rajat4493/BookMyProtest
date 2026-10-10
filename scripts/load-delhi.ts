// Loads / syncs the Delhi / Jantar Mantar corpus as a human-run admin operation.
//
//   npm run db:load-delhi                                  # load or sync as DRAFTS (default; safe)
//   npm run db:load-delhi -- --confirm-verified            # the admin states the rules were verified: publish the drafts
//   npm run db:load-delhi -- --confirm-verified --go-live  # ...and make New Delhi District selectable in the planner
//
// DELHI_STANDING_ORDER_URL overrides the official URL in data/delhi/corpus.ts (the default is the exact link supplied by the project owner).
// Publishing, and going live, are separate explicit decisions. Neither is ever implied by loading.
import { loadEnv } from "./env";
loadEnv();

async function main() {
  const { one, pool } = await import("../src/lib/db");
  const { loadDelhiCorpus } = await import("../data/delhi/loader");
  const args = process.argv.slice(2);
  const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  const admin = await one<{ id: string }>("SELECT id FROM users WHERE email=$1 AND role='admin'", [email]);
  if (!admin) throw new Error("ADMIN_EMAIL must be an existing admin user (run npm run db:seed first). Publishing needs a named human reviewer.");
  const report = await loadDelhiCorpus({
    actor: { userId: admin.id },
    standingOrderUrl: process.env.DELHI_STANDING_ORDER_URL || undefined,
    verifiedOn: process.env.VERIFIED_ON ?? new Date().toISOString().slice(0, 10),
    confirmVerified: args.includes("--confirm-verified"),
    goLive: args.includes("--go-live"),
  });
  console.log(JSON.stringify({ ...report, rules: undefined }, null, 2));
  const counts: Record<string, number> = {};
  for (const v of Object.values(report.rules)) counts[v.split(" (")[0]] = (counts[v.split(" (")[0]] ?? 0) + 1;
  console.log("rules:", counts);
  await pool().end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
