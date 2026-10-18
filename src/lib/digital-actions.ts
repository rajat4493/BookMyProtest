/**
 * Digital Actions service (working name HitWhereItHurts). A campaign is attached to a published issue, states one requested change, cites its evidence and offers only
 * lawful, nonviolent choices from a fixed list. Participation is voluntary, undoable and aggregate-only: user ids in the participation tables are never read back
 * except for the signed-in viewer's own state, and only this file may touch those tables (a test enforces it).
 */
import { randomBytes } from "node:crypto";
import { one, query, tx } from "./db";
import {
  ACTION_CATEGORIES, contentProblems, OUTCOME_STATES, publishProblems, screenCampaignText, stateEvidenceNote, validateOutcomeEntry, type CampaignDraft, type OutcomeEntry, type OutcomeKind, type OutcomeState,
} from "./engine/digital-action";
import { claimsToBePlatform, identityFlags, type OrganizerSignals } from "./engine/identity";
import { screenPublicText, slugify } from "./engine/public-protest";
import { requireVerified } from "./verification";

export type CampaignVisibility = "DRAFT" | "PUBLIC" | "UNLISTED" | "ARCHIVED";
export interface CampaignInput extends CampaignDraft { issueSlug: string; visibility: CampaignVisibility }
export interface PublicCampaign {
  slug: string; title: string; summary: string; requestedChange: string; institution: string; evidence: CampaignDraft["evidence"]; closureCriteria: string; startsOn: string | null; reviewOn: string | null;
  organizerDisplayName: string; organizerSignals: OrganizerSignals; visibility: CampaignVisibility; outcomeState: OutcomeState; stateNote: string; moderation: string; publishedAt: string | null; updatedAt: string;
  issue: { slug: string; title: string; open: boolean };
  actions: { id: string; category: string; categoryLabel: string; label: string; detail: string; link: string; intends: number; completedSelfReported: number }[];
  counts: { following: number; interested: number };
  updates: { body: string; createdAt: string }[];
  outcomes: { kind: OutcomeKind; body: string; sourceTitle: string; sourceUrl: string; occurredOn: string | null; createdAt: string }[];
  corrections: { claim: string; correction: string; sourceUrl: string; createdAt: string }[];
}

const COLS = `c.id, c.slug, c.title, c.summary, c.requested_change, c.institution, c.evidence, c.closure_criteria, to_char(c.starts_on,'YYYY-MM-DD') AS starts, to_char(c.review_on,'YYYY-MM-DD') AS review,
  c.organizer_display_name, c.visibility, c.outcome_state, c.moderation_status, c.published_at, c.updated_at, i.slug AS issue_slug, i.title AS issue_title, (i.status='PUBLISHED' AND i.moderation_status='OK') AS issue_open,
  (SELECT u.email_verified_at IS NOT NULL FROM users u WHERE u.id=c.owner_user_id) AS owner_confirmed, (SELECT to_char(u.created_at,'YYYY-MM') FROM users u WHERE u.id=c.owner_user_id) AS owner_since`;
const FROM = "FROM digital_campaigns c JOIN issues i ON i.id=c.issue_id";
const OPEN = "c.moderation_status='OK' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=c.owner_user_id AND u.suspended_at IS NOT NULL)";
const COUNTED = "JOIN users u ON u.id=%U AND u.email_verified_at IS NOT NULL AND u.suspended_at IS NULL";

async function shape(r: any): Promise<PublicCampaign> {
  const actions = await query(`SELECT a.id, a.category, a.label, a.detail, a.link,
      (SELECT count(*)::int FROM digital_campaign_action_intents n ${COUNTED.replace("%U", "n.user_id")} WHERE n.action_id=a.id) AS intends,
      (SELECT count(*)::int FROM digital_campaign_action_intents n ${COUNTED.replace("%U", "n.user_id")} WHERE n.action_id=a.id AND n.status='COMPLETED_SELF_REPORTED') AS done
    FROM digital_campaign_actions a WHERE a.campaign_id=$1 ORDER BY a.sort, a.label`, [r.id]);
  const kc = await query<{ kind: string; n: number }>(`SELECT p.kind, count(*)::int AS n FROM digital_campaign_participation p ${COUNTED.replace("%U", "p.user_id")} WHERE p.campaign_id=$1 GROUP BY p.kind`, [r.id]);
  const updates = await query("SELECT body, created_at FROM digital_campaign_updates WHERE campaign_id=$1 ORDER BY created_at DESC LIMIT 30", [r.id]);
  const outcomes = await query("SELECT kind, body, source_title, source_url, to_char(occurred_on,'YYYY-MM-DD') AS d, created_at FROM digital_campaign_outcomes WHERE campaign_id=$1 ORDER BY COALESCE(occurred_on, created_at::date) DESC, created_at DESC", [r.id]);
  const corrections = await query("SELECT claim_text, correction_text, source_url, created_at FROM content_corrections WHERE target_type='CAMPAIGN' AND target_id=$1 ORDER BY created_at DESC", [r.id]);
  const entries: OutcomeEntry[] = outcomes.map((o: any) => ({ kind: o.kind, sourceUrl: o.source_url, sourceTitle: o.source_title }));
  return {
    slug: r.slug, title: r.title, summary: r.summary, requestedChange: r.requested_change, institution: r.institution, evidence: r.evidence, closureCriteria: r.closure_criteria, startsOn: r.starts, reviewOn: r.review,
    organizerDisplayName: r.organizer_display_name, organizerSignals: { nameSelfDeclared: true, emailConfirmed: !!r.owner_confirmed, memberSince: r.owner_since ?? "1970-01" }, visibility: r.visibility,
    outcomeState: r.outcome_state, stateNote: stateEvidenceNote(r.outcome_state, entries), moderation: r.moderation_status, publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null, updatedAt: new Date(r.updated_at).toISOString(),
    issue: { slug: r.issue_slug, title: r.issue_title, open: !!r.issue_open },
    actions: actions.map((a: any) => ({ id: a.id, category: a.category, categoryLabel: ACTION_CATEGORIES[a.category]?.label ?? a.category, label: a.label, detail: a.detail, link: a.link, intends: a.intends, completedSelfReported: a.done })),
    counts: { following: kc.find((k) => k.kind === "FOLLOWING")?.n ?? 0, interested: kc.find((k) => k.kind === "INTERESTED")?.n ?? 0 },
    updates: updates.map((u: any) => ({ body: u.body, createdAt: new Date(u.created_at).toISOString() })),
    outcomes: outcomes.map((o: any) => ({ kind: o.kind, body: o.body, sourceTitle: o.source_title, sourceUrl: o.source_url, occurredOn: o.d, createdAt: new Date(o.created_at).toISOString() })),
    corrections: corrections.map((c: any) => ({ claim: c.claim_text, correction: c.correction_text, sourceUrl: c.source_url, createdAt: new Date(c.created_at).toISOString() })),
  };
}

/* ---------------- organizer ---------------- */
const E_NOT_YOURS = "Sign in to the account that owns this campaign.";

export function draftOf(c: PublicCampaign): CampaignDraft {
  return { title: c.title, summary: c.summary, requestedChange: c.requestedChange, institution: c.institution, closureCriteria: c.closureCriteria, organizerDisplayName: c.organizerDisplayName, startsOn: c.startsOn, reviewOn: c.reviewOn,
    evidence: c.evidence, actions: c.actions.map((a) => ({ category: a.category, label: a.label, detail: a.detail, link: a.link })) };
}

export async function saveCampaign(user: { id: string }, input: CampaignInput, slug?: string): Promise<{ slug: string; created: boolean }> {
  const u = await one<{ suspended_at: Date | null }>("SELECT suspended_at FROM users WHERE id=$1", [user.id]);
  if (u?.suspended_at) throw new Error("This account is suspended and cannot publish or edit campaigns.");
  const issue = await one<{ id: string }>("SELECT id FROM issues WHERE slug=$1 AND status='PUBLISHED' AND moderation_status='OK'", [input.issueSlug]);
  if (!issue) throw new Error("Choose a published issue for this campaign. A campaign must be about a documented issue.");
  if (claimsToBePlatform(input.organizerDisplayName)) throw new Error("An organizer name cannot present the campaign as BookMyProtest. Use your own group or name.");
  if (!input.organizerDisplayName.trim()) throw new Error("Add the name you are organizing under.");
  const bad = contentProblems(input)[0];
  if (bad) throw new Error(bad);
  for (const [l, t] of [["Title", input.title], ["Summary", input.summary], ["Requested change", input.requestedChange], ["Closure criteria", input.closureCriteria], ...input.actions.map((a, n) => [`Action ${n + 1}`, `${a.label} ${a.detail}`] as const)] as const) { const m = screenPublicText(l, t); if (m) throw new Error(m); }
  const live = input.visibility === "PUBLIC" || input.visibility === "UNLISTED";
  if (live) {
    await requireVerified(user.id);
    const p = publishProblems(input);
    if (p.length) throw new Error(`Cannot publish yet: ${p.slice(0, 3).join(" ")}${p.length > 3 ? ` (+${p.length - 3} more)` : ""}`);
  }
  const others = (await query<{ n: string }>("SELECT organizer_display_name AS n FROM digital_campaigns WHERE owner_user_id<>$1 UNION SELECT organizer_display_name FROM public_protests WHERE owner_user_id<>$1", [user.id])).map((r) => r.n);
  const flags = identityFlags(input.organizerDisplayName, others);
  const evidence = JSON.stringify(input.evidence.map((e) => ({ claim: e.claim.trim(), sourceTitle: e.sourceTitle.trim(), sourceUrl: e.sourceUrl.trim() })));
  const actions = input.actions.map((a, n) => ({ category: a.category, label: a.label.trim(), detail: a.detail.trim(), link: a.link.trim(), sort: n }));

  if (slug) {
    const cur = await one<{ id: string; owner: string; moderation: string; outcome: string; visibility: string; name: string; change: string; institution: string; published_at: Date | null }>(
      "SELECT id, owner_user_id AS owner, moderation_status AS moderation, outcome_state AS outcome, visibility, organizer_display_name AS name, requested_change AS change, institution, published_at FROM digital_campaigns WHERE slug=$1", [slug]);
    if (!cur || cur.owner !== user.id) throw new Error(E_NOT_YOURS);
    if (cur.moderation === "REMOVED") throw new Error("This campaign was removed under the platform guidelines and cannot be edited.");
    await tx(async (q) => {
      const old = await q("SELECT category, label, detail, link FROM digital_campaign_actions WHERE campaign_id=$1 ORDER BY sort", [cur.id]);
      const sig = (xs: { category: string; label: string; detail: string; link: string }[]) => JSON.stringify(xs.map((x) => [x.category, x.label, x.detail, x.link]));
      const actionsChanged = sig(old as any) !== sig(actions);
      await q(`UPDATE digital_campaigns SET issue_id=$2, title=$3, summary=$4, requested_change=$5, institution=$6, evidence=$7, closure_criteria=$8, starts_on=$9, review_on=$10, organizer_display_name=$11, visibility=$12,
        identity_flags=$13, identity_reviewed_at=CASE WHEN organizer_display_name IS DISTINCT FROM $11 THEN NULL ELSE identity_reviewed_at END, published_at=CASE WHEN $14 THEN COALESCE(published_at, now()) ELSE published_at END, updated_at=now() WHERE id=$1`,
        [cur.id, issue.id, input.title.trim(), input.summary.trim(), input.requestedChange.trim(), input.institution.trim(), evidence, input.closureCriteria.trim(), input.startsOn || null, input.reviewOn || null, input.organizerDisplayName.trim(), input.visibility, flags, live]);
      if (actionsChanged) {
        await q("DELETE FROM digital_campaign_actions WHERE campaign_id=$1", [cur.id]);
        for (const a of actions) await q("INSERT INTO digital_campaign_actions (campaign_id, category, label, detail, link, sort) VALUES ($1,$2,$3,$4,$5,$6)", [cur.id, a.category, a.label, a.detail, a.link, a.sort]);
      }
      // Once people may have joined, a change to what is asked or named is disclosed on the page itself rather than made silently.
      if (cur.published_at && (cur.change !== input.requestedChange.trim() || cur.institution !== input.institution.trim() || actionsChanged))
        await q("INSERT INTO digital_campaign_updates (campaign_id, body) VALUES ($1,$2)", [cur.id, "The organizer edited the requested change, the institution named, or the action choices on this page."]);
    });
    return { slug, created: false };
  }
  const newSlug = `${slugify(input.title)}-${randomBytes(3).toString("hex")}`;
  await tx(async (q) => {
    const id = (await q(`INSERT INTO digital_campaigns (slug, issue_id, owner_user_id, title, summary, requested_change, institution, evidence, closure_criteria, starts_on, review_on, organizer_display_name, visibility, identity_flags, published_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, CASE WHEN $15 THEN now() END) RETURNING id`,
      [newSlug, issue.id, user.id, input.title.trim(), input.summary.trim(), input.requestedChange.trim(), input.institution.trim(), evidence, input.closureCriteria.trim(), input.startsOn || null, input.reviewOn || null, input.organizerDisplayName.trim(), input.visibility, flags, live]))[0].id;
    for (const a of actions) await q("INSERT INTO digital_campaign_actions (campaign_id, category, label, detail, link, sort) VALUES ($1,$2,$3,$4,$5,$6)", [id, a.category, a.label, a.detail, a.link, a.sort]);
  });
  return { slug: newSlug, created: true };
}

export async function setCampaignVisibility(user: { id: string }, slug: string, v: CampaignVisibility): Promise<void> {
  const c = await getOwnerCampaign(slug, user.id);
  if (!c) throw new Error(E_NOT_YOURS);
  if (c.moderation === "REMOVED") throw new Error("This campaign was removed under the platform guidelines.");
  if (v === "PUBLIC" || v === "UNLISTED") { await requireVerified(user.id); const p = publishProblems(draftOf(c)); if (p.length) throw new Error(`Cannot publish yet: ${p[0]}`); }
  await query("UPDATE digital_campaigns SET visibility=$2, outcome_state=CASE WHEN $2='ARCHIVED' THEN 'ARCHIVED' ELSE outcome_state END, published_at=CASE WHEN $3 THEN COALESCE(published_at, now()) ELSE published_at END, updated_at=now() WHERE slug=$1", [slug, v, v === "PUBLIC" || v === "UNLISTED"]);
}

export async function getOwnerCampaign(slug: string, userId: string): Promise<PublicCampaign | null> {
  const r = (await query(`SELECT ${COLS} ${FROM} WHERE c.slug=$1 AND c.owner_user_id=$2`, [slug, userId]))[0];
  return r ? shape(r) : null;
}
export async function getPublicCampaign(slug: string, viewerId: string | null = null): Promise<{ campaign: PublicCampaign; isOwner: boolean; notice: string | null } | null> {
  const r = (await query(`SELECT ${COLS}, c.owner_user_id, (SELECT u.suspended_at IS NOT NULL FROM users u WHERE u.id=c.owner_user_id) AS owner_suspended ${FROM} WHERE c.slug=$1`, [slug]))[0];
  if (!r) return null;
  const isOwner = !!viewerId && viewerId === r.owner_user_id;
  const openToAll = r.moderation_status === "OK" && !r.owner_suspended && ["PUBLIC", "UNLISTED", "ARCHIVED"].includes(r.visibility) && !!r.published_at;
  if (!openToAll && !isOwner) return null;
  let notice: string | null = null;
  if (isOwner) {
    if (r.moderation_status !== "OK") notice = `This campaign is ${r.moderation_status === "HIDDEN" ? "hidden" : "removed"} under the platform guidelines and is not visible to others.`;
    else if (r.owner_suspended) notice = "Your account is suspended, so this campaign is not visible to others.";
    else if (!openToAll) notice = `Preview: this campaign is ${r.visibility.toLowerCase()} and not visible to others.`;
  }
  return { campaign: await shape(r), isOwner, notice };
}

export interface CampaignFilters { issueSlug?: string; q?: string; state?: string; city?: string; category?: string }
export async function listCampaigns(f: CampaignFilters = {}): Promise<PublicCampaign[]> {
  const where = [`c.visibility='PUBLIC'`, OPEN, "i.status='PUBLISHED'", "i.moderation_status='OK'", `c.outcome_state <> 'ARCHIVED'`]; const args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace("?", `$${args.length}`)); };
  if (f.issueSlug) add("i.slug = ?", f.issueSlug);
  if (f.category) add("i.category = ?", f.category);
  if (f.state) add("(lower(i.state) = lower(?) OR i.scope_level='NATIONAL')", f.state);
  if (f.city) add("(lower(i.city) = lower(?) OR i.scope_level <> 'LOCAL')", f.city);
  if (f.q?.trim()) { args.push(f.q.trim().slice(0, 80)); const n = args.length; where.push(`(c.title ILIKE '%' || $${n} || '%' OR c.summary ILIKE '%' || $${n} || '%' OR i.title ILIKE '%' || $${n} || '%')`); }
  const sql = where.join(" AND ");
  const rows = await query(`SELECT ${COLS} ${FROM} WHERE ${sql} ORDER BY c.published_at DESC NULLS LAST, c.slug LIMIT 60`, args);
  return Promise.all(rows.map(shape));
}
export async function campaignsForIssue(issueSlug: string) { return listCampaigns({ issueSlug }); }

export async function myCampaigns(userId: string) {
  return query("SELECT c.slug, c.title, c.visibility, c.outcome_state FROM digital_campaigns c WHERE c.owner_user_id=$1 ORDER BY c.updated_at DESC", [userId]);
}

/* ---------------- updates and outcomes ---------------- */
async function ownedOpen(user: { id: string }, slug: string) {
  const c = await one<{ id: string; owner: string; moderation: string; outcome: string }>("SELECT id, owner_user_id AS owner, moderation_status AS moderation, outcome_state AS outcome FROM digital_campaigns WHERE slug=$1", [slug]);
  if (!c || c.owner !== user.id) throw new Error(E_NOT_YOURS);
  if (c.moderation !== "OK") throw new Error("This campaign is not open for changes.");
  return c;
}
export async function postCampaignUpdate(user: { id: string }, slug: string, body: string): Promise<void> {
  const c = await ownedOpen(user, slug);
  const t = body.trim();
  if (t.length < 1 || t.length > 2000) throw new Error("An update must be between 1 and 2000 characters.");
  const s = screenPublicText("Update", t) ?? screenCampaignText("Update", t); if (s) throw new Error(s);
  await query("INSERT INTO digital_campaign_updates (campaign_id, body) VALUES ($1,$2)", [c.id, t]);
  await query("UPDATE digital_campaigns SET updated_at=now() WHERE id=$1", [c.id]);
}
export async function addOutcomeEntry(user: { id: string }, slug: string, e: { kind: string; body: string; sourceTitle: string; sourceUrl: string; occurredOn: string }): Promise<void> {
  const c = await ownedOpen(user, slug);
  const bad = validateOutcomeEntry(e); if (bad) throw new Error(bad);
  const s = screenPublicText("Entry", e.body) ?? screenCampaignText("Entry", e.body); if (s) throw new Error(s);
  await query("INSERT INTO digital_campaign_outcomes (campaign_id, kind, body, source_title, source_url, occurred_on, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [c.id, e.kind, e.body.trim(), e.kind === "UNVERIFIED_CLAIM" ? "" : e.sourceTitle.trim(), e.kind === "UNVERIFIED_CLAIM" ? "" : e.sourceUrl.trim(), /^\d{4}-\d{2}-\d{2}$/.test(e.occurredOn) ? e.occurredOn : null, user.id]);
}
/**
 * The organizer's own statement of where the campaign stands. It is a report, never a verification. A recorded response needs a source-backed entry;
 * a reported resolution may be stated without evidence, and the page then says so. DISPUTED is set only by a moderator.
 */
export async function setOutcomeState(user: { id: string }, slug: string, state: string): Promise<void> {
  const c = await ownedOpen(user, slug);
  if (!(OUTCOME_STATES as readonly string[]).includes(state) || state === "DISPUTED") throw new Error("Choose one of the states you can set.");
  if (c.outcome === "DISPUTED") throw new Error("A moderator marked this campaign as disputed. Ask for a review before changing its state.");
  if (state === "RESPONSE_RECORDED" && !(await one("SELECT 1 FROM digital_campaign_outcomes WHERE campaign_id=$1 AND kind='DOCUMENTED_RESPONSE' AND source_url<>''", [c.id]))) throw new Error("Record a source-backed response first.");
  await query("UPDATE digital_campaigns SET outcome_state=$2, visibility=CASE WHEN $2='ARCHIVED' THEN 'ARCHIVED' ELSE visibility END, updated_at=now() WHERE id=$1", [c.id, state]);
}

/* ---------------- participation: confirmed email, voluntary, undoable, aggregate-only ---------------- */
async function openForParticipation(slug: string, userId: string, forNew: boolean) {
  await requireVerified(userId);
  const u = await one<{ suspended_at: Date | null }>("SELECT suspended_at FROM users WHERE id=$1", [userId]);
  if (u?.suspended_at) throw new Error("This account is suspended.");
  const c = await one<{ id: string; visibility: string; moderation: string; outcome: string; owner_suspended: boolean; issue_open: boolean }>(
    `SELECT c.id, c.visibility, c.moderation_status AS moderation, c.outcome_state AS outcome, (SELECT x.suspended_at IS NOT NULL FROM users x WHERE x.id=c.owner_user_id) AS owner_suspended, (i.status='PUBLISHED' AND i.moderation_status='OK') AS issue_open ${FROM} WHERE c.slug=$1`, [slug]);
  if (!c || c.moderation !== "OK" || c.owner_suspended || !["PUBLIC", "UNLISTED"].includes(c.visibility)) throw new Error("This campaign is not open for participation.");
  if (forNew && ["CLOSED_WITHOUT_RESOLUTION", "ARCHIVED"].includes(c.outcome)) throw new Error("This campaign is closed.");
  return c;
}
export async function toggleCampaignParticipation(slug: string, userId: string, kind: "FOLLOWING" | "INTERESTED"): Promise<boolean> {
  if (kind !== "FOLLOWING" && kind !== "INTERESTED") throw new Error("Unknown action.");
  const c = await openForParticipation(slug, userId, false);
  if ((await query("DELETE FROM digital_campaign_participation WHERE campaign_id=$1 AND user_id=$2 AND kind=$3 RETURNING 1", [c.id, userId, kind])).length) return false;
  await openForParticipation(slug, userId, true);
  await query("INSERT INTO digital_campaign_participation (campaign_id, user_id, kind) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [c.id, userId, kind]);
  return true;
}
/** status null withdraws. INTENDS = "I plan to do this"; COMPLETED_SELF_REPORTED = "I did this" (never checked, never counted as verified). */
export async function setActionIntent(slug: string, userId: string, actionId: string, status: "INTENDS" | "COMPLETED_SELF_REPORTED" | null): Promise<void> {
  const c = await openForParticipation(slug, userId, status !== null);
  const a = await one("SELECT 1 FROM digital_campaign_actions WHERE id=$1 AND campaign_id=$2", [actionId, c.id]);
  if (!a) throw new Error("That action is not part of this campaign.");
  if (status === null) { await query("DELETE FROM digital_campaign_action_intents WHERE action_id=$1 AND user_id=$2", [actionId, userId]); return; }
  if (status !== "INTENDS" && status !== "COMPLETED_SELF_REPORTED") throw new Error("Unknown status.");
  await query("INSERT INTO digital_campaign_action_intents (action_id, user_id, status) VALUES ($1,$2,$3) ON CONFLICT (action_id, user_id) DO UPDATE SET status=$3, updated_at=now()", [actionId, userId, status]);
}
/** The signed-in viewer's OWN choices only. */
export async function campaignViewerState(slug: string, userId: string | null): Promise<{ kinds: string[]; intents: Record<string, string> }> {
  if (!userId) return { kinds: [], intents: {} };
  const k = await query<{ kind: string }>("SELECT p.kind FROM digital_campaign_participation p JOIN digital_campaigns c ON c.id=p.campaign_id WHERE c.slug=$1 AND p.user_id=$2", [slug, userId]);
  const n = await query<{ action_id: string; status: string }>("SELECT n.action_id, n.status FROM digital_campaign_action_intents n JOIN digital_campaign_actions a ON a.id=n.action_id JOIN digital_campaigns c ON c.id=a.campaign_id WHERE c.slug=$1 AND n.user_id=$2", [slug, userId]);
  return { kinds: k.map((x) => x.kind), intents: Object.fromEntries(n.map((x) => [x.action_id, x.status])) };
}
export async function myCampaignActivity(userId: string) {
  return query(`SELECT DISTINCT c.slug, c.title FROM digital_campaigns c WHERE c.visibility IN ('PUBLIC','UNLISTED') AND c.moderation_status='OK' AND (
    EXISTS (SELECT 1 FROM digital_campaign_participation p WHERE p.campaign_id=c.id AND p.user_id=$1) OR
    EXISTS (SELECT 1 FROM digital_campaign_action_intents n JOIN digital_campaign_actions a ON a.id=n.action_id WHERE a.campaign_id=c.id AND n.user_id=$1)) ORDER BY c.title`, [userId]);
}
