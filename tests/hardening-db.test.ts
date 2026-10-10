// v1.0.1 public-beta hardening against the test database: durable rate limits, verified-email gating, reports, organizer identity.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { generateEvaluation } from "@/lib/knowledge";
import { createEvent, getEvent } from "@/lib/store";
import { getOwnerProtest, getPublicProtest, listProtests, ownerIdentityFlags, saveProtest, setVisibility, toggleOffer, toggleSupport, type ProtestInput } from "@/lib/protests";
import { moderateProtest } from "@/lib/moderation";
import { clearIdentityReview, listIdentityReview, listReports, resolveReport, submitReport } from "@/lib/reports";
import { allow } from "@/lib/ratelimit";
import { consumeVerification, isEmailVerified, sendVerification } from "@/lib/verification";
import { ensureDefaultTemplates } from "@/lib/default-templates";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { baseAnswers } from "./fixtures";

let admin: { userId: string }, org: { id: string }, org2: { id: string }, sup: { id: string }, unv: { id: string };
let district: string, jm: string;
const mkUser = async (email: string, verified = true, role = "user") => (await one<{ id: string }>("INSERT INTO users (email, password_hash, role, email_verified_at) VALUES ($1,'x',$2, CASE WHEN $3 THEN now() END) RETURNING id", [email, role, verified]))!;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function plan(user: { id: string }, date = "2026-12-15") {
  const e = (await getEvent(await createEvent(`anon-${user.id}`, user.id, district, { ...baseAnswers, date, startTime: "10:30", endTime: "15:30", attendance: 500 } as any, jm)))!;
  await generateEvaluation(e, "GENERATED");
  return e;
}
const input = (over: Partial<ProtestInput> = {}): ProtestInput => ({
  title: "Parents for Safe Schools", summary: "Parents asking for safer school buildings.", description: "A peaceful gathering.", organizerDisplayName: "Parents for Safe Schools",
  organizerType: "group", category: "EDUCATION", logistics: "", visibility: "PUBLIC", permissionMode: "SYNC", publicFields: { organizerType: true, logistics: true, officialInfo: true },
  supportOptions: [{ type: "VOLUNTEER", note: "", link: "" }], ...over,
});
const publish = async (user: { id: string }, over: Partial<ProtestInput> = {}) => { const e = await plan(user); return { e, slug: (await saveProtest(e, user, input(over))).slug }; };
/** The token is only ever in the email; read it from the outbox the way a person would from their inbox. */
const tokenFor = async (email: string) => (await one<{ body: string }>("SELECT body FROM email_outbox WHERE to_email=$1 ORDER BY created_at DESC LIMIT 1", [email]))!.body.match(/token=([0-9a-f]{64})/)![1];

beforeAll(async () => { await migrate(process.env.DATABASE_URL!); });
afterAll(async () => { await pool().end(); });
beforeEach(async () => {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories, events, analytics_events, email_outbox RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  admin = { userId: (await mkUser("admin@x.org", true, "admin")).id };
  org = await mkUser("organizer.one@example.org"); org2 = await mkUser("organizer.two@example.org");
  sup = await mkUser("supporter.one@example.org"); unv = await mkUser("unverified@example.org", false);
  const r = await loadDelhiCorpus({ actor: admin, verifiedOn: "2026-10-01", confirmVerified: true });
  district = r.places.DIST; jm = r.places.JM;
});

describe("durable rate limiting", () => {
  it("is atomic across concurrent callers: exactly `max` of 25 simultaneous calls pass", async () => {
    const key = `t:${Math.random()}`;
    const results = await Promise.all(Array.from({ length: 25 }, () => allow(key, 5, 60_000)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
  it("counts are shared through the database, not process memory", async () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) await allow(key, 3, 60_000);
    // a second app instance sees the same rows: simulate by reading the counter directly
    const row = await one<{ hits: number }>("SELECT hits FROM rate_limits WHERE key=$1", [key]);
    expect(row!.hits).toBe(3);
    expect(await allow(key, 3, 60_000)).toBe(false);
  });
  it("keys are independent", async () => {
    const a = `t:${Math.random()}`, b = `t:${Math.random()}`;
    for (let i = 0; i < 4; i++) await allow(a, 2, 60_000);
    expect(await allow(a, 2, 60_000)).toBe(false);
    expect(await allow(b, 2, 60_000)).toBe(true);
  });
});

describe("verified email", () => {
  it("an unverified account can save a draft but cannot make a page public or unlisted", async () => {
    const e = await plan(unv);
    await expect(saveProtest(e, unv, input({ visibility: "PUBLIC" }))).rejects.toThrow(/Confirm your email/);
    await expect(saveProtest(e, unv, input({ visibility: "UNLISTED" }))).rejects.toThrow(/Confirm your email/);
    const draft = await saveProtest(e, unv, input({ visibility: "DRAFT" }));
    await expect(setVisibility(e.id, unv, "PUBLIC")).rejects.toThrow(/Confirm your email/);
    expect(await getPublicProtest(draft.slug)).toBeNull();
    await setVisibility(e.id, unv, "PRIVATE"); // unpublishing never needs verification
  });
  it("an unverified supporter cannot act, and rows that exist for unverified accounts are not counted", async () => {
    const { slug } = await publish(org);
    await expect(toggleSupport(slug, unv.id, "PLANNING_TO_ATTEND")).rejects.toThrow(/Confirm your email/);
    await expect(toggleOffer(slug, unv.id, "VOLUNTEER")).rejects.toThrow(/Confirm your email/);
    // a row that predates the rule (or was forged) still does not move the public count
    const pid = (await one<{ id: string }>("SELECT id FROM public_protests WHERE slug=$1", [slug]))!.id;
    await query("INSERT INTO protest_supports (protest_id, user_id, kind) VALUES ($1,$2,'PLANNING_TO_ATTEND')", [pid, unv.id]);
    await query("INSERT INTO protest_support_offers (protest_id, user_id, option_type) VALUES ($1,$2,'VOLUNTEER')", [pid, unv.id]);
    expect((await getPublicProtest(slug))!.protest.counts).toMatchObject({ planning: 0, offers: {} });
    await toggleSupport(slug, sup.id, "PLANNING_TO_ATTEND");
    expect((await getPublicProtest(slug))!.protest.counts.planning).toBe(1);
  });
  it("confirming the emailed link unlocks publishing and counting; the token is stored hashed, works once, and a newer link replaces it", async () => {
    expect(await isEmailVerified(unv.id)).toBe(false);
    expect(await sendVerification(unv.id)).toBe("PENDING"); // no mail provider configured in tests: recorded in the outbox
    const first = await tokenFor("unverified@example.org");
    expect(await one("SELECT 1 FROM email_verifications WHERE token_hash=$1", [first])).toBeNull(); // plaintext token is not stored
    expect(await one("SELECT 1 FROM email_verifications WHERE token_hash=$1", [sha(first)])).not.toBeNull();
    await sendVerification(unv.id);
    const second = await tokenFor("unverified@example.org");
    expect(second).not.toBe(first);
    expect(await consumeVerification(first)).toBe("INVALID"); // replaced
    expect(await consumeVerification(second)).toBe("VERIFIED");
    expect(await consumeVerification(second)).toBe("ALREADY_USED");
    expect(await isEmailVerified(unv.id)).toBe(true);
    const e = await plan(unv);
    const r = await saveProtest(e, unv, input({ visibility: "PUBLIC" }));
    await toggleSupport(r.slug, unv.id, "FOLLOWING");
    expect((await getPublicProtest(r.slug))!.protest.counts.following).toBe(1);
  });
  it("rejects malformed, unknown and expired tokens", async () => {
    expect(await consumeVerification("nonsense")).toBe("INVALID");
    expect(await consumeVerification("a".repeat(64))).toBe("INVALID");
    await sendVerification(unv.id);
    const t = await tokenFor("unverified@example.org");
    await query("UPDATE email_verifications SET expires_at = now() - interval '1 minute'");
    expect(await consumeVerification(t)).toBe("EXPIRED");
    expect(await isEmailVerified(unv.id)).toBe(false);
  });
  it("a token for an address the account no longer has proves nothing", async () => {
    await sendVerification(unv.id);
    const t = await tokenFor("unverified@example.org");
    await query("UPDATE users SET email='changed@example.org' WHERE id=$1", [unv.id]);
    expect(await consumeVerification(t)).toBe("INVALID");
  });
  it("an already-verified account is not sent another link", async () => {
    expect(await sendVerification(sup.id)).toBe("ALREADY");
    expect(await query("SELECT 1 FROM email_outbox")).toEqual([]);
  });
});

describe("user reports", () => {
  it("anyone can report an open page with a neutral reason; a report never hides anything", async () => {
    const { slug } = await publish(org);
    expect(await submitReport({ slug, reason: "HARASSMENT", note: "targets a named person", reporterUserId: sup.id, network: "1.2.3.4" })).toBe("RECEIVED");
    expect(await submitReport({ slug, reason: "SPAM", note: "", reporterUserId: null, network: "5.6.7.8" })).toBe("RECEIVED");
    expect((await getPublicProtest(slug))!.protest.moderation).toBe("OK");
    expect((await listProtests()).map((p) => p.slug)).toContain(slug);
    expect((await listReports()).length).toBe(2);
  });
  it("is deduplicated per reporter while open, validated, and refused for drafts, hidden pages and the owner's own page", async () => {
    const { slug } = await publish(org);
    await submitReport({ slug, reason: "FRAUD", note: "", reporterUserId: sup.id, network: "x" });
    expect(await submitReport({ slug, reason: "FRAUD", note: "", reporterUserId: sup.id, network: "x" })).toBe("ALREADY_REPORTED");
    await expect(submitReport({ slug, reason: "I_DISAGREE", note: "", reporterUserId: sup.id, network: "x" })).rejects.toThrow(/Choose what is wrong/);
    await expect(submitReport({ slug, reason: "OTHER", note: "no", reporterUserId: sup.id, network: "x" })).rejects.toThrow(/briefly/);
    await expect(submitReport({ slug, reason: "SPAM", note: "x".repeat(501), reporterUserId: sup.id, network: "x" })).rejects.toThrow(/500/);
    await expect(submitReport({ slug, reason: "SPAM", note: "", reporterUserId: org.id, network: "x" })).rejects.toThrow(/own page/);
    const d = await publish(org2, { visibility: "DRAFT" });
    await expect(submitReport({ slug: d.slug, reason: "SPAM", note: "", reporterUserId: sup.id, network: "y" })).rejects.toThrow(/not available/);
    await moderateProtest(admin, slug, "HIDE", "SPAM", "test");
    await expect(submitReport({ slug, reason: "SPAM", note: "", reporterUserId: null, network: "z" })).rejects.toThrow(/not available/);
  });
  it("there is no viewpoint reason: 'disagree' style categories do not exist", async () => {
    const def = (await one<{ d: string }>("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid='protest_reports'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%reason_code%'"))!.d;
    expect(def).toMatch(/VIOLENCE_OR_THREAT/);
    expect(def).not.toMatch(/DISAGREE|POLITIC|OFFENSIVE|BIAS|OPINION/i);
  });
  it("an admin acts or dismisses with a note; actions are logged; other open reports on an actioned page settle with it", async () => {
    const { slug } = await publish(org);
    await submitReport({ slug, reason: "DOXXING", note: "", reporterUserId: sup.id, network: "a" });
    await submitReport({ slug, reason: "DOXXING", note: "", reporterUserId: null, network: "b" });
    const [r1] = await listReports();
    await expect(resolveReport({ userId: "" } as any, r1.id, "DISMISS", "no")).rejects.toThrow();
    await expect(resolveReport(admin, r1.id, "HIDE", "")).rejects.toThrow(/note/i);
    await resolveReport(admin, r1.id, "HIDE", "Shows a private address");
    expect((await getPublicProtest(slug))).toBeNull();
    const all = await listReports("ALL");
    expect(all.every((r: any) => r.status === "ACTIONED")).toBe(true);
    const m = await one<{ reason_code: string; note: string }>("SELECT reason_code, note FROM moderation_actions WHERE action='HIDE'");
    expect(m).toMatchObject({ reason_code: "DOXXING", note: "Shows a private address" });
    await expect(resolveReport(admin, r1.id, "DISMISS", "again")).rejects.toThrow(/already resolved/);
  });
  it("a dismissed report leaves the page untouched and is audited", async () => {
    const { slug } = await publish(org);
    await submitReport({ slug, reason: "OTHER", note: "I just dislike it", reporterUserId: sup.id, network: "a" });
    const [r] = await listReports();
    await resolveReport(admin, r.id, "DISMISS", "Not a platform-rule issue");
    expect((await getPublicProtest(slug))!.protest.moderation).toBe("OK");
    expect(await one("SELECT 1 FROM audit_log WHERE action='report.dismiss'")).not.toBeNull();
  });
  it("the organizer-facing shapes never carry reports or reporter identity", async () => {
    const { e, slug } = await publish(org);
    await submitReport({ slug, reason: "SPAM", note: "secret reporter note", reporterUserId: sup.id, network: "a" });
    const blob = JSON.stringify([await getOwnerProtest(e.id), await getPublicProtest(slug, { userId: org.id }), await listProtests()]);
    for (const s of ["secret reporter note", sup.id, "supporter.one@example.org", "reporter"]) expect(blob).not.toContain(s);
  });
});

describe("anti-impersonation", () => {
  it("refuses a name that presents the page as BookMyProtest", async () => {
    const e = await plan(org);
    await expect(saveProtest(e, org, input({ organizerDisplayName: "BookMyProtest Team" }))).rejects.toThrow(/cannot present the page as BookMyProtest/);
    await expect(saveProtest(e, org, input({ organizerDisplayName: "B00k My Pr0test" }))).rejects.toThrow(/cannot present/);
  });
  it("flags look-alike and authority-like names for human review without blocking or penalising", async () => {
    await publish(org, { organizerDisplayName: "Citizens for Clean Air" });
    const e2 = await plan(org2);
    const r = await saveProtest(e2, org2, input({ title: "Clean air walk", organizerDisplayName: "Citizens for Clean Air" }));
    expect((await getPublicProtest(r.slug))!.protest.visibility).toBe("PUBLIC"); // not blocked
    expect(await ownerIdentityFlags(e2.id)).toEqual(["LOOKALIKE_NAME"]);
    const e3 = await plan(sup, "2026-12-16");
    await saveProtest(e3, sup, input({ title: "Staff meeting", organizerDisplayName: "Delhi Police Welfare Group" }));
    expect((await listIdentityReview()).map((x: any) => x.organizer_display_name).sort()).toEqual(["Citizens for Clean Air", "Delhi Police Welfare Group"]);
    // the public shape carries no flag at all
    expect(JSON.stringify(await getPublicProtest(r.slug))).not.toMatch(/LOOKALIKE|AUTHORITY_LIKE|identity/i);
  });
  it("clearing a review is a logged human decision; renaming reopens it", async () => {
    const e = await plan(org);
    const { slug } = await saveProtest(e, org, input({ organizerDisplayName: "Official Delhi Police Union" }));
    expect(await listIdentityReview()).toHaveLength(1);
    await expect(clearIdentityReview({ userId: "" } as any, slug, "ok")).rejects.toThrow();
    await clearIdentityReview(admin, slug, "Union of retired staff; checked");
    expect(await listIdentityReview()).toHaveLength(0);
    expect(await ownerIdentityFlags(e.id)).toEqual([]);
    await saveProtest(e, org, input({ organizerDisplayName: "Official Delhi Police Union" })); // same name: stays cleared
    expect(await listIdentityReview()).toHaveLength(0);
    await saveProtest(e, org, input({ organizerDisplayName: "Official Delhi Police Union of India" })); // new name: reviewed again
    expect(await listIdentityReview()).toHaveLength(1);
    expect(await one("SELECT 1 FROM audit_log WHERE action='identity.review_cleared'")).not.toBeNull();
  });
  it("the public page states only what is true: self-declared name, email confirmed or not, month the account began", async () => {
    const { slug } = await publish(org);
    const s1 = (await getPublicProtest(slug))!.protest.organizerSignals;
    expect(s1).toMatchObject({ nameSelfDeclared: true, emailConfirmed: true });
    expect(s1.memberSince).toMatch(/^\d{4}-\d{2}$/);
    await query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [org.id]); // e.g. address changed later
    expect((await getPublicProtest(slug))!.protest.organizerSignals.emailConfirmed).toBe(false);
    expect(JSON.stringify(await getPublicProtest(slug))).not.toContain("organizer.one@example.org");
  });
});
