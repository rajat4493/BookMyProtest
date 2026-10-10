// The verification gate: only rules whose reviewer recorded reading the instrument are publishable; a load date is not verification.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { publishVerified, verificationReport } from "@/lib/rule-verification";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { ensureDefaultTemplates } from "@/lib/default-templates";

let admin: { userId: string };
beforeAll(async () => { await migrate(process.env.DATABASE_URL!); });
afterAll(async () => { await pool().end(); });
beforeEach(async () => {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories, events RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  admin = { userId: (await one<{ id: string }>("INSERT INTO users (email, password_hash, role, email_verified_at) VALUES ('a@x.org','x','admin',now()) RETURNING id"))!.id };
  await loadDelhiCorpus({ actor: admin, verifiedOn: "2026-10-01" }); // drafts only: nobody has confirmed anything
});

describe("verification gate", () => {
  it("as loaded, no Delhi rule is verified: the corpus records no section reference or excerpt for the instrument", async () => {
    const r = await verificationReport("DEL-");
    expect(r.filter((x) => x.ready)).toEqual([]);
    expect(r.find((x) => x.family === "DEL-JM-001")!.missing.join(" ")).toMatch(/nobody has recorded reading the instrument/);
    const held = r.filter((x) => x.family === "DEL-PROC-100");
    for (const h of held) expect(h.missing.join(" ")).toMatch(/held for review/);
  });
  it("publishing through the gate publishes nothing while nothing is verified, and a dry run publishes nothing ever", async () => {
    const out = await publishVerified(admin, "DEL-", "test");
    expect(out.published).toEqual([]);
    expect((await query("SELECT 1 FROM rules WHERE rule_family_id LIKE 'DEL-%' AND rule_status='ACTIVE'")).length).toBe(0);
  });
  it("recording the section and excerpt for one rule makes exactly that rule ready; publishing then activates only it", async () => {
    await query(`UPDATE rule_sources SET section_ref='para 4', excerpt='Prior permission of the DCP is required.'
      WHERE rule_id=(SELECT id FROM rules WHERE rule_family_id='DEL-JM-001' AND rule_status='DRAFT') AND evidence_strength='PRIMARY'`);
    const ready = (await verificationReport("DEL-")).filter((x) => x.ready).map((x) => x.family);
    expect(ready).toEqual(["DEL-JM-001"]);
    const dry = await publishVerified(admin, "DEL-", "dry", true);
    expect(dry.published).toEqual(["DEL-JM-001"]);
    expect((await query("SELECT 1 FROM rules WHERE rule_family_id='DEL-JM-001' AND rule_status='ACTIVE'")).length).toBe(0);
    const out = await publishVerified(admin, "DEL-", "Reviewed against the instrument");
    expect(out.published).toEqual(["DEL-JM-001"]);
    const active = await query("SELECT rule_family_id FROM rules WHERE rule_family_id LIKE 'DEL-%' AND rule_status='ACTIVE'");
    expect(active.map((r: any) => r.rule_family_id)).toEqual(["DEL-JM-001"]);
    expect(await one("SELECT 1 FROM audit_log WHERE action='rule.publish'")).not.toBeNull();
    // New Delhi District is still not selectable: publishing is not going live
    expect(await one("SELECT 1 FROM jurisdictions WHERE name ILIKE '%New Delhi%' AND supported")).toBeNull();
  });
  it("a non-human actor cannot publish", async () => {
    await expect(publishVerified({ userId: "" } as any, "DEL-", "x")).rejects.toThrow();
  });
});
