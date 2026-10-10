/** Event readiness: assembles the inputs (permission, restrictions, venue, pinned rules), computes the deterministic state, and persists each result as a snapshot. */
import { query } from "./db";
import { openChangeNotices } from "./event-changes";
import { evaluate } from "./engine/evaluate";
import { computeEventReadiness, type EventReadiness } from "./engine/event-readiness";
import { overlaysFor } from "./engine/select";
import { chainFor, currentFingerprint, generateEvaluation, latestEvaluation, listRestrictions } from "./knowledge";
import { currentPermission } from "./permissions";
import { peekRestrictionCheck, runRestrictionCheck, type TriggerKind } from "./restriction-checks";
import { doneRuleIds, getRulesByIds, type EventRow } from "./store";
import { venueAvailability } from "./venue-signals";

export interface ReadinessSnapshot { id: string; trigger: TriggerKind; computedAt: string; state: EventReadiness["state"]; reasons: EventReadiness["reasons"]; inputs: Record<string, unknown> }

/** Computes the live readiness exactly as the organizer's plan is evaluated (pinned rule versions + current restrictions). */
export async function assessReadiness(event: EventRow, now = new Date()): Promise<{ readiness: EventReadiness; inputs: Record<string, unknown> }> {
  const evaluation = (await latestEvaluation(event.id)) ?? (await generateEvaluation(event, "BACKFILL"));
  const chain = await chainFor(event);
  const overlays = overlaysFor(await listRestrictions(chain), chain, event.date, event.answers);
  const items = evaluate(await getRulesByIds(evaluation.ruleIds), event.answers, await doneRuleIds(event.id), overlays);
  const perm = await currentPermission(event.id);
  const check = await peekRestrictionCheck(event, now); // the position right now, not a stored one
  const a = event.answers;
  const venue = event.venueJurisdictionId ? await venueAvailability(event.venueJurisdictionId, event.date, a.startTime, a.endTime, { attendance: a.attendance, excludeEventId: event.id, now }) : null;
  const unack = (await openChangeNotices(event.id)).length;
  const rulesChanged = (await currentFingerprint(event)) !== evaluation.fingerprint;
  const readiness = computeEventReadiness({
    items, permission: perm.status, permissionConditions: perm.conditions, overlays, restrictionCheck: check ? { status: check.status } : null,
    venue: venue ? { state: venue.state, hasOthers: venue.others.length + venue.confirmed.length > 0 } : null, rulesChanged, unacknowledgedMaterialChanges: unack,
  });
  const inputs = {
    permissionStatus: perm.status, permissionReference: perm.reference, restrictionCheck: check ? { status: check.status, feed: check.feedTitle, feedLastCheckedAt: check.feedLastCheckedAt?.toISOString() ?? null, pendingReview: check.pendingReview } : null,
    activeRestrictions: overlays.map((o) => o.restriction.title), venueState: venue?.state ?? null, unacknowledgedMaterialChanges: unack, rulesChanged,
    unresolvedCritical: items.filter((x) => x.rule.severity === "CRITICAL" && !x.done && x.rule.requirementType !== "warning").map((x) => x.rule.title),
  };
  return { readiness, inputs };
}

const map = (r: any): ReadinessSnapshot => ({ id: r.id, trigger: r.trigger_kind, computedAt: new Date(r.computed_at).toISOString(), state: r.state, reasons: r.reasons, inputs: r.inputs });

export async function recordReadiness(event: EventRow, trigger: TriggerKind, now = new Date()): Promise<ReadinessSnapshot | null> {
  const { readiness, inputs } = await assessReadiness(event, now);
  const row = (await query("INSERT INTO readiness_snapshots (event_id, trigger_kind, computed_at, state, reasons, inputs) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *",
    [event.id, trigger, now, readiness.state, JSON.stringify(readiness.reasons), JSON.stringify(inputs)]))[0];
  return row ? map(row) : null;
}

/** The standard recheck: look at the restriction feed (where one covers the place), then record the readiness result as a snapshot. */
export async function runChecks(event: EventRow, trigger: TriggerKind, now = new Date()) {
  const check = await runRestrictionCheck(event, trigger, now);
  const snapshot = await recordReadiness(event, trigger, now);
  return { check, snapshot };
}

export async function listReadinessSnapshots(eventId: string, scheduledOnly = false, limit = 20): Promise<ReadinessSnapshot[]> {
  return (await query(`SELECT * FROM readiness_snapshots WHERE event_id=$1 AND ($2::boolean IS FALSE OR trigger_kind IN ('T_72H','T_24H')) ORDER BY computed_at DESC, id LIMIT $3`, [eventId, scheduledOnly, limit])).map(map);
}

