/** Change-after-application: editing a plan's details, and flagging material changes made after the organiser applied. */
import { one, query } from "./db";
import { detectChanges } from "./engine/material-change";
import type { Answers } from "./engine/types";
import { currentFingerprint, recheckEvent } from "./knowledge";
import { runRestrictionCheck } from "./restriction-checks";
import { getEvent, updateEventAnswers, type EventRow } from "./store";

/** Static advisory shown wherever a material change is flagged. We do not know which authority holds the application, so we say "issuing authority". */
export const RECONFIRM_ADVICE =
  "You have changed something that may matter to the authority you applied to. Please re-confirm the change with the issuing authority before the event: a permission or NOC given for the original plan may not cover the new one.";

export async function markApplicationSubmitted(eventId: string, submitted: boolean) {
  await query("UPDATE events SET application_submitted_at = CASE WHEN $2 THEN COALESCE(application_submitted_at, now()) ELSE NULL END, updated_at=now() WHERE id=$1", [eventId, submitted]);
}
export async function markApprovalRecorded(eventId: string, approved: boolean) {
  await query("UPDATE events SET approval_recorded_at = CASE WHEN $2 THEN COALESCE(approval_recorded_at, now()) ELSE NULL END, updated_at=now() WHERE id=$1 AND application_submitted_at IS NOT NULL", [eventId, approved]);
}
export async function approvalRecordedAt(eventId: string): Promise<string | null> {
  const r = await one<{ t: Date | null }>("SELECT approval_recorded_at AS t FROM events WHERE id=$1", [eventId]);
  return r?.t ? new Date(r.t).toISOString() : null;
}
export async function applicationSubmittedAt(eventId: string): Promise<string | null> {
  const r = await one<{ t: Date | null }>("SELECT application_submitted_at AS t FROM events WHERE id=$1", [eventId]);
  return r?.t ? new Date(r.t).toISOString() : null;
}

export interface EventChange {
  id: string; changedAt: string; changedFields: string[]; material: boolean; rulesChanged: boolean; afterApplication: boolean; acknowledgedAt: string | null; materialLabels: string[];
}

export async function updateEventDetails(event: EventRow, next: Answers): Promise<{ changed: boolean; material: boolean; materialLabels: string[]; afterApplication: boolean; rulesChanged: boolean }> {
  const d = detectChanges(event.answers, next);
  if (!d.changedFields.length && JSON.stringify(event.answers) === JSON.stringify(next)) return { changed: false, material: false, materialLabels: [], afterApplication: false, rulesChanged: false };
  const before = event.answers;
  const applied = !!(await applicationSubmittedAt(event.id));
  await updateEventAnswers(event.id, next);
  const updated = (await getEvent(event.id))!;
  const prevFp = await currentFingerprint(event);
  const nextFp = await currentFingerprint(updated);
  const rulesChanged = prevFp !== nextFp;
  await recheckEvent(updated); // new immutable snapshot, with done ticks carried by family
  await query(
    "INSERT INTO event_changes (event_id, changed_fields, before, after, material, rules_changed, after_application) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [event.id, d.changedFields, JSON.stringify(before), JSON.stringify(next), d.material, rulesChanged, applied && d.material]);
  await runRestrictionCheck(updated, "RECHECK");
  return { changed: true, material: d.material, materialLabels: d.materialLabels, afterApplication: applied && d.material, rulesChanged };
}

export async function openChangeNotices(eventId: string): Promise<EventChange[]> {
  const rows = await query("SELECT * FROM event_changes WHERE event_id=$1 AND after_application AND acknowledged_at IS NULL ORDER BY changed_at DESC", [eventId]);
  return rows.map((r: any) => {
    const d = detectChanges(r.before, r.after);
    return { id: r.id, changedAt: new Date(r.changed_at).toISOString(), changedFields: r.changed_fields, material: r.material, rulesChanged: r.rules_changed, afterApplication: r.after_application, acknowledgedAt: null, materialLabels: d.materialLabels };
  });
}
export async function acknowledgeChanges(eventId: string) {
  await query("UPDATE event_changes SET acknowledged_at=now() WHERE event_id=$1 AND after_application AND acknowledged_at IS NULL", [eventId]);
}
