/**
 * Find Your Hill service. Issues are written and published by people (admins) only; users may suggest, follow and report.
 * Issue evidence (`issue_sources`) is deliberately separate from the legal-rule source registry that drives the Delhi compliance engine.
 */
import { createHash } from "node:crypto";
import { one, query, tx } from "./db";
import { compareRank, ISSUE_CATEGORIES, isHttps, publishProblems, slugifyIssue, sourceQuality, type DevelopmentIn, type DisputedClaimIn, type IssueDraft, type IssueSourceIn, type PerspectiveIn } from "./engine/issues";
import { screenPublicText } from "./engine/public-protest";
import { assertHuman, type Actor } from "./knowledge";
import { audit } from "./store";
import { requireVerified } from "./verification";

export interface PublicIssue {
  slug: string; title: string; summary: string; description: string; whyDiscussed: string; scopeLevel: string; city: string; state: string; category: string; categoryLabel: string;
  perspectives: PerspectiveIn[]; disputedClaims: DisputedClaimIn[]; developments: DevelopmentIn[]; unknowns: string; lastCheckedOn: string | null; publishedAt: string | null; updatedAt: string;
  sources: { kind: string; title: string; url: string; publisher: string; publishedOn: string | null; note: string }[];
  followers: number; moderation: string; status: string;
}
const COLS = `i.id, i.slug, i.title, i.summary, i.description, i.why_discussed, i.scope_level, i.city, i.state, i.category, i.perspectives, i.disputed_claims, i.developments, i.unknowns,
  to_char(i.last_checked_on,'YYYY-MM-DD') AS checked, i.published_at, i.updated_at, i.status, i.moderation_status`;
const OPEN = "i.status='PUBLISHED' AND i.moderation_status='OK'";

async function sourcesOf(issueId: string) {
  return (await query(`SELECT kind, title, url, publisher, to_char(published_on,'YYYY-MM-DD') AS pub, note FROM issue_sources WHERE issue_id=$1 ORDER BY sort, title`, [issueId]))
    .map((s: any) => ({ kind: s.kind, title: s.title, url: s.url, publisher: s.publisher, publishedOn: s.pub, note: s.note }));
}
async function shape(r: any): Promise<PublicIssue> {
  return {
    slug: r.slug, title: r.title, summary: r.summary, description: r.description, whyDiscussed: r.why_discussed, scopeLevel: r.scope_level, city: r.city, state: r.state, category: r.category,
    categoryLabel: ISSUE_CATEGORIES[r.category] ?? "Other", perspectives: r.perspectives, disputedClaims: r.disputed_claims, developments: r.developments, unknowns: r.unknowns, lastCheckedOn: r.checked,
    publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null, updatedAt: new Date(r.updated_at).toISOString(), sources: await sourcesOf(r.id),
    followers: (await one<{ n: number }>("SELECT count(*)::int AS n FROM issue_followers f JOIN users u ON u.id=f.user_id AND u.email_verified_at IS NOT NULL AND u.suspended_at IS NULL WHERE f.issue_id=$1", [r.id]))!.n,
    moderation: r.moderation_status, status: r.status,
  };
}

/* ---------------- discovery ---------------- */
export interface IssueFilters { q?: string; city?: string; state?: string; nationwide?: boolean; category?: string }
export interface IssueHit { issue: PublicIssue; protests: number; campaigns: number }

/**
 * Keyword search with explicit, non-personal ordering: text relevance, then geographic match, then recency of the last information check, then documented source quality.
 * Nothing about the viewer, popularity, participation or belief enters the ordering.
 */
export async function searchIssues(f: IssueFilters = {}): Promise<IssueHit[]> {
  const where = [OPEN]; const args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace("?", `$${args.length}`)); };
  const q = (f.q ?? "").trim().slice(0, 100);
  if (q) add("i.search @@ websearch_to_tsquery('simple', ?)", q);
  if (f.category && ISSUE_CATEGORIES[f.category]) add("i.category = ?", f.category);
  if (f.nationwide) where.push("i.scope_level='NATIONAL'");
  else {
    if (f.state) add("(lower(i.state) = lower(?) OR i.scope_level='NATIONAL')", f.state);
    if (f.city) add("(lower(i.city) = lower(?) OR i.scope_level IN ('STATE','NATIONAL'))", f.city);
  }
  const rankArg = q ? (args.push(q), `ts_rank(i.search, websearch_to_tsquery('simple', $${args.length}))`) : "0";
  const rows = await query(`SELECT ${COLS}, ${rankArg} AS rank,
      (SELECT count(*)::int FROM issue_protest_links l JOIN public_protests p ON p.id=l.protest_id WHERE l.issue_id=i.id AND p.visibility='PUBLIC' AND p.moderation_status='OK') AS protests,
      (SELECT count(*)::int FROM digital_campaigns c WHERE c.issue_id=i.id AND c.visibility='PUBLIC' AND c.moderation_status='OK') AS campaigns,
      (SELECT array_agg(kind) FROM issue_sources s WHERE s.issue_id=i.id) AS kinds
    FROM issues i WHERE ${where.join(" AND ")} LIMIT 80`, args);
  const place = (r: any) => !!((f.city && r.city.toLowerCase() === f.city.toLowerCase()) || (f.state && r.state.toLowerCase() === f.state.toLowerCase() && !f.city));
  const ranked = rows.map((r: any) => ({ r, k: { rank: Number(r.rank), placeMatch: place(r), checkedOn: r.checked as string | null, quality: sourceQuality(r.kinds ?? []) } }));
  ranked.sort((a, b) => compareRank(a.k, b.k) || a.r.slug.localeCompare(b.r.slug));
  return Promise.all(ranked.slice(0, 40).map(async ({ r }) => ({ issue: await shape(r), protests: r.protests, campaigns: r.campaigns })));
}
export async function listIssuePlaces(): Promise<{ cities: string[]; states: string[] }> {
  const rows = await query<{ city: string; state: string }>(`SELECT DISTINCT i.city, i.state FROM issues i WHERE ${OPEN} ORDER BY 2, 1`);
  return { cities: [...new Set(rows.map((r) => r.city).filter(Boolean))], states: [...new Set(rows.map((r) => r.state).filter(Boolean))] };
}

export async function getIssue(slug: string, viewerIsAdmin = false): Promise<PublicIssue | null> {
  const r = (await query(`SELECT ${COLS} FROM issues i WHERE i.slug=$1`, [slug]))[0];
  if (!r) return null;
  if (!viewerIsAdmin && !(r.status === "PUBLISHED" && r.moderation_status === "OK")) return null;
  return shape(r);
}
export async function issueIdFor(slug: string): Promise<string | null> { return (await one<{ id: string }>("SELECT id FROM issues WHERE slug=$1", [slug]))?.id ?? null; }

/** Public protests linked to the issue, by the protest's own organizer. */
export async function protestsForIssue(slug: string) {
  return (await query(`SELECT p.slug, p.title, p.city, p.state, to_char(p.event_date,'YYYY-MM-DD') AS d FROM issue_protest_links l JOIN issues i ON i.id=l.issue_id JOIN public_protests p ON p.id=l.protest_id
    WHERE i.slug=$1 AND p.visibility='PUBLIC' AND p.moderation_status='OK' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=p.owner_user_id AND u.suspended_at IS NOT NULL) ORDER BY p.event_date, p.slug`, [slug]));
}
export async function issueForProtest(eventId: string) {
  return one<{ slug: string; title: string }>(`SELECT i.slug, i.title FROM issue_protest_links l JOIN public_protests p ON p.id=l.protest_id JOIN issues i ON i.id=l.issue_id WHERE p.event_id=$1 AND ${OPEN}`, [eventId]);
}
export async function linkProtestToIssue(eventId: string, user: { id: string }, issueSlug: string | null) {
  const p = await one<{ id: string; owner: string }>("SELECT id, owner_user_id AS owner FROM public_protests WHERE event_id=$1", [eventId]);
  if (!p || p.owner !== user.id) throw new Error("Only the organizer of this page can link it to an issue.");
  await query("DELETE FROM issue_protest_links WHERE protest_id=$1", [p.id]);
  if (!issueSlug) return;
  const i = await one<{ id: string }>(`SELECT i.id FROM issues i WHERE i.slug=$1 AND ${OPEN}`, [issueSlug]);
  if (!i) throw new Error("That issue is not available.");
  await query("INSERT INTO issue_protest_links (issue_id, protest_id, linked_by) VALUES ($1,$2,$3)", [i.id, p.id, user.id]);
}

/* ---------------- follow (confirmed email, aggregate only) ---------------- */
export async function toggleFollowIssue(slug: string, userId: string): Promise<boolean> {
  await requireVerified(userId);
  const u = await one<{ suspended_at: Date | null }>("SELECT suspended_at FROM users WHERE id=$1", [userId]);
  if (u?.suspended_at) throw new Error("This account is suspended.");
  const i = await one<{ id: string }>(`SELECT i.id FROM issues i WHERE i.slug=$1 AND ${OPEN}`, [slug]);
  if (!i) throw new Error("This issue is not available.");
  if ((await query("DELETE FROM issue_followers WHERE issue_id=$1 AND user_id=$2 RETURNING 1", [i.id, userId])).length) return false;
  await query("INSERT INTO issue_followers (issue_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [i.id, userId]);
  return true;
}
export async function isFollowingIssue(slug: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  return !!(await one("SELECT 1 FROM issue_followers f JOIN issues i ON i.id=f.issue_id WHERE i.slug=$1 AND f.user_id=$2", [slug, userId]));
}
export async function myFollowedIssues(userId: string) {
  return query(`SELECT i.slug, i.title FROM issue_followers f JOIN issues i ON i.id=f.issue_id WHERE f.user_id=$1 AND ${OPEN} ORDER BY f.created_at DESC`, [userId]);
}

/* ---------------- suggestions (queue for human review; nothing is published from here) ---------------- */
export async function suggestIssue(userId: string, i: { title: string; description: string; sourceUrl: string; city: string; state: string; category: string }): Promise<void> {
  await requireVerified(userId);
  const title = i.title.trim(), description = i.description.trim();
  if (title.length < 8 || title.length > 140) throw new Error("Give the issue a title of 8 to 140 characters.");
  if (description.length < 20 || description.length > 1500) throw new Error("Describe it in 20 to 1500 characters.");
  if (i.sourceUrl && !isHttps(i.sourceUrl)) throw new Error("A source link must start with https://");
  for (const [l, t] of [["Title", title], ["Description", description]] as const) { const m = screenPublicText(l, t); if (m) throw new Error(m); }
  const recent = await one<{ n: number }>("SELECT count(*)::int AS n FROM issue_suggestions WHERE user_id=$1 AND created_at > now() - interval '1 day'", [userId]);
  if ((recent?.n ?? 0) >= 3) throw new Error("You have reached today's limit of suggestions.");
  await query("INSERT INTO issue_suggestions (user_id, title, description, source_url, city, state, category) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [userId, title, description, i.sourceUrl.trim(), i.city.trim().slice(0, 80), i.state.trim().slice(0, 80), ISSUE_CATEGORIES[i.category] ? i.category : "OTHER"]);
}
export async function listSuggestions() { return query("SELECT s.*, u.email FROM issue_suggestions s LEFT JOIN users u ON u.id=s.user_id ORDER BY (s.status='NEW') DESC, s.created_at DESC LIMIT 100"); }
export async function resolveSuggestion(actor: Actor, id: string, outcome: "DECLINED" | "PROMOTED", note: string): Promise<string | null> {
  assertHuman(actor);
  if (note.trim().length < 3) throw new Error("Add a short note.");
  const s = await one<any>("SELECT * FROM issue_suggestions WHERE id=$1 AND status='NEW'", [id]);
  if (!s) throw new Error("Suggestion not found or already handled.");
  let issueId: string | null = null;
  if (outcome === "PROMOTED") issueId = await createIssueDraft(actor, { title: s.title, category: s.category, city: s.city, state: s.state, description: s.description });
  await query("UPDATE issue_suggestions SET status=$2, admin_note=$3 WHERE id=$1", [id, outcome, note.trim()]);
  await audit(actor.userId, `issue.suggestion_${outcome.toLowerCase()}`, "issue_suggestion", id, { reason: note.trim() });
  return issueId;
}

/* ---------------- admin authoring (humans only; nothing is auto-published) ---------------- */
export async function createIssueDraft(actor: Actor, i: { title: string; category: string; city: string; state: string; description?: string }): Promise<string> {
  assertHuman(actor);
  if (i.title.trim().length < 3) throw new Error("A title is required.");
  const slug = `${slugifyIssue(i.title)}-${createHash("sha1").update(`${Date.now()}${Math.random()}`).digest("hex").slice(0, 5)}`;
  const scope = i.city.trim() ? "LOCAL" : i.state.trim() ? "STATE" : "NATIONAL";
  const id = (await one<{ id: string }>("INSERT INTO issues (slug, title, description, category, city, state, scope_level, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    [slug, i.title.trim(), i.description ?? "", ISSUE_CATEGORIES[i.category] ? i.category : "OTHER", i.city.trim(), i.state.trim(), scope, actor.userId]))!.id;
  await audit(actor.userId, "issue.create", "issue", id, {});
  return id;
}
export async function getIssueForEdit(id: string): Promise<{ draft: IssueDraft; sources: IssueSourceIn[]; slug: string; status: string; moderation: string } | null> {
  const r = (await query(`SELECT ${COLS} FROM issues i WHERE i.id=$1`, [id]))[0];
  if (!r) return null;
  const sources = (await sourcesOf(id)).map((s) => ({ kind: s.kind, title: s.title, url: s.url, publisher: s.publisher, publishedOn: s.publishedOn, note: s.note }));
  return { slug: r.slug, status: r.status, moderation: r.moderation_status, sources, draft: { title: r.title, summary: r.summary, description: r.description, whyDiscussed: r.why_discussed, scopeLevel: r.scope_level, city: r.city, state: r.state, category: r.category,
    perspectives: r.perspectives, disputedClaims: r.disputed_claims, developments: r.developments, unknowns: r.unknowns, lastCheckedOn: r.checked } };
}
export async function listIssuesForAdmin() { return query("SELECT i.id, i.slug, i.title, i.status, i.moderation_status, i.city, i.state, to_char(i.last_checked_on,'YYYY-MM-DD') AS checked FROM issues i ORDER BY i.updated_at DESC LIMIT 200"); }

/** Saves the draft content. A published issue stays published but its content change is audited; it is re-checked against the publish rules. */
export async function saveIssue(actor: Actor, id: string, d: IssueDraft, sources: IssueSourceIn[]): Promise<void> {
  assertHuman(actor);
  const cur = await one<{ status: string }>("SELECT status FROM issues WHERE id=$1", [id]);
  if (!cur) throw new Error("Issue not found.");
  if (cur.status === "PUBLISHED") { const p = publishProblems(d, sources); if (p.length) throw new Error(`A published issue must stay complete: ${p[0]}`); }
  for (const [l, t] of [["Title", d.title], ["Summary", d.summary], ["Description", d.description]] as const) { const m = screenPublicText(l, t); if (m) throw new Error(m); }
  await tx(async (q) => {
    await q(`UPDATE issues SET title=$2, summary=$3, description=$4, why_discussed=$5, scope_level=$6, city=$7, state=$8, category=$9, perspectives=$10, disputed_claims=$11, developments=$12, unknowns=$13,
      last_checked_on=$14, updated_at=now() WHERE id=$1`, [id, d.title.trim(), d.summary.trim(), d.description.trim(), d.whyDiscussed.trim(), d.scopeLevel, d.city.trim(), d.state.trim(), d.category,
      JSON.stringify(d.perspectives), JSON.stringify(d.disputedClaims), JSON.stringify(d.developments), d.unknowns.trim(), d.lastCheckedOn || null]);
    await q("DELETE FROM issue_sources WHERE issue_id=$1", [id]);
    for (const [n, s] of sources.entries()) {
      if (!isHttps(s.url) || !s.title.trim() || !["OFFICIAL_RECORD", "RESEARCH", "INDEPENDENT_REPORTING", "ORGANIZATION_STATEMENT"].includes(s.kind)) throw new Error(`Source ${n + 1} is incomplete: a type, a title and an https link are needed.`);
      await q("INSERT INTO issue_sources (issue_id, kind, title, url, publisher, published_on, note, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [id, s.kind, s.title.trim(), s.url.trim(), s.publisher ?? "", s.publishedOn || null, s.note ?? "", n]);
    }
  });
  await audit(actor.userId, "issue.save", "issue", id, {});
}
/** Only a person publishes, and only a complete, sourced issue. */
export async function publishIssue(actor: Actor, id: string, note: string): Promise<void> {
  assertHuman(actor);
  const e = await getIssueForEdit(id);
  if (!e) throw new Error("Issue not found.");
  const problems = publishProblems(e.draft, e.sources);
  if (problems.length) throw new Error(`Cannot publish: ${problems.slice(0, 3).join(" ")}${problems.length > 3 ? ` (+${problems.length - 3} more)` : ""}`);
  if (note.trim().length < 3) throw new Error("Add a short note recording what you checked.");
  await query("UPDATE issues SET status='PUBLISHED', reviewed_by=$2, published_at=COALESCE(published_at, now()), updated_at=now() WHERE id=$1", [id, actor.userId]);
  await audit(actor.userId, "issue.publish", "issue", id, { reason: note.trim() });
}
export async function archiveIssue(actor: Actor, id: string, note: string): Promise<void> {
  assertHuman(actor);
  if (note.trim().length < 3) throw new Error("Add a short note.");
  await query("UPDATE issues SET status='ARCHIVED', updated_at=now() WHERE id=$1", [id]);
  await audit(actor.userId, "issue.archive", "issue", id, { reason: note.trim() });
}
