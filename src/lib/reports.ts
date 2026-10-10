/** User reports on public pages. A report is a request for a human to look; it never hides anything by itself (so it cannot be brigaded into a takedown). */
import { createHash } from "node:crypto";
import { one, query } from "./db";
import { MODERATION_REASONS } from "./engine/public-protest";
import { assertHuman, type Actor } from "./knowledge";
import { moderateProtest } from "./moderation";
import { audit } from "./store";

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export async function submitReport(i: { slug: string; reason: string; note: string; reporterUserId: string | null; network: string }): Promise<"RECEIVED" | "ALREADY_REPORTED"> {
  if (!MODERATION_REASONS[i.reason]) throw new Error("Choose what is wrong with this page.");
  const note = i.note.trim();
  if (note.length > 500) throw new Error("Keep the note under 500 characters.");
  if (i.reason === "OTHER" && note.length < 5) throw new Error("Tell us briefly what is wrong.");
  const p = await one<{ id: string; owner_id: string; visibility: string; moderation_status: string }>("SELECT id, owner_user_id AS owner_id, visibility, moderation_status FROM public_protests WHERE slug=$1", [i.slug]);
  if (!p || p.moderation_status !== "OK" || !["PUBLIC", "UNLISTED", "CANCELLED"].includes(p.visibility)) throw new Error("This page is not available to report.");
  if (i.reporterUserId && i.reporterUserId === p.owner_id) throw new Error("You cannot report your own page. Edit or unpublish it instead.");
  const key = hash(i.reporterUserId ? `u:${i.reporterUserId}` : `n:${i.network}`);
  const ins = await query("INSERT INTO protest_reports (protest_id, reporter_user_id, reporter_hash, reason_code, note) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id", [p.id, i.reporterUserId, key, i.reason, note]);
  return ins.length ? "RECEIVED" : "ALREADY_REPORTED";
}

export async function listReports(status: "OPEN" | "ALL" = "OPEN") {
  return query(`SELECT r.id, r.reason_code, r.note, r.status, r.created_at, r.resolution_note, r.resolved_at, p.slug, p.title, p.moderation_status, p.identity_flags,
      (r.reporter_user_id IS NOT NULL) AS signed_in, ru.email AS reporter_email, ra.email AS resolved_by_email,
      (SELECT count(*)::int FROM protest_reports x WHERE x.protest_id=r.protest_id AND x.status='OPEN') AS open_for_page
    FROM protest_reports r JOIN public_protests p ON p.id=r.protest_id LEFT JOIN users ru ON ru.id=r.reporter_user_id LEFT JOIN users ra ON ra.id=r.resolved_by
    WHERE ($1 OR r.status='OPEN') ORDER BY (r.status='OPEN') DESC, r.created_at DESC LIMIT 200`, [status === "ALL"]);
}

/** A human resolves a report: take moderation action (logged with the report's own reason unless overridden) or dismiss it with a note. */
export async function resolveReport(actor: Actor, reportId: string, outcome: "HIDE" | "REMOVE" | "DISMISS", note: string, reason?: string) {
  assertHuman(actor);
  if (note.trim().length < 3) throw new Error("Add a short note explaining the decision.");
  const r = await one<{ id: string; status: string; reason_code: string; slug: string }>("SELECT r.id, r.status, r.reason_code, p.slug FROM protest_reports r JOIN public_protests p ON p.id=r.protest_id WHERE r.id=$1", [reportId]);
  if (!r) throw new Error("Report not found.");
  if (r.status !== "OPEN") throw new Error("This report is already resolved.");
  let actionId: string | null = null;
  if (outcome !== "DISMISS") actionId = await moderateProtest(actor, r.slug, outcome, reason || r.reason_code, note);
  await query("UPDATE protest_reports SET status=$2, resolved_by=$3, resolved_at=now(), resolution_note=$4, moderation_action_id=$5 WHERE id=$1", [reportId, outcome === "DISMISS" ? "DISMISSED" : "ACTIONED", actor.userId, note.trim(), actionId]);
  if (outcome === "DISMISS") await audit(actor.userId, "report.dismiss", "protest_report", reportId, { reason: note.trim() });
  // Other open reports on a page that was just actioned are settled by the same decision.
  if (outcome !== "DISMISS") await query("UPDATE protest_reports SET status='ACTIONED', resolved_by=$2, resolved_at=now(), resolution_note=$3, moderation_action_id=$4 WHERE protest_id=(SELECT protest_id FROM protest_reports WHERE id=$1) AND status='OPEN'", [reportId, actor.userId, `Settled with report ${reportId.slice(0, 8)}: ${note.trim()}`, actionId]);
}

/** Identity-review queue: pages whose name was auto-flagged and not yet reviewed by a human. */
export async function listIdentityReview() {
  return query(`SELECT p.slug, p.title, p.organizer_display_name, p.identity_flags, p.visibility, p.moderation_status, u.email AS owner_email,
      (u.email_verified_at IS NOT NULL) AS email_confirmed
    FROM public_protests p JOIN users u ON u.id=p.owner_user_id
    WHERE cardinality(p.identity_flags) > 0 AND p.identity_reviewed_at IS NULL AND p.visibility IN ('PUBLIC','UNLISTED') ORDER BY p.updated_at DESC LIMIT 100`);
}
export async function clearIdentityReview(actor: Actor, slug: string, note: string) {
  assertHuman(actor);
  if (note.trim().length < 3) throw new Error("Add a short note explaining the decision.");
  const p = await one<{ id: string }>("UPDATE public_protests SET identity_reviewed_at=now() WHERE slug=$1 RETURNING id", [slug]);
  if (!p) throw new Error("Page not found.");
  await audit(actor.userId, "identity.review_cleared", "public_protest", p.id, { reason: note.trim() });
}
