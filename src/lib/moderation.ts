/** Platform-rule moderation. Reasons are conduct / content categories only: there is no viewpoint category, and every action is logged. */
import { one, query } from "./db";
import { MODERATION_REASONS } from "./engine/public-protest";
import { assertHuman, type Actor } from "./knowledge";
import { audit } from "./store";

const need = (reason: string, note: string) => {
  if (!MODERATION_REASONS[reason]) throw new Error("Choose a platform-rule reason.");
  if (note.trim().length < 3) throw new Error("Add a short note explaining the decision.");
};
async function log(actor: Actor, action: string, reason: string, note: string, protestId: string | null, userId: string | null) {
  const id = (await one<{ id: string }>("INSERT INTO moderation_actions (protest_id, target_user_id, action, reason_code, note, admin_user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [protestId, userId, action, reason, note.trim(), actor.userId]))!.id;
  await audit(actor.userId, `moderation.${action.toLowerCase()}`, protestId ? "public_protest" : "user", (protestId ?? userId)!, { reason: `${reason}: ${note.trim()}` });
  return id;
}

export async function moderateProtest(actor: Actor, slug: string, action: "HIDE" | "RESTORE" | "REMOVE", reason: string, note: string) {
  assertHuman(actor);
  need(reason, note);
  const p = await one<{ id: string; moderation_status: string }>("SELECT id, moderation_status FROM public_protests WHERE slug=$1", [slug]);
  if (!p) throw new Error("Page not found.");
  const next = action === "HIDE" ? "HIDDEN" : action === "REMOVE" ? "REMOVED" : "OK";
  await query("UPDATE public_protests SET moderation_status=$2, updated_at=now() WHERE id=$1", [p.id, next]);
  return log(actor, action, reason, note, p.id, null);
}
export async function setOrganizerSuspended(actor: Actor, userId: string, suspended: boolean, reason: string, note: string) {
  assertHuman(actor);
  need(reason, note);
  const u = await one<{ role: string }>("SELECT role FROM users WHERE id=$1", [userId]);
  if (!u) throw new Error("Account not found.");
  if (u.role === "admin") throw new Error("An admin account cannot be suspended here.");
  await query("UPDATE users SET suspended_at = CASE WHEN $2 THEN now() ELSE NULL END, suspension_reason = CASE WHEN $2 THEN $3 ELSE '' END WHERE id=$1", [userId, suspended, reason]);
  return log(actor, suspended ? "SUSPEND_ORGANIZER" : "REINSTATE_ORGANIZER", reason, note, null, userId);
}

export async function listModerationQueue() {
  return query(`SELECT p.slug, p.title, p.city, p.state, to_char(p.event_date,'YYYY-MM-DD') AS d, p.visibility, p.moderation_status, p.category, u.email AS owner_email, u.id AS owner_id, (u.suspended_at IS NOT NULL) AS owner_suspended
    FROM public_protests p JOIN users u ON u.id=p.owner_user_id ORDER BY p.updated_at DESC LIMIT 200`);
}
export async function listModerationLog() {
  return query(`SELECT m.action, m.reason_code, m.note, m.created_at, p.slug, p.title, a.email AS admin_email FROM moderation_actions m LEFT JOIN public_protests p ON p.id=m.protest_id LEFT JOIN users a ON a.id=m.admin_user_id ORDER BY m.created_at DESC LIMIT 100`);
}
