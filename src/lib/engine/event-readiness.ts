/**
 * Deterministic event-day readiness. Pure; no percentages. The result is explainable: every state carries the reasons that produced it.
 *
 *   NOT_READY            something blocking is unresolved (permission not APPROVED, an applicable restriction, a confirmed venue conflict, an unresolved critical item)
 *   STATUS_UNKNOWN       nothing blocks, but we cannot confirm the live position (restriction feed stale/unreviewed, or no requirements configured)
 *   READY_WITH_WARNINGS  every blocking state is satisfied; non-blocking warnings remain
 *   READY                every blocking state is satisfied and nothing else is open
 *
 * A checklist tick never satisfies the permission gate: only a recorded APPROVED status does.
 */
import { isActionable, isWarning } from "./evaluate";
import { PERMISSION_LABEL, type PermissionStatus } from "./permission";
import type { EvaluatedItem, RestrictionOverlay } from "./types";

export type ReadinessState = "READY" | "READY_WITH_WARNINGS" | "NOT_READY" | "STATUS_UNKNOWN";
export type ReasonKind = "BLOCKING" | "UNKNOWN" | "WARNING";
export interface Reason { code: string; kind: ReasonKind; text: string; next?: string }
export interface EventReadiness { state: ReadinessState; headline: string; reasons: Reason[] }

export const READINESS_LABEL: Record<ReadinessState, string> = { READY: "Ready", READY_WITH_WARNINGS: "Ready with warnings", NOT_READY: "Not ready", STATUS_UNKNOWN: "Status unknown" };
/** The rule type that marks the police permission an event cannot proceed without. */
export const GATE_TYPE = "permission_gate";

export interface ReadinessInput {
  items: EvaluatedItem[];
  permission: PermissionStatus;
  permissionConditions?: string;
  overlays: RestrictionOverlay[];
  /** Latest live-restriction check status, or null when no feed covers the place. */
  restrictionCheck: { status: "RESTRICTIONS_APPLY" | "FEED_STALE" | "REVIEW_PENDING" | "NO_RESTRICTION_RECORDED" } | null;
  venue: { state: string; hasOthers: boolean } | null;
  rulesChanged?: boolean;
  unacknowledgedMaterialChanges?: number;
}

export function computeEventReadiness(i: ReadinessInput): EventReadiness {
  const reasons: Reason[] = [];
  const actionable = i.items.filter(isActionable);
  if (actionable.length === 0 && !i.items.some(isWarning)) {
    return { state: "STATUS_UNKNOWN", headline: "Status unknown: we have no configured requirements for this plan.", reasons: [{ code: "NO_REQUIREMENTS", kind: "UNKNOWN", text: "We have no configured requirements for this plan, so we cannot say whether it is ready.", next: "Check with the relevant authority." }] };
  }

  // ---- blocking
  const gates = actionable.filter((x) => x.rule.requirementType === GATE_TYPE && (x.level === "REQUIRED" || x.level === "LIKELY_REQUIRED"));
  if (gates.length && i.permission !== "APPROVED") {
    const why: Partial<Record<PermissionStatus, string>> = {
      NOT_STARTED: "You have not applied yet.", PREPARED: "Your application is prepared but not submitted.", SUBMITTED: "Your application is submitted; no approval has been recorded.",
      ACKNOWLEDGED: "Your application is acknowledged; no approval has been recorded.", REJECTED: "Your application was rejected.", WITHDRAWN: "Your application was withdrawn.", EXPIRED: "Your permission or application has expired.",
    };
    reasons.push({ code: "PERMISSION_NOT_APPROVED", kind: "BLOCKING", text: `Police permission is not approved (status: ${PERMISSION_LABEL[i.permission]}). ${why[i.permission] ?? ""}`.trim(), next: i.permission === "NOT_STARTED" || i.permission === "PREPARED" ? gates[0].rule.userAction || "Submit your application." : "Record the approval once you have the permission in hand." });
  }
  for (const o of i.overlays) reasons.push({ code: "RESTRICTION", kind: "BLOCKING", text: `A temporary restriction may conflict with your event: ${o.restriction.title}.`, next: "Read the order, then confirm with the issuing authority." });
  if (i.venue?.state === "CONFLICT_CONFIRMED") reasons.push({ code: "VENUE_CONFLICT", kind: "BLOCKING", text: "An official source shows another confirmed booking or approval for this venue on your date.", next: "Consider another date or ask the authority." });
  for (const x of actionable) {
    if (x.rule.severity === "CRITICAL" && !x.done && x.rule.requirementType !== GATE_TYPE) reasons.push({ code: "CRITICAL_OPEN", kind: "BLOCKING", text: `Critical item not done: ${x.rule.title}.`, next: x.rule.userAction || undefined });
  }

  // ---- cannot confirm
  if (i.restrictionCheck) {
    if (i.restrictionCheck.status === "FEED_STALE") reasons.push({ code: "FEED_STALE", kind: "UNKNOWN", text: "We could not confirm the latest orders: the restriction feed has not been checked recently.", next: "Check the Delhi Police notifications yourself." });
    if (i.restrictionCheck.status === "REVIEW_PENDING") reasons.push({ code: "ORDERS_UNREVIEWED", kind: "UNKNOWN", text: "New notifications are awaiting review, so we cannot say whether a restriction applies.", next: "Check the notifications yourself." });
  }

  // ---- warnings
  for (const x of actionable) {
    if (x.rule.severity !== "CRITICAL" && !x.done && x.rule.requirementType !== GATE_TYPE) reasons.push({ code: "ITEM_OPEN", kind: "WARNING", text: `${x.rule.severity === "REQUIRED" ? "Required" : "Recommended"} item not done: ${x.rule.title}.` });
    if (x.done && x.evidence === "needs_verification") reasons.push({ code: "NEEDS_VERIFICATION", kind: "WARNING", text: `"${x.rule.title}" is marked done, but the requirement itself still needs verification.` });
  }
  if (i.venue && (i.venue.state === "OTHER_EVENTS_KNOWN" || (i.venue.state === "SHARED_CAPACITY" && i.venue.hasOthers))) reasons.push({ code: "VENUE_OTHERS", kind: "WARNING", text: "Other events are known for this venue and date." });
  if (i.venue?.state === "OFFICIAL_STATUS_UNKNOWN") reasons.push({ code: "VENUE_UNKNOWN", kind: "WARNING", text: "We cannot see the official status of this venue for your date." });
  if (i.permission === "APPROVED" && i.permissionConditions?.trim()) reasons.push({ code: "PERMISSION_CONDITIONS", kind: "WARNING", text: "Your permission records conditions. Check your plan against them.", next: i.permissionConditions.trim().slice(0, 200) });
  if (i.rulesChanged) reasons.push({ code: "RULES_CHANGED", kind: "WARNING", text: "Rules have changed since your plan was generated.", next: "Recheck your plan." });
  if ((i.unacknowledgedMaterialChanges ?? 0) > 0) reasons.push({ code: "CHANGE_UNCONFIRMED", kind: "WARNING", text: "You changed your plan after applying and have not re-confirmed it with the issuing authority.", next: "Re-confirm with the issuing authority." });

  const blocking = reasons.filter((r) => r.kind === "BLOCKING"), unknown = reasons.filter((r) => r.kind === "UNKNOWN"), warn = reasons.filter((r) => r.kind === "WARNING");
  if (blocking.length) return { state: "NOT_READY", headline: `Not ready: ${blocking[0].text.replace(/\.$/, "")}.`, reasons };
  if (unknown.length) return { state: "STATUS_UNKNOWN", headline: `Status unknown: ${unknown[0].text.replace(/\.$/, "")}.`, reasons };
  if (warn.length) return { state: "READY_WITH_WARNINGS", headline: `Ready with ${warn.length} warning${warn.length > 1 ? "s" : ""}. Review them before the day.`, reasons };
  return { state: "READY", headline: "Ready: permission is approved and nothing blocking is open. Confirm any last-minute orders on the day.", reasons };
}
