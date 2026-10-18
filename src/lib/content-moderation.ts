/**
 * Reports, corrections and moderation for issue pages and digital campaigns. Extends the v1.0 model; the rules are the same:
 *  - a report asks a person to look and never hides anything by itself;
 *  - a disputed FACTUAL statement is answered with a correction, never by deleting the page (hiding needs a conduct reason);
 *  - every decision needs a note and is logged.
 */
import { createHash } from "node:crypto";
import { one, query, tx } from "./db";
import { MODERATION_REASONS } from "./engine/public-protest";
import { isHttps } from "./engine/issues";
import { assertHuman, type Actor } from "./knowledge";
import { audit } from "./store";

export type TargetType = "ISSUE" | "CAMPAIGN";
export const REPORT_REASONS: Record<string, string> = { FACTUAL_ERROR: "A statement of fact is wrong or misleading", ...MODERATION_REASONS };
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);
const TABLE = { ISSUE: "issues", CAMPAIGN: "digital_campaigns" } as const;

async function target(type: TargetType, slug: string) {
  if (type === "ISSUE") return one<{ id: string; ok: boolean; owner: string | null }>("SELECT id, (status='PUBLISHED' AND moderation_status='OK') AS ok, NULL::uuid AS owner FROM issues WHERE slug=$1", [slug]);
  return one<{ id: string; ok: boolean; owner: string | null }>("SELECT id, (visibility IN ('PUBLIC','UNLISTED','ARCHIVED') AND published_at IS NOT NULL AND moderation_status='OK') AS ok, owner_user_id AS owner FROM digital_campaigns WHERE slug=$1", [slug]);
}

/** Anyone may report, including the company or person a statement is about. Signed-in or not. */
export async function submitContentReport(i: { type: TargetType; slug: string; reason: string; note: string; disputedText: string; evidenceUrl: string; reporterUserId: string | null; network: string }): Promise<"RECEIVED" | "ALREADY_REPORTED"> {
  if (!REPORT_REASONS[i.reason]) throw new Error("Choose what is wrong.");
  const note = i.note.trim(), disputed = i.disputedText.trim();
  if (note.length > 800 || disputed.length > 800) throw new Error("Keep each field under 800 characters.");
  if (i.reason === "FACTUAL_ERROR" && disputed.length < 10) throw new Error("Quote the statement you say is wrong, so a reviewer can check it against its source.");
  if (i.reason === "OTHER" && note.length < 5) throw new Error("Tell us briefly what is wrong.");
  if (i.evidenceUrl && !isHttps(i.evidenceUrl)) throw new Error("An evidence link must start with https://");
  const t = await target(i.type, i.slug);
  if (!t || !t.ok) throw new Error("This page is not available to report.");
  if (i.reporterUserId && t.owner && i.reporterUserId === t.owner) throw new Error("You cannot report your own campaign. Edit or archive it instead.");
  const key = hash(i.reporterUserId ? `u:${i.reporterUserId}` : `n:${i.network}`);
  const ins = await query("INSERT INTO content_reports (target_type, target_id, reporter_user_id, reporter_hash, reason_code, note, disputed_text, evidence_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id",
    [i.type, t.id, i.reporterUserId, key, i.reason, note, disputed, i.evidenceUrl.trim()]);
  return ins.length ? "RECEIVED" : "ALREADY_REPORTED";
}

export async function listContentReports(all = false) {
  return query(`SELECT r.id, r.target_type, r.reason_code, r.note, r.disputed_text, r.evidence_url, r.status, r.created_at, r.resolution_note,
      COALESCE(i.slug, c.slug) AS slug, COALESCE(i.title, c.title) AS title, COALESCE(i.moderation_status, c.moderation_status) AS moderation_status,
      (r.reporter_user_id IS NOT NULL) AS signed_in, ru.email AS reporter_email, ra.email AS resolved_by_email,
      (SELECT count(*)::int FROM content_reports x WHERE x.target_type=r.target_type AND x.target_id=r.target_id AND x.status='OPEN') AS open_for_page
    FROM content_reports r LEFT JOIN issues i ON r.target_type='ISSUE' AND i.id=r.target_id LEFT JOIN digital_campaigns c ON r.target_type='CAMPAIGN' AND c.id=r.target_id
    LEFT JOIN users ru ON ru.id=r.reporter_user_id LEFT JOIN users ra ON ra.id=r.resolved_by
    WHERE ($1 OR r.status='OPEN') ORDER BY (r.status='OPEN') DESC, r.created_at DESC LIMIT 200`, [all]);
}

const need = (note: string) => { if (note.trim().length < 3) throw new Error("Add a short note explaining the decision."); };

async function logMod(actor: Actor, type: TargetType, id: string, action: string, reason: string, note: string): Promise<string> {
  const col = type === "ISSUE" ? "issue_id" : "campaign_id";
  const mid = (await one<{ id: string }>(`INSERT INTO moderation_actions (${col}, action, reason_code, note, admin_user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [id, action, reason, note.trim(), actor.userId]))!.id;
  await audit(actor.userId, `moderation.${action.toLowerCase()}`, TABLE[type], id, { reason: `${reason}: ${note.trim()}` });
  return mid;
}
/** Hide / restore / remove for platform-rule (conduct) reasons only. A dispute about facts is never a reason to remove. */
export async function moderateContent(actor: Actor, type: TargetType, slug: string, op: "HIDE" | "RESTORE" | "REMOVE", reason: string, note: string): Promise<string> {
  assertHuman(actor); need(note);
  if (!MODERATION_REASONS[reason]) throw new Error("Choose a platform-rule reason. A factual dispute is answered with a correction, not a removal.");
  const t = await target(type, slug); if (!t) throw new Error("Page not found.");
  await query(`UPDATE ${TABLE[type]} SET moderation_status=$2, updated_at=now() WHERE id=$1`, [t.id, op === "HIDE" ? "HIDDEN" : op === "REMOVE" ? "REMOVED" : "OK"]);
  return logMod(actor, type, t.id, op, reason, note);
}

/** A correction is published on the page next to the statement it corrects. The original is kept; the campaign may be marked DISPUTED while it stands. */
export async function addCorrection(actor: Actor, type: TargetType, slug: string, c: { claim: string; correction: string; sourceUrl: string; markDisputed: boolean; reportId?: string | null }): Promise<string> {
  assertHuman(actor);
  if (c.claim.trim().length < 5) throw new Error("Quote the statement being corrected.");
  if (c.correction.trim().length < 10 || c.correction.length > 1000) throw new Error("Write the correction in 10 to 1000 characters.");
  if (c.sourceUrl && !isHttps(c.sourceUrl)) throw new Error("A source link must start with https://");
  const t = await target(type, slug); if (!t) throw new Error("Page not found.");
  const id = await tx(async (q) => {
    const cid = (await q("INSERT INTO content_corrections (target_type, target_id, claim_text, correction_text, source_url, report_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [type, t.id, c.claim.trim(), c.correction.trim(), c.sourceUrl.trim(), c.reportId ?? null, actor.userId]))[0].id as string;
    if (type === "CAMPAIGN" && c.markDisputed) await q("UPDATE digital_campaigns SET outcome_state='DISPUTED', updated_at=now() WHERE id=$1 AND outcome_state NOT IN ('ARCHIVED')", [t.id]);
    return cid;
  });
  await audit(actor.userId, "content.correction", TABLE[type], t.id, { reason: c.correction.trim() });
  return id;
}
export async function clearDisputed(actor: Actor, slug: string, note: string): Promise<void> {
  assertHuman(actor); need(note);
  const t = await target("CAMPAIGN", slug); if (!t) throw new Error("Campaign not found.");
  await query("UPDATE digital_campaigns SET outcome_state='ACTIVE', updated_at=now() WHERE id=$1 AND outcome_state='DISPUTED'", [t.id]);
  await audit(actor.userId, "campaign.dispute_cleared", "digital_campaigns", t.id, { reason: note.trim() });
}
export async function correctionsFor(type: TargetType, id: string) {
  return (await query("SELECT claim_text, correction_text, source_url, created_at FROM content_corrections WHERE target_type=$1 AND target_id=$2 ORDER BY created_at DESC", [type, id]))
    .map((c: any) => ({ claim: c.claim_text as string, correction: c.correction_text as string, sourceUrl: c.source_url as string, createdAt: new Date(c.created_at).toISOString() }));
}

/**
 * Resolve a report. Conduct reports: DISMISS, HIDE or REMOVE (needs a platform-rule reason, defaulting to the report's own).
 * Factual-error reports: DISMISS or CORRECTION only: they cannot remove a page.
 */
export async function resolveContentReport(actor: Actor, reportId: string, outcome: "DISMISS" | "CORRECTION" | "HIDE" | "REMOVE", note: string, extra: { correction?: string; claim?: string; sourceUrl?: string; markDisputed?: boolean } = {}): Promise<void> {
  assertHuman(actor); need(note);
  const r = await one<{ id: string; status: string; target_type: TargetType; target_id: string; reason_code: string; disputed_text: string }>("SELECT * FROM content_reports WHERE id=$1", [reportId]);
  if (!r) throw new Error("Report not found.");
  if (r.status !== "OPEN") throw new Error("This report is already resolved.");
  const slug = (await one<{ slug: string }>(`SELECT slug FROM ${TABLE[r.target_type]} WHERE id=$1`, [r.target_id]))?.slug;
  if (!slug) throw new Error("The reported page no longer exists.");
  const factual = r.reason_code === "FACTUAL_ERROR";
  if (factual && (outcome === "HIDE" || outcome === "REMOVE")) throw new Error("A disputed statement is answered with a correction or dismissed. It cannot remove a page.");
  if (!factual && outcome === "CORRECTION") throw new Error("Corrections answer factual-error reports.");
  let status: "ACTIONED" | "CORRECTED" | "DISMISSED" = "DISMISSED";
  if (outcome === "CORRECTION") {
    await addCorrection(actor, r.target_type, slug, { claim: extra.claim || r.disputed_text, correction: extra.correction ?? "", sourceUrl: extra.sourceUrl ?? "", markDisputed: !!extra.markDisputed, reportId });
    status = "CORRECTED";
  } else if (outcome === "HIDE" || outcome === "REMOVE") { await moderateContent(actor, r.target_type, slug, outcome, r.reason_code, note); status = "ACTIONED"; }
  else await audit(actor.userId, "content_report.dismiss", "content_report", reportId, { reason: note.trim() });
  await query("UPDATE content_reports SET status=$2, resolved_by=$3, resolved_at=now(), resolution_note=$4 WHERE id=$1", [reportId, status, actor.userId, note.trim()]);
  if (status === "ACTIONED") await query("UPDATE content_reports SET status='ACTIONED', resolved_by=$2, resolved_at=now(), resolution_note=$3 WHERE target_type=$4 AND target_id=$5 AND status='OPEN' AND reason_code<>'FACTUAL_ERROR'", [reportId, actor.userId, `Settled with report ${reportId.slice(0, 8)}: ${note.trim()}`, r.target_type, r.target_id]);
}
