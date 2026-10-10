// v1.0 public protest pages against the test database: visibility, privacy (aggregate-only supporters), provenance, moderation, shared venues, toolkit.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { generateEvaluation } from "@/lib/knowledge";
import { createEvent, getEvent, track } from "@/lib/store";
import { recordPermission } from "@/lib/permissions";
import { getOwnerProtest, getPublicProtest, listPlaces, listProtests, listUpdates, officialInfoForEvent, otherListedSameDate, postUpdate, saveProtest, setVisibility, toggleOffer, toggleSupport, toolkitForEvent, viewerState, type ProtestInput } from "@/lib/protests";
import { moderateProtest, setOrganizerSuspended } from "@/lib/moderation";
import { toolkitViolations } from "@/lib/engine/toolkit";
import { ensureDefaultTemplates } from "@/lib/default-templates";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { baseAnswers } from "./fixtures";

let admin: { userId: string }, org1: { id: string }, org2: { id: string }, sup: { id: string }, sup2: { id: string };
let district: string, jm: string;
const DAY = "2026-12-15";
const mkUser = async (email: string, role = "user") => (await one<{ id: string }>("INSERT INTO users (email, password_hash, role) VALUES ($1,'x',$2) RETURNING id", [email, role]))!;

async function plan(user: { id: string }, over: Record<string, unknown> = {}) {
  const e = (await getEvent(await createEvent(`anon-${user.id}`, user.id, district, { ...baseAnswers, date: DAY, startTime: "10:30", endTime: "15:30", attendance: 500, organizerName: "Private Person", organizerEmail: "private.person@example.org", organizerPhone: "9810012345", ...over } as any, jm)))!;
  await generateEvaluation(e, "GENERATED");
  return e;
}
const input = (over: Partial<ProtestInput> = {}): ProtestInput => ({
  title: "Parents for Safe Schools", summary: "Parents asking for safer school buildings.", description: "A peaceful gathering about unsafe school buildings.", organizerDisplayName: "Parents for Safe Schools",
  organizerType: "group", category: "EDUCATION", logistics: "Meet near the main gate.", visibility: "PUBLIC", permissionMode: "SYNC", publicFields: { organizerType: true, logistics: true, officialInfo: true },
  supportOptions: [{ type: "WATER_HELP", note: "We need water for 500 people", link: "https://example.org/water" }, { type: "VOLUNTEER", note: "", link: "" }], ...over,
});
const publish = async (user: { id: string }, over: Partial<ProtestInput> = {}, planOver: Record<string, unknown> = {}) => {
  const e = await plan(user, planOver);
  const r = await saveProtest(e, user, input(over));
  return { e, slug: r.slug };
};

beforeAll(async () => { await migrate(process.env.DATABASE_URL!); });
afterAll(async () => { await pool().end(); });
beforeEach(async () => {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories, events, analytics_events RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  admin = { userId: (await mkUser("admin@x.org", "admin")).id };
  org1 = await mkUser("organizer.one@example.org"); org2 = await mkUser("organizer.two@example.org");
  sup = await mkUser("supporter.one@example.org"); sup2 = await mkUser("supporter.two@example.org");
  const r = await loadDelhiCorpus({ actor: admin, verifiedOn: "2026-10-01", confirmVerified: true });
  district = r.places.DIST; jm = r.places.JM;
});

describe("creating and publishing", () => {
  it("nothing is public until the organizer chooses: a draft is invisible to everyone but its owner", async () => {
    const { slug } = await publish(org1, { visibility: "DRAFT" });
    expect(await getPublicProtest(slug)).toBeNull();
    expect(await getPublicProtest(slug, { userId: sup.id })).toBeNull();
    expect(await listProtests()).toEqual([]);
    const own = await getPublicProtest(slug, { userId: org1.id });
    expect(own!.isOwner).toBe(true);
    expect(own!.hiddenNotice).toMatch(/Preview/);
  });
  it("existing private plans are never published silently: a plan with no page has no public record", async () => {
    const e = await plan(org1);
    expect(await getOwnerProtest(e.id)).toBeNull();
    expect(await query("SELECT 1 FROM public_protests")).toEqual([]);
  });
  it("only the account that owns the plan can publish it", async () => {
    const e = await plan(org1);
    await expect(saveProtest(e, org2, input())).rejects.toThrow(/owns this plan/i);
  });
  it("PUBLIC pages are listed; UNLISTED open by link only; PRIVATE and ARCHIVED are closed; CANCELLED opens with a notice but is not listed", async () => {
    const pubd = await publish(org1);
    const unl = await publish(org1, { title: "Unlisted one", visibility: "UNLISTED" });
    const priv = await publish(org1, { title: "Private one", visibility: "PRIVATE" });
    const arch = await publish(org1, { title: "Archived one", visibility: "ARCHIVED" });
    const canc = await publish(org1, { title: "Cancelled one", visibility: "PUBLIC" });
    await setVisibility(canc.e.id, org1, "CANCELLED");
    expect((await listProtests()).map((p) => p.title)).toEqual(["Parents for Safe Schools"]);
    expect(await getPublicProtest(pubd.slug)).not.toBeNull();
    expect(await getPublicProtest(unl.slug)).not.toBeNull();
    expect((await getPublicProtest(canc.slug))!.protest.visibility).toBe("CANCELLED");
    expect(await getPublicProtest(priv.slug)).toBeNull();
    expect(await getPublicProtest(arch.slug)).toBeNull();
  });
  it("unpublishing removes a page from discovery and from anonymous view", async () => {
    const { e, slug } = await publish(org1);
    await setVisibility(e.id, org1, "PRIVATE");
    expect(await getPublicProtest(slug)).toBeNull();
    expect(await listProtests()).toEqual([]);
  });
  it("publishing does not depend on permission: a plan with nothing submitted publishes and says 'Not started — reported by organizer'", async () => {
    const { slug } = await publish(org1);
    expect((await getPublicProtest(slug))!.protest.permission).toMatchObject({ status: "NOT_STARTED", label: "Not started — reported by organizer" });
  });
  it("rejects personal contact details in public text, and unsafe support links", async () => {
    const e = await plan(org1);
    await expect(saveProtest(e, org1, input({ summary: "Email me at asha@example.com" }))).rejects.toThrow(/remove email/i);
    await expect(saveProtest(e, org1, input({ description: "Call 98100 12345 for details" }))).rejects.toThrow(/remove phone/i);
    await expect(saveProtest(e, org1, input({ supportOptions: [{ type: "OTHER", note: "", link: "javascript:alert(1)" }] }))).rejects.toThrow(/https/);
    await expect(saveProtest(e, org1, input({ category: "NOPE" }))).rejects.toThrow(/subject area/i);
    await expect(saveProtest(e, org1, input({ title: "x" }))).rejects.toThrow(/Title/);
  });
});

describe("what a public page reveals", () => {
  it("exposes only whitelisted fields: no plan id, owner id, email, phone or internal notes", async () => {
    const { e, slug } = await publish(org1);
    const p = (await getPublicProtest(slug))!.protest;
    expect(Object.keys(p).sort()).toEqual(["category", "categoryLabel", "city", "counts", "date", "description", "endTime", "expectedFormat", "logistics", "moderation", "organizerDisplayName", "organizerType", "permission", "publicFields", "publishedAt", "slug", "startTime", "state", "summary", "supportOptions", "title", "updatedAt", "venue", "visibility"]);
    const json = JSON.stringify(await Promise.all([getPublicProtest(slug), listProtests(), otherListedSameDate(slug), listUpdates(slug), listPlaces()]));
    for (const secret of ["private.person@example.org", "9810012345", "Private Person", e.id, org1.id, "organizer.one@example.org", e.answers.organizerPhone]) expect(json, secret).not.toContain(secret);
  });
  it("shows the organizer's display name, not the account's personal name", async () => {
    const { slug } = await publish(org1);
    expect((await getPublicProtest(slug))!.protest.organizerDisplayName).toBe("Parents for Safe Schools");
  });
  it("the organizer chooses public fields: organizer type and logistics can be hidden", async () => {
    const { slug } = await publish(org1, { publicFields: { organizerType: false, logistics: false, officialInfo: true } });
    const p = (await getPublicProtest(slug))!.protest;
    expect(p.organizerType).toBeNull();
    expect(p.logistics).toBe("");
  });
});

describe("permission status is organizer-reported", () => {
  it("SUBMITTED reads 'Submitted — reported by organizer' with the organizer-provided provenance", async () => {
    const { e, slug } = await publish(org1);
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z", reference: "DIARY/1" });
    const perm = (await getPublicProtest(slug))!.protest.permission;
    expect(perm.label).toBe("Submitted — reported by organizer");
    expect(perm.provenance).toMatchObject({ cls: "ORGANIZER_PROVIDED", reported: true });
    expect(JSON.stringify(perm)).not.toContain("DIARY/1"); // the reference number stays private
  });
  it("APPROVED appears only after the organizer records it, and still says 'reported by organizer'", async () => {
    const { e, slug } = await publish(org1);
    expect((await getPublicProtest(slug))!.protest.permission.status).not.toBe("APPROVED");
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z" });
    await recordPermission(e, { status: "APPROVED", approvalDate: "2026-11-25", conditions: "Finish by 17:00" }, new Date("2026-11-26T00:00:00Z"));
    const perm = (await getPublicProtest(slug))!.protest.permission;
    expect(perm.label).toBe("Approved — reported by organizer");
    expect(JSON.stringify(await getPublicProtest(slug))).not.toContain("Finish by 17:00"); // conditions stay private
  });
  it("the organizer can decline to provide a status", async () => {
    const { e, slug } = await publish(org1, { permissionMode: "NOT_PROVIDED" });
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z" });
    expect((await getPublicProtest(slug))!.protest.permission).toMatchObject({ status: "UNKNOWN", label: "Status not provided" });
  });
  it("follows later changes in the tracker", async () => {
    const { e, slug } = await publish(org1);
    await recordPermission(e, { status: "PREPARED" });
    expect((await getPublicProtest(slug))!.protest.permission.label).toBe("Preparing — reported by organizer");
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z" });
    expect((await getPublicProtest(slug))!.protest.permission.label).toBe("Submitted — reported by organizer");
  });
});

describe("official information is held apart from organizer claims", () => {
  it("lists official links and venue guidance from sourced rules, and never organizer-private items", async () => {
    const e = await plan(org1);
    const info = await officialInfoForEvent(e);
    expect(info.checkedOn).toBe("2026-10-01");
    expect(info.links.map((l) => l.url)).toEqual(expect.arrayContaining(["https://delhipolice.gov.in/StandingOrderFiles/83377_Law%20and%20Order-48-2022.pdf"]));
    expect(info.links.some((l) => /Annexure B/.test(l.label))).toBe(true);
    expect(info.links.every((l) => /^https:\/\//.test(l.url))).toBe(true);
    const titles = info.guidance.map((g) => g.title);
    expect(titles).toEqual(expect.arrayContaining(["Banner, flag and stick size limits", "No weapons"]));
    expect(titles.join(" ")).not.toMatch(/liaison|volunteer|water|undertaking/i);
    expect(info.guidance.every((g) => g.source.length > 0)).toBe(true);
  });
  it("press leads are never offered as official links", async () => {
    const info = await officialInfoForEvent(await plan(org1));
    expect(info.links.map((l) => l.url).join(" ")).not.toMatch(/aninews|indiatvnews|psuwatch|lawtrend|livelaw/);
  });
});

describe("supporters: login-gated, undoable, aggregate-only", () => {
  it("counts are aggregates; a person counts once per kind; undo removes them", async () => {
    const { slug } = await publish(org1);
    expect(await toggleSupport(slug, sup.id, "PLANNING_TO_ATTEND")).toBe(true);
    expect(await toggleSupport(slug, sup2.id, "PLANNING_TO_ATTEND")).toBe(true);
    expect(await toggleSupport(slug, sup.id, "FOLLOWING")).toBe(true);
    expect((await getPublicProtest(slug))!.protest.counts).toMatchObject({ following: 1, interested: 0, planning: 2 });
    expect(await toggleSupport(slug, sup.id, "PLANNING_TO_ATTEND")).toBe(false); // undo
    expect((await getPublicProtest(slug))!.protest.counts.planning).toBe(1);
    await expect(query("INSERT INTO protest_supports (protest_id, user_id, kind) SELECT id, $1, 'FOLLOWING' FROM public_protests", [sup.id])).rejects.toThrow(); // database refuses a duplicate
  });
  it("the viewer sees only their own choices", async () => {
    const { slug } = await publish(org1);
    await toggleSupport(slug, sup.id, "INTERESTED");
    expect(await viewerState(slug, sup.id)).toMatchObject({ kinds: ["INTERESTED"] });
    expect(await viewerState(slug, sup2.id)).toEqual({ kinds: [], offers: [] });
    expect(await viewerState(slug, null)).toEqual({ kinds: [], offers: [] });
  });
  it("neither the public nor the organizer can obtain supporter identities", async () => {
    const { e, slug } = await publish(org1);
    for (const k of ["FOLLOWING", "INTERESTED", "PLANNING_TO_ATTEND"] as const) { await toggleSupport(slug, sup.id, k); await toggleSupport(slug, sup2.id, k); }
    await toggleOffer(slug, sup.id, "WATER_HELP");
    const everything = JSON.stringify(await Promise.all([getPublicProtest(slug), getPublicProtest(slug, { userId: org1.id }), getOwnerProtest(e.id), listProtests(), otherListedSameDate(slug), listUpdates(slug), toolkitForEvent(e, "http://x")]));
    for (const secret of [sup.id, sup2.id, "supporter.one@example.org", "supporter.two@example.org", "supporter"]) expect(everything, secret).not.toContain(secret);
    expect(JSON.parse(everything)[2].protest.counts).toMatchObject({ following: 2, interested: 2, planning: 2 });
  });
  it("no code path selects supporter identity except the viewer's own state", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
    walk("src");
    const offenders = files.filter((f) => /protest_support(s|_offers)/.test(readFileSync(f, "utf8")) && !f.endsWith("src/lib/protests.ts"));
    expect(offenders).toEqual([]);
    const src = readFileSync("src/lib/protests.ts", "utf8");
    const selects = [...src.matchAll(/"SELECT[^"]*FROM protest_support(?:s|_offers)[^"]*"|`SELECT[^`]*FROM protest_support(?:s|_offers)[^`]*`/g)].map((m) => m[0]);
    for (const s of selects) if (/user_id/.test(s.split("FROM")[0] ?? "") || /SELECT\s+\*/.test(s)) throw new Error(`selects supporter identity: ${s}`);
    for (const s of selects.filter((x) => /user_id/.test(x))) expect(s).toMatch(/s\.user_id=\$2/); // identity only ever filtered to the viewer
  });
  it("only enabled support options can be offered", async () => {
    const { slug } = await publish(org1);
    expect(await toggleOffer(slug, sup.id, "VOLUNTEER")).toBe(true);
    await expect(toggleOffer(slug, sup.id, "FIRST_AID_HELP")).rejects.toThrow(/not enabled/i);
    expect((await getPublicProtest(slug))!.protest.counts.offers).toEqual({ VOLUNTEER: 1 });
  });
  it("supporters cannot act on a draft, private, archived or moderated page", async () => {
    const d = await publish(org1, { visibility: "DRAFT" });
    await expect(toggleSupport(d.slug, sup.id, "FOLLOWING")).rejects.toThrow(/not open/i);
    const p = await publish(org1);
    await moderateProtest(admin, p.slug, "HIDE", "SPAM", "Spam listing");
    await expect(toggleSupport(p.slug, sup.id, "FOLLOWING")).rejects.toThrow(/not open/i);
  });
  it("collects no political, religious or identity fields: the tables hold only ids, kind and time", async () => {
    const cols = (await query("SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('protest_supports','protest_support_offers')")).map((c) => `${c.table_name}.${c.column_name}`).sort();
    expect(cols).toEqual(["protest_support_offers.created_at", "protest_support_offers.option_type", "protest_support_offers.protest_id", "protest_support_offers.user_id", "protest_supports.created_at", "protest_supports.kind", "protest_supports.protest_id", "protest_supports.user_id"]);
  });
});

describe("multiple protests at a shared venue", () => {
  it("public listings for the same venue and date see each other; private, unlisted and other dates do not appear", async () => {
    const a = await publish(org1, { title: "Protest A" });
    const b = await publish(org2, { title: "Protest B" });
    await publish(org2, { title: "Unlisted C", visibility: "UNLISTED" });
    await publish(org2, { title: "Private D", visibility: "PRIVATE" });
    await publish(org2, { title: "Other day E" }, { date: "2026-12-16" });
    const seenByA = await otherListedSameDate(a.slug);
    expect(seenByA.map((o) => o.title)).toEqual(["Protest B"]);
    expect((await otherListedSameDate(b.slug)).map((o) => o.title)).toEqual(["Protest A"]);
  });
  it("says nothing about capacity or availability: only titles, slugs and times", async () => {
    const a = await publish(org1, { title: "Protest A" });
    await publish(org2, { title: "Protest B" });
    const o = await otherListedSameDate(a.slug);
    expect(Object.keys(o[0]).sort()).toEqual(["endTime", "slug", "startTime", "title"]);
    expect(JSON.stringify(o)).not.toMatch(/capacity|remaining|available|blocked|unavailable/i);
  });
  it("a hidden listing no longer appears as 'another protest on this date'", async () => {
    const a = await publish(org1, { title: "Protest A" });
    const b = await publish(org2, { title: "Protest B" });
    await moderateProtest(admin, b.slug, "HIDE", "SPAM", "Spam listing");
    expect(await otherListedSameDate(a.slug)).toEqual([]);
  });
});

describe("moderation: platform rules, logged, viewpoint-neutral", () => {
  it("hiding one listing removes it publicly, keeps the log, and leaves an opposing listing untouched", async () => {
    const a = await publish(org1, { title: "March for school fees to be abolished", description: "We oppose the fee rise." });
    const b = await publish(org2, { title: "March for school fees to stay", description: "We support the fee rise." });
    await moderateProtest(admin, a.slug, "HIDE", "HARASSMENT", "Targets a named individual in the description");
    expect(await getPublicProtest(a.slug)).toBeNull();
    expect((await listProtests()).map((p) => p.slug)).toEqual([b.slug]);
    expect(await getPublicProtest(b.slug)).not.toBeNull();
    const m = (await query("SELECT action, reason_code, note, admin_user_id FROM moderation_actions"))[0];
    expect(m).toMatchObject({ action: "HIDE", reason_code: "HARASSMENT", admin_user_id: admin.userId });
    expect(m.note).toMatch(/named individual/);
    expect((await query("SELECT action, reason FROM audit_log WHERE action LIKE 'moderation.%'"))[0]).toMatchObject({ action: "moderation.hide" });
    const owner = await getPublicProtest(a.slug, { userId: org1.id });
    expect(owner!.hiddenNotice).toMatch(/hidden under the platform guidelines/);
  });
  it("hidden pages can be restored; removed pages cannot be edited or republished by the organizer", async () => {
    const a = await publish(org1);
    await moderateProtest(admin, a.slug, "HIDE", "SPAM", "Looks like spam");
    await moderateProtest(admin, a.slug, "RESTORE", "OTHER", "Reviewed: not spam");
    expect(await getPublicProtest(a.slug)).not.toBeNull();
    await moderateProtest(admin, a.slug, "REMOVE", "FRAUD", "Impersonates another group");
    expect(await getPublicProtest(a.slug)).toBeNull();
    await expect(saveProtest(a.e, org1, input())).rejects.toThrow(/removed/i);
    await expect(setVisibility(a.e.id, org1, "PUBLIC")).rejects.toThrow(/removed/i);
    expect((await query("SELECT count(*)::int AS n FROM moderation_actions"))[0].n).toBe(3);
  });
  it("needs a platform-rule reason and a note; only a human admin actor can act; reasons are conduct categories", async () => {
    const a = await publish(org1);
    await expect(moderateProtest(admin, a.slug, "HIDE", "I_DISLIKE_THE_CAUSE", "x y z")).rejects.toThrow(/reason/i);
    await expect(moderateProtest(admin, a.slug, "HIDE", "SPAM", "")).rejects.toThrow(/note/i);
    for (const bad of [null, { userId: "ai" }, { userId: "system" }] as any[]) await expect(moderateProtest(bad, a.slug, "HIDE", "SPAM", "note here")).rejects.toThrow(/human/i);
    expect((await getPublicProtest(a.slug))!.protest.moderation).toBe("OK");
  });
  it("suspending an organizer hides all their pages and stops publishing and supporter actions; reinstating restores them", async () => {
    const a = await publish(org1, { title: "Alpha one" });
    const a2 = await publish(org1, { title: "Alpha two" });
    const b = await publish(org2, { title: "Bravo one" });
    await setOrganizerSuspended(admin, org1.id, true, "FRAUD", "Repeated fraudulent listings");
    expect((await listProtests()).map((p) => p.title)).toEqual(["Bravo one"]);
    expect(await getPublicProtest(a.slug)).toBeNull();
    await expect(saveProtest(a.e, org1, input())).rejects.toThrow(/suspended/i);
    await expect(toggleSupport(a2.slug, sup.id, "FOLLOWING")).rejects.toThrow(/not open/i);
    expect(await getPublicProtest(b.slug)).not.toBeNull();
    await setOrganizerSuspended(admin, org1.id, false, "OTHER", "Appeal accepted");
    expect((await listProtests()).map((p) => p.title).sort()).toEqual(["Alpha one", "Alpha two", "Bravo one"]);
    expect((await query("SELECT action FROM moderation_actions ORDER BY created_at")).map((r) => r.action)).toEqual(["SUSPEND_ORGANIZER", "REINSTATE_ORGANIZER"]);
  });
  it("an admin account cannot be suspended through moderation", async () => {
    await expect(setOrganizerSuspended(admin, admin.userId, true, "OTHER", "test note")).rejects.toThrow(/admin/i);
  });
});

describe("updates, toolkit and analytics", () => {
  it("organizer updates appear on the page, screened for contact details", async () => {
    const { e, slug } = await publish(org1);
    await postUpdate(e.id, org1, "We will meet at the main gate at 10:15.");
    await expect(postUpdate(e.id, org1, "Email me asha@example.com")).rejects.toThrow(/email/i);
    await expect(postUpdate(e.id, org2, "Not my page")).rejects.toThrow(/owns this plan/i);
    expect((await listUpdates(slug)).map((u) => u.body)).toEqual(["We will meet at the main gate at 10:15."]);
  });
  it("the toolkit is built from the organizer's page and held guidance, with no forbidden claims", async () => {
    const { e } = await publish(org1);
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z" });
    const items = (await toolkitForEvent(e, "http://localhost:3000"))!;
    expect(toolkitViolations(items)).toEqual([]);
    const text = items.flatMap((i) => i.texts).join("\n");
    expect(text).toContain("Parents for Safe Schools");
    expect(text).toContain("Jantar Mantar");
    expect(text).toContain("Permission status (reported by the organizer): Submitted");
    expect(text).toMatch(/9 × 6 feet/);
    expect(text).toMatch(/http:\/\/localhost:3000\/protests\//);
    for (const secret of ["private.person@example.org", "9810012345", "Private Person"]) expect(text).not.toContain(secret);
  });
  it("public analytics events drop any property outside the allowed dimensions", async () => {
    await track("PROTEST_FOLLOWED", null, { city: "Delhi", category: "EDUCATION", email: "a@b.org", politicalView: "x" });
    expect((await one("SELECT props FROM analytics_events WHERE name='PROTEST_FOLLOWED'"))!.props).toEqual({ city: "Delhi", category: "EDUCATION" });
  });
});
