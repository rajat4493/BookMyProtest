/** Recording the police-permission lifecycle. Only a person records a status; nothing is inferred from checklist ticks. */
import { one, query, tx } from "./db";
import { PERMISSION_STATUSES, SUBMISSION_METHODS, validateTransition, type PermissionRecord, type PermissionStatus, type SubmissionMethod } from "./engine/permission";
import type { EventRow } from "./store";

const map = (r: any): PermissionRecord => ({
  status: r.status, occurredAt: r.occurred_at ? new Date(r.occurred_at).toISOString() : null, method: r.method, reference: r.reference, evidenceRef: r.evidence_ref,
  approvalDate: r.ad ?? null, conditions: r.conditions, recordedAt: new Date(r.recorded_at).toISOString(),
});
const SEL = "SELECT *, to_char(approval_date,'YYYY-MM-DD') AS ad FROM event_permissions";

export async function permissionHistory(eventId: string): Promise<PermissionRecord[]> {
  return (await query(`${SEL} WHERE event_id=$1 ORDER BY recorded_at DESC, id`, [eventId])).map(map);
}
export async function currentPermission(eventId: string): Promise<PermissionRecord> {
  return (await permissionHistory(eventId))[0] ?? { status: "NOT_STARTED", occurredAt: null, method: null, reference: "", evidenceRef: "", approvalDate: null, conditions: "", recordedAt: new Date(0).toISOString() };
}

export interface PermissionInput { status: PermissionStatus; occurredAt?: string | null; method?: SubmissionMethod | null; reference?: string; evidenceRef?: string; approvalDate?: string | null; conditions?: string }

/** Appends a status. Keeps the older application_submitted_at / approval_recorded_at columns in step (they drive change-after-application and venue signals). */
export async function recordPermission(event: Pick<EventRow, "id">, i: PermissionInput, now = new Date()): Promise<PermissionRecord> {
  if (!(PERMISSION_STATUSES as readonly string[]).includes(i.status)) throw new Error("Unknown status");
  if (i.method && !(SUBMISSION_METHODS as readonly string[]).includes(i.method)) throw new Error("Unknown submission method");
  const cur = await currentPermission(event.id);
  const err = validateTransition(cur.status, i.status, { occurredAt: i.occurredAt, approvalDate: i.approvalDate, today: now.toISOString().slice(0, 10) });
  if (err) throw new Error(err);
  const occurred = i.occurredAt ? new Date(i.occurredAt) : null;
  if (occurred && isNaN(+occurred)) throw new Error("That date and time is not valid.");
  await tx(async (q) => {
    await q(`INSERT INTO event_permissions (event_id, status, occurred_at, method, reference, evidence_ref, approval_date, conditions, recorded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [event.id, i.status, occurred, i.method ?? null, (i.reference ?? "").trim().slice(0, 200), (i.evidenceRef ?? "").trim().slice(0, 300), i.status === "APPROVED" ? i.approvalDate : null, (i.conditions ?? "").trim().slice(0, 1000), now]);
    const applied = ["SUBMITTED", "ACKNOWLEDGED", "APPROVED"].includes(i.status);
    await q("UPDATE events SET application_submitted_at = CASE WHEN $2 THEN COALESCE(application_submitted_at, $3) ELSE NULL END, approval_recorded_at = CASE WHEN $4 THEN $3 ELSE NULL END, updated_at=now() WHERE id=$1",
      [event.id, applied, occurred ?? now, i.status === "APPROVED"]);
  });
  return currentPermission(event.id);
}

