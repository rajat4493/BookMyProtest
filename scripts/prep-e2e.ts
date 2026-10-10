// Resets the TEST database for the browser scripts: migrates, clears users/rules/events/rate limits, loads Delhi (published, go-live) and creates the admin.
//   E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npx tsx scripts/prep-e2e.ts
process.env.DATABASE_URL = "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";
import { migrate } from "./migrate";
import { one, pool, query } from "../src/lib/db";
import { ensureDefaultTemplates } from "../src/lib/default-templates";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { hashPassword } from "../src/lib/password";
(async () => {
  await migrate(process.env.DATABASE_URL!);
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories, events, rate_limits, email_outbox RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  const hash = await hashPassword(process.env.E2E_ADMIN_PASSWORD!);
  const u = await one<{ id: string }>("INSERT INTO users (email, password_hash, role, email_verified_at) VALUES ($1,$2,'admin', now()) RETURNING id", [process.env.E2E_ADMIN_EMAIL, hash]);
  const r = await loadDelhiCorpus({ actor: { userId: u!.id }, verifiedOn: "2026-10-01", confirmVerified: true, goLive: true });
  console.log("live:", r.districtLive, "published:", r.published);
  await pool().end();
})();
