// Reports which Delhi rules have completed verification, and (only with --publish) publishes exactly those.
//   npm run delhi:verify-gate                       # report only (default; read-only)
//   npm run delhi:verify-gate -- --publish          # a named admin publishes the rules that pass every check; the rest stay DRAFT
// Going live (making New Delhi District selectable) is a separate decision this script never takes.
import { loadEnv } from "./env";
loadEnv();

async function main() {
  const { one, pool } = await import("../src/lib/db");
  const { publishVerified, verificationReport } = await import("../src/lib/rule-verification");
  const publish = process.argv.includes("--publish");
  const report = await verificationReport("DEL-");
  const ready = report.filter((r) => r.ready && r.status !== "ACTIVE"), held = report.filter((r) => !r.ready && r.status !== "ACTIVE");
  console.log(`Delhi rules: ${report.length} total · ${report.filter((r) => r.status === "ACTIVE").length} active · ${ready.length} verification complete (not yet published) · ${held.length} not ready`);
  for (const r of held) console.log(`  HOLD ${r.family} [${r.status}] ${r.title}  (${r.evidenceClass ?? "no official source"})\n       - ${r.missing.join("\n       - ")}`);
  for (const r of ready) console.log(`  READY ${r.family} (${r.evidenceClass}) ${r.title}`);
  if (publish) {
    const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
    const admin = await one<{ id: string }>("SELECT id FROM users WHERE email=$1 AND role='admin'", [email]);
    if (!admin) throw new Error("ADMIN_EMAIL must be an existing admin user: publishing needs a named human.");
    const r = await publishVerified({ userId: admin.id }, "DEL-", `Published after verification gate by ${email}`);
    console.log("published:", r.published.length ? r.published.join(", ") : "none");
  } else console.log("\n(report only; nothing was published)");
  await pool().end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
