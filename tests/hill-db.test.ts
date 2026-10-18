// v1.1 against the test database: issue catalogue, search, suggestions, digital campaigns, participation privacy, outcomes, reports and corrections.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { createIssueDraft, getIssue, getIssueForEdit, isFollowingIssue, listIssuesForAdmin, protestsForIssue, publishIssue, resolveSuggestion, saveIssue, searchIssues, suggestIssue, toggleFollowIssue, archiveIssue } from "@/lib/issues";
import {
  addOutcomeEntry, campaignViewerState, getOwnerCampaign, getPublicCampaign, listCampaigns, postCampaignUpdate, saveCampaign, setActionIntent, setCampaignVisibility, setOutcomeState, toggleCampaignParticipation, type CampaignInput,
} from "@/lib/digital-actions";
import { addCorrection, clearDisputed, listContentReports, moderateContent, resolveContentReport, submitContentReport } from "@/lib/content-moderation";
import { ensureDefaultTemplates } from "@/lib/default-templates";

let admin: { userId: string }, org: { id: string }, org2: { id: string }, sup: { id: string }, sup2: { id: string }, unv: { id: string };
const mkUser = async (email: string, verified = true, role = "user") => (await one<{ id: string }>("INSERT INTO users (email, password_hash, role, email_verified_at) VALUES ($1,'x',$2, CASE WHEN $3 THEN now() END) RETURNING id", [email, role, verified]))!;

const draft = (o: Record<string, unknown> = {}) => ({
  title: "Water supply interruptions in Ward 12", summary: "Residents report repeated interruptions to piped water.", description: "Piped water to Ward 12 has been interrupted on a number of days this year, according to utility logs and resident reports.",
  whyDiscussed: "The utility and residents' associations have given different explanations for the interruptions.", scopeLevel: "LOCAL", city: "Pune", state: "Maharashtra", category: "PUBLIC_SERVICES",
  perspectives: [{ label: "Utility", summary: "Says the interruptions followed scheduled pipe maintenance.", sourceUrl: "https://example.org/utility-statement" }, { label: "Residents' association", summary: "Says maintenance was never announced.", sourceUrl: "" }],
  disputedClaims: [{ claim: "Maintenance was announced in advance", dispute: "The utility and residents disagree whether notices were issued.", sourceUrl: "" }], developments: [{ date: "2026-09-20", text: "The utility published its outage log.", sourceTitle: "Outage log", sourceUrl: "https://example.gov.in/log" }],
  unknowns: "The cause of the March interruptions has not been published.", lastCheckedOn: "2026-10-01", ...o,
});
const SRC = [{ kind: "OFFICIAL_RECORD", title: "Utility outage log", url: "https://example.gov.in/log", publisher: "Pune Water Board" }, { kind: "INDEPENDENT_REPORTING", title: "Local report on the outages", url: "https://example.org/report" }];
/** A published issue. NOT real-world content: test fixtures only. */
async function mkIssue(o: Record<string, unknown> = {}, sources = SRC): Promise<{ id: string; slug: string }> {
  const d = draft(o);
  const id = await createIssueDraft(admin, { title: d.title, category: d.category, city: d.city, state: d.state });
  await saveIssue(admin, id, d as any, sources as any);
  await publishIssue(admin, id, "Checked each source against its page (test fixture)");
  return { id, slug: (await getIssueForEdit(id))!.slug };
}
const camp = (issueSlug: string, o: Record<string, unknown> = {}): CampaignInput => ({
  issueSlug, title: "Publish a refund policy", summary: "Asking a retailer to publish a clear refund policy.", requestedChange: "Publish a written refund policy on the retailer's website within 60 days.", institution: "Example Retail Ltd",
  closureCriteria: "Closed when the policy is published, or on the review date if not.", organizerDisplayName: "Shoppers' Group", startsOn: "2026-11-01", reviewOn: "2026-12-31",
  evidence: [{ claim: "The retailer's website does not state a refund policy", sourceTitle: "Retailer website, checked 1 Oct", sourceUrl: "https://example.com/terms" }],
  actions: [{ category: "CONSUMER_PAUSE", label: "Pause purchases for one month", detail: "", link: "" }, { category: "FEEDBACK_PUBLIC_CHANNEL", label: "Send one message through their feedback form", detail: "", link: "" }], visibility: "PUBLIC", ...o,
} as CampaignInput);

beforeAll(async () => { await migrate(process.env.DATABASE_URL!); });
afterAll(async () => { await pool().end(); });
beforeEach(async () => {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories, events, analytics_events, email_outbox, issues, content_reports, content_corrections RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  admin = { userId: (await mkUser("admin@x.org", true, "admin")).id };
  org = await mkUser("organizer.one@example.org"); org2 = await mkUser("organizer.two@example.org"); sup = await mkUser("supporter.one@example.org"); sup2 = await mkUser("supporter.two@example.org"); unv = await mkUser("unverified@example.org", false);
});

describe("issue catalogue: only a person publishes, and only a complete sourced issue", () => {
  it("a draft is invisible; an incomplete issue cannot be published; publishing is a logged human act", async () => {
    const id = await createIssueDraft(admin, { title: "Water supply interruptions", category: "PUBLIC_SERVICES", city: "Pune", state: "Maharashtra" });
    const slug = (await getIssueForEdit(id))!.slug;
    expect(await getIssue(slug)).toBeNull();
    expect(await searchIssues()).toEqual([]);
    await expect(publishIssue(admin, id, "checked")).rejects.toThrow(/Cannot publish/);
    await saveIssue(admin, id, draft() as any, SRC as any);
    await expect(publishIssue({ userId: "" } as any, id, "x")).rejects.toThrow();
    await expect(publishIssue(admin, id, "")).rejects.toThrow(/note/);
    expect(await getIssue(slug)).toBeNull(); // saving never publishes
    await publishIssue(admin, id, "Checked sources (fixture)");
    expect((await getIssue(slug))!.title).toBe("Water supply interruptions in Ward 12");
    expect(await one("SELECT 1 FROM audit_log WHERE action='issue.publish'")).not.toBeNull();
  });
  it("stores sources with https links only and keeps them separate from the legal-rule source registry", async () => {
    const id = await createIssueDraft(admin, { title: "Water supply interruptions", category: "PUBLIC_SERVICES", city: "Pune", state: "Maharashtra" });
    await expect(saveIssue(admin, id, draft() as any, [{ kind: "OFFICIAL_RECORD", title: "x", url: "http://insecure.example" }] as any)).rejects.toThrow(/https/);
    await saveIssue(admin, id, draft() as any, SRC as any);
    expect((await query("SELECT count(*)::int AS n FROM issue_sources"))[0].n).toBe(2);
    expect((await query("SELECT count(*)::int AS n FROM sources"))[0].n).toBe(0); // the Delhi legal-rule registry is untouched
  });
  it("a published issue must stay complete when edited, and archiving removes it from public view", async () => {
    const { id, slug } = await mkIssue();
    await expect(saveIssue(admin, id, draft({ unknowns: "" }) as any, SRC as any)).rejects.toThrow(/stay complete/);
    await archiveIssue(admin, id, "Superseded");
    expect(await getIssue(slug)).toBeNull();
  });
  it("an issue exists without any protest or campaign, and says so", async () => {
    const { slug } = await mkIssue();
    expect(await protestsForIssue(slug)).toEqual([]);
    expect(await listCampaigns({ issueSlug: slug })).toEqual([]);
    const i = (await getIssue(slug))!;
    expect(i.unknowns).toMatch(/not been published/);
    expect(i.perspectives.length).toBeGreaterThan(1);
    expect(i.disputedClaims.length).toBe(1);
  });
});

describe("search: keyword, place and topic; ordering is documented and impersonal", () => {
  beforeEach(async () => {
    await mkIssue({ title: "Water supply interruptions in Ward 12", city: "Pune", state: "Maharashtra", category: "PUBLIC_SERVICES", lastCheckedOn: "2026-09-01" });
    await mkIssue({ title: "Water quality testing in Nashik schools", city: "Nashik", state: "Maharashtra", category: "EDUCATION", lastCheckedOn: "2026-10-05" });
    await mkIssue({ title: "Bus route cuts in Bengaluru", city: "Bengaluru", state: "Karnataka", category: "TRANSPORT", scopeLevel: "LOCAL", description: "Services on this route were reduced this year, according to the transport authority and local commuters.", summary: "Commuters report fewer buses." });
    await mkIssue({ title: "Nationwide refund rules for online orders", city: "", state: "", scopeLevel: "NATIONAL", category: "CONSUMER_RIGHTS", description: "Online retailers publish refund terms of differing clarity, according to a consumer-affairs review.", summary: "Refund terms vary between retailers." });
  });
  it("finds by keyword, topic, state, city and nationwide", async () => {
    expect((await searchIssues({ q: "water" })).map((h) => h.issue.title).sort()).toEqual(["Water quality testing in Nashik schools", "Water supply interruptions in Ward 12"]);
    expect((await searchIssues({ category: "TRANSPORT" })).map((h) => h.issue.title)).toEqual(["Bus route cuts in Bengaluru"]);
    expect((await searchIssues({ state: "Karnataka" })).map((h) => h.issue.title).sort()).toEqual(["Bus route cuts in Bengaluru", "Nationwide refund rules for online orders"]); // nationwide issues apply everywhere
    expect((await searchIssues({ nationwide: true })).map((h) => h.issue.title)).toEqual(["Nationwide refund rules for online orders"]);
    expect((await searchIssues({ q: "nothing-matches-this" }))).toEqual([]);
  });
  it("orders by relevance, then place, then recency of the information check, then source quality", async () => {
    const r = await searchIssues({ q: "water", state: "Maharashtra" });
    expect(r.map((h) => h.issue.title)).toEqual(["Water quality testing in Nashik schools", "Water supply interruptions in Ward 12"]); // equal relevance and place: more recently checked first
    const c = await searchIssues({ q: "water", city: "Pune" });
    expect(c[0].issue.title).toBe("Water supply interruptions in Ward 12"); // city match outranks recency
  });
  it("following an issue, or any amount of participation, never changes the order", async () => {
    const before = (await searchIssues({ q: "water" })).map((h) => h.issue.slug);
    const slug = (await searchIssues({ q: "water" }))[1].issue.slug;
    for (const u of [sup, sup2, org, org2]) await toggleFollowIssue(slug, u.id);
    expect((await searchIssues({ q: "water" })).map((h) => h.issue.slug)).toEqual(before);
  });
  it("hidden or removed issues disappear from search and from the page", async () => {
    const hit = (await searchIssues({ q: "bus" }))[0].issue;
    await moderateContent(admin, "ISSUE", hit.slug, "HIDE", "SPAM", "test");
    expect(await searchIssues({ q: "bus" })).toEqual([]);
    expect(await getIssue(hit.slug)).toBeNull();
    await moderateContent(admin, "ISSUE", hit.slug, "RESTORE", "SPAM", "test restored");
    expect((await searchIssues({ q: "bus" })).length).toBe(1);
  });
});

describe("suggestions and following", () => {
  it("a confirmed user can suggest; nothing is published; a human may start a draft from it", async () => {
    await expect(suggestIssue(unv.id, { title: "Potholes on Station Road", description: "Large potholes have formed on Station Road since July.", sourceUrl: "", city: "Pune", state: "Maharashtra", category: "CIVIC_INFRASTRUCTURE" })).rejects.toThrow(/Confirm your email/);
    await suggestIssue(sup.id, { title: "Potholes on Station Road", description: "Large potholes have formed on Station Road since July.", sourceUrl: "https://example.org/report", city: "Pune", state: "Maharashtra", category: "CIVIC_INFRASTRUCTURE" });
    expect(await searchIssues()).toEqual([]);
    expect((await listIssuesForAdmin()).length).toBe(0);
    const s = (await query<{ id: string }>("SELECT id FROM issue_suggestions"))[0];
    await expect(resolveSuggestion(admin, s.id, "PROMOTED", "")).rejects.toThrow(/note/);
    const issueId = await resolveSuggestion(admin, s.id, "PROMOTED", "Worth a sourced page");
    expect(issueId).toBeTruthy();
    expect((await getIssueForEdit(issueId!))!.status).toBe("DRAFT"); // a draft, never published
    expect(await searchIssues()).toEqual([]);
  });
  it("validates suggestions: personal details, https source, daily limit", async () => {
    await expect(suggestIssue(sup.id, { title: "Short", description: "Large potholes have formed on Station Road since July.", sourceUrl: "", city: "", state: "", category: "OTHER" })).rejects.toThrow(/title/);
    await expect(suggestIssue(sup.id, { title: "Potholes on Station Road", description: "Call him on 9810012345 about the potholes on the road", sourceUrl: "", city: "", state: "", category: "OTHER" })).rejects.toThrow(/phone/);
    await expect(suggestIssue(sup.id, { title: "Potholes on Station Road", description: "Large potholes have formed on Station Road since July.", sourceUrl: "ftp://x", city: "", state: "", category: "OTHER" })).rejects.toThrow(/https/);
    for (let n = 0; n < 3; n++) await suggestIssue(sup.id, { title: `Potholes on Station Road ${n}`, description: "Large potholes have formed on Station Road since July.", sourceUrl: "", city: "", state: "", category: "OTHER" });
    await expect(suggestIssue(sup.id, { title: "Another suggestion today", description: "Large potholes have formed on Station Road since July.", sourceUrl: "", city: "", state: "", category: "OTHER" })).rejects.toThrow(/limit/);
  });
  it("following needs a confirmed email, is undoable, counts only confirmed accounts and shows only your own state", async () => {
    const { slug } = await mkIssue();
    await expect(toggleFollowIssue(slug, unv.id)).rejects.toThrow(/Confirm your email/);
    expect(await toggleFollowIssue(slug, sup.id)).toBe(true);
    await query("INSERT INTO issue_followers (issue_id, user_id) SELECT id, $1 FROM issues", [unv.id]); // forged row for an unconfirmed account
    expect((await getIssue(slug))!.followers).toBe(1);
    expect(await isFollowingIssue(slug, sup.id)).toBe(true);
    expect(await isFollowingIssue(slug, sup2.id)).toBe(false);
    expect(await toggleFollowIssue(slug, sup.id)).toBe(false);
    expect((await getIssue(slug))!.followers).toBe(0);
    expect(JSON.stringify(await getIssue(slug))).not.toMatch(/@|supporter/);
  });
});

describe("digital campaigns: creation, gates and refused tactics", () => {
  it("must be about a published issue; a draft may be incomplete but still obeys the content rules", async () => {
    const { slug } = await mkIssue();
    await expect(saveCampaign(org, camp("no-such-issue"))).rejects.toThrow(/published issue/);
    const dr = await saveCampaign(org, camp(slug, { visibility: "DRAFT", requestedChange: "tbd", evidence: [], closureCriteria: "" }));
    expect(await getPublicCampaign(dr.slug)).toBeNull(); // a draft is private to its owner
    expect((await getPublicCampaign(dr.slug, org.id))!.isOwner).toBe(true);
    await expect(saveCampaign(org, camp(slug, { visibility: "DRAFT", summary: "Flood their inbox until they answer" }))).rejects.toThrow(/floods of messages/);
    await expect(saveCampaign(org, camp(slug, { visibility: "DRAFT", requestedChange: "Bankrupt the company" }))).rejects.toThrow(/not designed to damage/);
  });
  it("publishing needs a confirmed email, a complete page and cited evidence; naming an institution requires citations", async () => {
    const { slug } = await mkIssue();
    await expect(saveCampaign(unv, camp(slug))).rejects.toThrow(/Confirm your email/);
    await expect(saveCampaign(org, camp(slug, { evidence: [] }))).rejects.toThrow(/cited fact/);
    await expect(saveCampaign(org, camp(slug, { actions: [] }))).rejects.toThrow(/at least one action/);
    await expect(saveCampaign(org, camp(slug, { reviewOn: "2026-10-01" }))).rejects.toThrow(/after the start/);
    await expect(saveCampaign(org, camp(slug, { organizerDisplayName: "BookMyProtest Team" }))).rejects.toThrow(/cannot present the campaign as BookMyProtest/);
    const ok = await saveCampaign(org, camp(slug));
    const pub = (await getPublicCampaign(ok.slug))!.campaign;
    expect(pub.visibility).toBe("PUBLIC");
    expect(pub.outcomeState).toBe("ACTIVE");
    expect(pub.actions.map((a) => a.category).sort()).toEqual(["CONSUMER_PAUSE", "FEEDBACK_PUBLIC_CHANNEL"]);
  });
  it("only the owner can edit; edits to the request or actions after publication are disclosed on the page", async () => {
    const { slug } = await mkIssue();
    const { slug: cs } = await saveCampaign(org, camp(slug));
    await expect(saveCampaign(org2, camp(slug), cs)).rejects.toThrow(/owns this campaign/);
    await saveCampaign(org, camp(slug, { summary: "A new summary of the same ask." }), cs);
    expect((await getPublicCampaign(cs))!.campaign.updates).toEqual([]);
    await saveCampaign(org, camp(slug, { requestedChange: "Publish a written refund policy and a contact for refund disputes within 60 days." }), cs);
    expect((await getPublicCampaign(cs))!.campaign.updates[0].body).toMatch(/edited the requested change/);
  });
  it("unpublishing returns it to private; the issue page links the live campaign", async () => {
    const { slug } = await mkIssue();
    const { slug: cs } = await saveCampaign(org, camp(slug));
    expect((await listCampaigns({ issueSlug: slug })).map((c) => c.slug)).toEqual([cs]);
    await setCampaignVisibility(org, cs, "DRAFT");
    expect(await getPublicCampaign(cs)).toBeNull();
    expect(await listCampaigns({ issueSlug: slug })).toEqual([]);
  });
  it("organizer name signals reuse the identity review: look-alikes are flagged for a person, not blocked", async () => {
    const { slug } = await mkIssue();
    await saveCampaign(org, camp(slug, { organizerDisplayName: "Citizens for Clean Air" }));
    const r = await saveCampaign(org2, camp(slug, { title: "Another refund request", organizerDisplayName: "Citizens for Clean Air" }));
    expect((await query("SELECT identity_flags FROM digital_campaigns WHERE slug=$1", [r.slug]))[0].identity_flags).toEqual(["LOOKALIKE_NAME"]);
    expect((await getPublicCampaign(r.slug))!.campaign.visibility).toBe("PUBLIC");
  });
});

describe("participation is voluntary, undoable and aggregate-only", () => {
  let cs: string, actionIds: string[];
  beforeEach(async () => {
    const { slug } = await mkIssue();
    cs = (await saveCampaign(org, camp(slug))).slug;
    actionIds = (await getPublicCampaign(cs))!.campaign.actions.map((a) => a.id);
  });
  it("a confirmed user records an intention, sees it, can change it and withdraw; the public sees totals only", async () => {
    await expect(toggleCampaignParticipation(cs, unv.id, "FOLLOWING")).rejects.toThrow(/Confirm your email/);
    await expect(setActionIntent(cs, unv.id, actionIds[0], "INTENDS")).rejects.toThrow(/Confirm your email/);
    await setActionIntent(cs, sup.id, actionIds[0], "INTENDS");
    await setActionIntent(cs, sup2.id, actionIds[0], "INTENDS");
    await setActionIntent(cs, sup2.id, actionIds[0], "COMPLETED_SELF_REPORTED");
    expect(await campaignViewerState(cs, sup.id)).toEqual({ kinds: [], intents: { [actionIds[0]]: "INTENDS" } });
    expect(await campaignViewerState(cs, null)).toEqual({ kinds: [], intents: {} });
    const a = (await getPublicCampaign(cs))!.campaign.actions.find((x) => x.id === actionIds[0])!;
    expect(a.intends).toBe(2);
    expect(a.completedSelfReported).toBe(1);
    await setActionIntent(cs, sup.id, actionIds[0], null); // withdraw
    expect((await getPublicCampaign(cs))!.campaign.actions[0].intends).toBe(1);
    expect(await campaignViewerState(cs, sup.id)).toEqual({ kinds: [], intents: {} });
  });
  it("follow and interested toggle and count; unconfirmed or suspended accounts are not counted", async () => {
    expect(await toggleCampaignParticipation(cs, sup.id, "FOLLOWING")).toBe(true);
    expect(await toggleCampaignParticipation(cs, sup2.id, "INTERESTED")).toBe(true);
    const pid = (await one<{ id: string }>("SELECT id FROM digital_campaigns WHERE slug=$1", [cs]))!.id;
    await query("INSERT INTO digital_campaign_participation (campaign_id, user_id, kind) VALUES ($1,$2,'FOLLOWING')", [pid, unv.id]);
    expect((await getPublicCampaign(cs))!.campaign.counts).toEqual({ following: 1, interested: 1 });
    await query("UPDATE users SET suspended_at=now() WHERE id=$1", [sup.id]);
    expect((await getPublicCampaign(cs))!.campaign.counts.following).toBe(0);
    await query("UPDATE users SET suspended_at=NULL WHERE id=$1", [sup.id]);
    expect(await toggleCampaignParticipation(cs, sup.id, "FOLLOWING")).toBe(false); // undo
  });
  it("no read path exposes who took part: not the public page, the owner's view, listings or the organizer", async () => {
    await toggleCampaignParticipation(cs, sup.id, "FOLLOWING");
    await setActionIntent(cs, sup.id, actionIds[0], "COMPLETED_SELF_REPORTED");
    const blob = JSON.stringify([await getPublicCampaign(cs), await getPublicCampaign(cs, org.id), await getOwnerCampaign(cs, org.id), await listCampaigns(), await getPublicCampaign(cs, sup2.id)]);
    for (const secret of [sup.id, "supporter.one@example.org", "supporter"]) expect(blob, secret).not.toContain(secret);
  });
  it("only the participation service touches the participation tables, and never selects user identity for others", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
    walk("src");
    const offenders = files.filter((f) => /digital_campaign_(participation|action_intents)|issue_followers/.test(readFileSync(f, "utf8")) && !/src\/lib\/(digital-actions|issues)\.ts$/.test(f));
    expect(offenders).toEqual([]);
    const sel = [...readFileSync("src/lib/digital-actions.ts", "utf8").matchAll(/"SELECT[^"]*FROM digital_campaign_(?:participation|action_intents)[^"]*"/g)].map((m) => m[0]);
    for (const s of sel) expect(s).toMatch(/user_id=\$2/); // identity only ever filtered to the viewer
  });
  it("a closed campaign takes no new participation but allows withdrawal; an archived or hidden one is not open", async () => {
    await setActionIntent(cs, sup.id, actionIds[0], "INTENDS");
    await setOutcomeState(org, cs, "CLOSED_WITHOUT_RESOLUTION");
    await expect(setActionIntent(cs, sup2.id, actionIds[0], "INTENDS")).rejects.toThrow(/closed/);
    await expect(toggleCampaignParticipation(cs, sup2.id, "FOLLOWING")).rejects.toThrow(/closed/);
    await setActionIntent(cs, sup.id, actionIds[0], null); // withdrawal always allowed
    await setOutcomeState(org, cs, "ACTIVE");
    await moderateContent(admin, "CAMPAIGN", cs, "HIDE", "SPAM", "test");
    await expect(setActionIntent(cs, sup2.id, actionIds[0], "INTENDS")).rejects.toThrow(/not open/);
  });
  it("an action belonging to a different campaign cannot be chosen", async () => {
    const other = (await saveCampaign(org2, camp((await mkIssue({ title: "Bus route cuts in Bengaluru", city: "Bengaluru", state: "Karnataka" })).slug, { title: "Publish bus data" }))).slug;
    await expect(setActionIntent(other, sup.id, actionIds[0], "INTENDS")).rejects.toThrow(/not part of this campaign/);
  });
});

describe("outcomes: participation signals, documented responses, observed outcomes and unverified claims stay separate", () => {
  let cs: string;
  beforeEach(async () => { cs = (await saveCampaign(org, camp((await mkIssue()).slug))).slug; });
  it("a documented response or observed outcome needs a source; a claim does not", async () => {
    await expect(addOutcomeEntry(org, cs, { kind: "DOCUMENTED_RESPONSE", body: "The retailer replied by letter.", sourceTitle: "", sourceUrl: "", occurredOn: "2026-11-20" })).rejects.toThrow(/https/);
    await addOutcomeEntry(org, cs, { kind: "DOCUMENTED_RESPONSE", body: "The retailer replied by letter.", sourceTitle: "Letter from retailer", sourceUrl: "https://example.org/letter.pdf", occurredOn: "2026-11-20" });
    await addOutcomeEntry(org, cs, { kind: "UNVERIFIED_CLAIM", body: "We believe the policy will change soon.", sourceTitle: "", sourceUrl: "", occurredOn: "" });
    await expect(addOutcomeEntry(org2, cs, { kind: "UNVERIFIED_CLAIM", body: "Someone else's claim here.", sourceTitle: "", sourceUrl: "", occurredOn: "" })).rejects.toThrow(/owns this campaign/);
    const o = (await getPublicCampaign(cs))!.campaign.outcomes;
    expect(o.map((x) => x.kind).sort()).toEqual(["DOCUMENTED_RESPONSE", "UNVERIFIED_CLAIM"]);
  });
  it("F: an organizer-declared success with no independent evidence is never shown as verified", async () => {
    await addOutcomeEntry(org, cs, { kind: "UNVERIFIED_CLAIM", body: "The retailer has agreed to our demand.", sourceTitle: "", sourceUrl: "", occurredOn: "" });
    await setOutcomeState(org, cs, "RESOLVED_REPORTED");
    const c = (await getPublicCampaign(cs))!.campaign;
    expect(c.outcomeState).toBe("RESOLVED_REPORTED");
    expect(c.stateNote).toMatch(/Reported by the organizer\. No independent evidence has been recorded/);
    expect(JSON.stringify(c)).not.toMatch(/verified success|independently verified success|"verified"/i);
  });
  it("RESPONSE_RECORDED needs a source-backed response; a moderator, not the organizer, sets DISPUTED", async () => {
    await expect(setOutcomeState(org, cs, "RESPONSE_RECORDED")).rejects.toThrow(/source-backed response/);
    await addOutcomeEntry(org, cs, { kind: "DOCUMENTED_RESPONSE", body: "The retailer replied by letter.", sourceTitle: "Letter", sourceUrl: "https://example.org/letter.pdf", occurredOn: "" });
    await setOutcomeState(org, cs, "RESPONSE_RECORDED");
    expect((await getPublicCampaign(cs))!.campaign.stateNote).toMatch(/not a change/);
    await expect(setOutcomeState(org, cs, "DISPUTED")).rejects.toThrow(/states you can set/);
    await addCorrection(admin, "CAMPAIGN", cs, { claim: "The retailer's website does not state a refund policy", correction: "A refund policy page exists at the address given.", sourceUrl: "https://example.com/refunds", markDisputed: true });
    await expect(setOutcomeState(org, cs, "RESOLVED_REPORTED")).rejects.toThrow(/marked this campaign as disputed/);
  });
  it("there is no field anywhere for revenue, loss or market impact", async () => {
    const cols = (await query<{ c: string }>("SELECT column_name AS c FROM information_schema.columns WHERE table_name LIKE 'digital_campaign%'")).map((r) => r.c.toLowerCase());
    expect(cols.filter((c) => /revenue|loss|damage|impact|market|share|sales|profit|financ/.test(c))).toEqual([]);
    await expect(postCampaignUpdate(org, cs, "Participants have cost the company ₹5 crore so far")).rejects.toThrow(/estimate financial impact/);
  });
});

describe("E: reports, factual disputes and corrections", () => {
  let cs: string, issueSlug: string;
  beforeEach(async () => { issueSlug = (await mkIssue()).slug; cs = (await saveCampaign(org, camp(issueSlug))).slug; });
  it("anyone, including the named company, can report; a report hides nothing", async () => {
    expect(await submitContentReport({ type: "CAMPAIGN", slug: cs, reason: "FACTUAL_ERROR", note: "We do have a refund policy.", disputedText: "The retailer's website does not state a refund policy", evidenceUrl: "https://example.com/refunds", reporterUserId: null, network: "1.2.3.4" })).toBe("RECEIVED");
    expect(await submitContentReport({ type: "CAMPAIGN", slug: cs, reason: "FACTUAL_ERROR", note: "", disputedText: "The retailer's website does not state a refund policy", evidenceUrl: "", reporterUserId: null, network: "1.2.3.4" })).toBe("ALREADY_REPORTED");
    expect((await getPublicCampaign(cs))!.campaign.moderation).toBe("OK");
    expect((await listCampaigns()).length).toBe(1);
    expect((await listContentReports()).length).toBe(1);
  });
  it("validates reports: quote the statement, https evidence, no self-reports, only open pages", async () => {
    await expect(submitContentReport({ type: "CAMPAIGN", slug: cs, reason: "FACTUAL_ERROR", note: "", disputedText: "", evidenceUrl: "", reporterUserId: sup.id, network: "x" })).rejects.toThrow(/Quote the statement/);
    await expect(submitContentReport({ type: "CAMPAIGN", slug: cs, reason: "SPAM", note: "", disputedText: "", evidenceUrl: "ftp://x", reporterUserId: sup.id, network: "x" })).rejects.toThrow(/https/);
    await expect(submitContentReport({ type: "CAMPAIGN", slug: cs, reason: "SPAM", note: "", disputedText: "", evidenceUrl: "", reporterUserId: org.id, network: "x" })).rejects.toThrow(/your own campaign/);
    await expect(submitContentReport({ type: "CAMPAIGN", slug: cs, reason: "NOT_A_REASON", note: "", disputedText: "", evidenceUrl: "", reporterUserId: sup.id, network: "x" })).rejects.toThrow(/Choose what is wrong/);
    await expect(submitContentReport({ type: "ISSUE", slug: "no-such-issue", reason: "SPAM", note: "", disputedText: "", evidenceUrl: "", reporterUserId: sup.id, network: "x" })).rejects.toThrow(/not available/);
    const dr = await saveCampaign(org, camp(issueSlug, { visibility: "DRAFT", title: "A private draft" }));
    await expect(submitContentReport({ type: "CAMPAIGN", slug: dr.slug, reason: "SPAM", note: "", disputedText: "", evidenceUrl: "", reporterUserId: sup.id, network: "y" })).rejects.toThrow(/not available/);
  });
  it("a factual dispute is answered with a published correction beside the original; the campaign is marked disputed but not removed or deleted", async () => {
    await submitContentReport({ type: "CAMPAIGN", slug: cs, reason: "FACTUAL_ERROR", note: "We do have a refund policy.", disputedText: "The retailer's website does not state a refund policy", evidenceUrl: "https://example.com/refunds", reporterUserId: null, network: "n" });
    const [r] = await listContentReports();
    await expect(resolveContentReport(admin, r.id, "REMOVE", "Unpopular claim")).rejects.toThrow(/cannot remove a page/);
    await expect(resolveContentReport(admin, r.id, "HIDE", "Disliked")).rejects.toThrow(/cannot remove a page/);
    await expect(resolveContentReport(admin, r.id, "CORRECTION", "Checked it", { correction: "short" })).rejects.toThrow(/10 to 1000/);
    await resolveContentReport(admin, r.id, "CORRECTION", "Checked the retailer's page: a refund page exists", { correction: "A refund policy page exists at the address given. The organizer's statement was out of date when the campaign was published.", sourceUrl: "https://example.com/refunds", markDisputed: true });
    const c = (await getPublicCampaign(cs))!.campaign;
    expect(c.moderation).toBe("OK"); // not removed
    expect(c.outcomeState).toBe("DISPUTED");
    expect(c.evidence[0].claim).toMatch(/does not state a refund policy/); // the original is still on the page
    expect(c.corrections[0]).toMatchObject({ claim: expect.stringMatching(/refund policy/), sourceUrl: "https://example.com/refunds" });
    expect((await listContentReports(true))[0].status).toBe("CORRECTED");
    expect(await one("SELECT 1 FROM audit_log WHERE action='content.correction'")).not.toBeNull();
    await clearDisputed(admin, cs, "Organizer updated the evidence");
    expect((await getPublicCampaign(cs))!.campaign.outcomeState).toBe("ACTIVE");
    expect((await getPublicCampaign(cs))!.campaign.corrections.length).toBe(1); // the correction stays
  });
  it("an opposing viewpoint is not deleted for being unpopular: dismissing is available and is logged with its reason", async () => {
    await submitContentReport({ type: "CAMPAIGN", slug: cs, reason: "OTHER", note: "I strongly disagree with this campaign", disputedText: "", evidenceUrl: "", reporterUserId: sup.id, network: "z" });
    const [r] = await listContentReports();
    await resolveContentReport(admin, r.id, "DISMISS", "Disagreement with a view is not a platform-rule reason");
    expect((await getPublicCampaign(cs))!.campaign.moderation).toBe("OK");
    expect((await listContentReports(true))[0].status).toBe("DISMISSED");
    expect(await one("SELECT 1 FROM audit_log WHERE action='content_report.dismiss'")).not.toBeNull();
  });
  it("hiding needs a conduct reason (never a factual one), a note and a human; it is logged and reversible", async () => {
    await expect(moderateContent(admin, "CAMPAIGN", cs, "HIDE", "FACTUAL_ERROR", "wrong")).rejects.toThrow(/platform-rule reason/);
    await expect(moderateContent(admin, "CAMPAIGN", cs, "HIDE", "HARASSMENT", "")).rejects.toThrow(/note/);
    await expect(moderateContent({ userId: "" } as any, "CAMPAIGN", cs, "HIDE", "HARASSMENT", "x")).rejects.toThrow();
    await moderateContent(admin, "CAMPAIGN", cs, "HIDE", "HARASSMENT", "Names a private individual");
    expect(await getPublicCampaign(cs)).toBeNull();
    expect((await getPublicCampaign(cs, org.id))!.notice).toMatch(/hidden/);
    expect((await one<{ campaign_id: string }>("SELECT campaign_id FROM moderation_actions WHERE action='HIDE'"))!.campaign_id).toBeTruthy();
    await moderateContent(admin, "CAMPAIGN", cs, "RESTORE", "OTHER", "Reviewed: acceptable after edit");
    expect((await getPublicCampaign(cs))!.campaign.title).toBe("Publish a refund policy");
  });
  it("issue pages can be reported and corrected the same way", async () => {
    await submitContentReport({ type: "ISSUE", slug: issueSlug, reason: "FACTUAL_ERROR", note: "", disputedText: "Piped water to Ward 12 has been interrupted", evidenceUrl: "", reporterUserId: sup.id, network: "a" });
    const [r] = await listContentReports();
    expect(r.target_type).toBe("ISSUE");
    await resolveContentReport(admin, r.id, "CORRECTION", "Reviewed the utility log", { correction: "The log shows 9 interruptions, not the number first stated.", sourceUrl: "https://example.gov.in/log" });
    expect((await getIssue(issueSlug))!.title).toBeTruthy(); // the issue stays up
    expect((await query("SELECT count(*)::int AS n FROM content_corrections WHERE target_type='ISSUE'"))[0].n).toBe(1);
  });
});
