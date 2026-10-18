// Linking a public protest to an issue: the organizer's choice, shown on both sides, never an endorsement and never a precondition.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { generateEvaluation } from "@/lib/knowledge";
import { createEvent, getEvent } from "@/lib/store";
import { saveProtest, type ProtestInput } from "@/lib/protests";
import { createIssueDraft, getIssueForEdit, issueForProtest, linkProtestToIssue, protestsForIssue, publishIssue, saveIssue, searchIssues } from "@/lib/issues";
import { moderateProtest } from "@/lib/moderation";
import { ensureDefaultTemplates } from "@/lib/default-templates";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { baseAnswers } from "./fixtures";

let admin: { userId: string }, org: { id: string }, org2: { id: string };
let district: string, jm: string;
const mkUser = async (email: string) => (await one<{ id: string }>("INSERT INTO users (email, password_hash, email_verified_at) VALUES ($1,'x', now()) RETURNING id", [email]))!;
const input: ProtestInput = { title: "Parents for Safe Schools", summary: "Parents asking for safer school buildings.", description: "A peaceful gathering.", organizerDisplayName: "Parents for Safe Schools", organizerType: "group", category: "EDUCATION", logistics: "", visibility: "PUBLIC", permissionMode: "SYNC", publicFields: { organizerType: true, logistics: true, officialInfo: true }, supportOptions: [] };
async function protest(u: { id: string }) {
  const e = (await getEvent(await createEvent(`anon-${u.id}`, u.id, district, { ...baseAnswers, date: "2026-12-15", startTime: "10:30", endTime: "15:30", attendance: 500 } as any, jm)))!;
  await generateEvaluation(e, "GENERATED");
  await saveProtest(e, u, input);
  return e;
}
async function issue(): Promise<{ id: string; slug: string }> {
  const id = await createIssueDraft(admin, { title: "School building safety in Pune", category: "EDUCATION", city: "Pune", state: "Maharashtra" });
  await saveIssue(admin, id, { title: "School building safety in Pune", summary: "Inspection reports on school buildings differ.", description: "Municipal inspection reports and parent groups describe the condition of school buildings differently.", whyDiscussed: "Two inspection reports reached different conclusions about the same buildings.",
    scopeLevel: "LOCAL", city: "Pune", state: "Maharashtra", category: "EDUCATION", perspectives: [], disputedClaims: [], developments: [], unknowns: "The date of the next inspection is not published.", lastCheckedOn: "2026-10-01" },
    [{ kind: "OFFICIAL_RECORD", title: "Inspection report (fixture)", url: "https://example.gov.in/report" }]);
  await publishIssue(admin, id, "fixture");
  return { id, slug: (await getIssueForEdit(id))!.slug };
}

beforeAll(async () => { await migrate(process.env.DATABASE_URL!); });
afterAll(async () => { await pool().end(); });
beforeEach(async () => {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories, events, analytics_events, issues RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  admin = { userId: (await one<{ id: string }>("INSERT INTO users (email, password_hash, role, email_verified_at) VALUES ('a@x.org','x','admin', now()) RETURNING id"))!.id };
  org = await mkUser("o1@example.org"); org2 = await mkUser("o2@example.org");
  const r = await loadDelhiCorpus({ actor: admin, verifiedOn: "2026-10-01", confirmVerified: true });
  district = r.places.DIST; jm = r.places.JM;
});

describe("protest ↔ issue link", () => {
  it("only the protest's organizer can link, to a published issue; the issue lists the protest and the protest shows the issue", async () => {
    const e = await protest(org);
    const { slug } = await issue();
    await expect(linkProtestToIssue(e.id, org2, slug)).rejects.toThrow(/Only the organizer/);
    await expect(linkProtestToIssue(e.id, org, "no-such-issue")).rejects.toThrow(/not available/);
    await linkProtestToIssue(e.id, org, slug);
    expect((await protestsForIssue(slug)).map((p: any) => p.title)).toEqual(["Parents for Safe Schools"]);
    expect((await issueForProtest(e.id))!.slug).toBe(slug);
    expect((await searchIssues({ q: "school" }))[0].protests).toBe(1);
  });
  it("is removable, and a hidden protest disappears from the issue page", async () => {
    const e = await protest(org);
    const { slug } = await issue();
    await linkProtestToIssue(e.id, org, slug);
    const pslug = (await one<{ slug: string }>("SELECT slug FROM public_protests"))!.slug;
    await moderateProtest(admin, pslug, "HIDE", "SPAM", "test");
    expect(await protestsForIssue(slug)).toEqual([]);
    await moderateProtest(admin, pslug, "RESTORE", "OTHER", "reviewed, fine");
    await linkProtestToIssue(e.id, org, null);
    expect(await protestsForIssue(slug)).toEqual([]);
    expect(await issueForProtest(e.id)).toBeNull();
  });
  it("the issue exists, and is useful, with no protest at all", async () => {
    const { slug } = await issue();
    expect(await protestsForIssue(slug)).toEqual([]);
    expect((await searchIssues({ q: "school" })).length).toBe(1);
  });
});
