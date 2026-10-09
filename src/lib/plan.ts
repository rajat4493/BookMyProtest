import { loadOwnedEvent } from "./access";
import { evaluate } from "./engine/evaluate";
import { computeReadiness } from "./engine/readiness";
import { overlaysFor } from "./engine/select";
import { chainFor, currentFingerprint, generateEvaluation, latestEvaluation, listRestrictions } from "./knowledge";
import { doneRuleIds, getJurisdiction, getRulesByIds, type EventRow } from "./store";
import type { Freshness, Level, Severity } from "./engine/types";

export const LEVEL_LABEL: Record<Level, string> = {
  REQUIRED: "Required", LIKELY_REQUIRED: "May be required", RECOMMENDED: "Recommended", NOT_REQUIRED: "Not required", UNKNOWN: "Unknown",
};
export const SEVERITY_LABEL: Record<Severity, string> = { CRITICAL: "Critical", REQUIRED: "Required", RECOMMENDED: "Recommended" };

/** Suggested planning buffer before the event. This is OUR suggestion, never a legal deadline. */
export const PLANNING_BUFFER_DAYS = 14;

/**
 * Evaluates a plan from the rule versions PINNED in its latest evaluation snapshot, so a law change never silently
 * rewrites what the organiser was shown. `rulesChanged` tells the UI to offer a recheck.
 */
export async function computePlan(event: EventRow) {
  const city = await getJurisdiction(event.jurisdictionId);
  const parent = city?.parentId ? await getJurisdiction(city.parentId) : null;
  const evaluation = (await latestEvaluation(event.id)) ?? (await generateEvaluation(event, "BACKFILL"));
  const pinned = await getRulesByIds(evaluation.ruleIds);
  const chain = await chainFor(event);
  const overlays = overlaysFor(await listRestrictions(chain), chain, event.date, event.answers);
  const items = evaluate(pinned, event.answers, await doneRuleIds(event.id), overlays);
  const readiness = computeReadiness(items);
  const rulesChanged = (await currentFingerprint(event)) !== evaluation.fingerprint;
  const verifiedOn = items.map((i) => i.rule.lastVerifiedAt).filter((d): d is string => !!d).sort().pop() ?? null;
  const cityLabel = city ? (parent ? `${city.name}, ${parent.name}` : city.name) : "";
  const venueName = event.venueJurisdictionId ? (await getJurisdiction(event.venueJurisdictionId))?.name ?? null : null;
  return { event, city, cityLabel, venueName, items, readiness, evaluation, rulesChanged, overlays, verifiedOn };
}

export async function loadPlan(id: string) {
  return computePlan(await loadOwnedEvent(id));
}

export function formatDate(iso: string, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

export function daysUntil(iso: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  CURRENT: "Current", VERIFY_REQUIRED: "Needs verification", CHANGE_UNDER_REVIEW: "Change under review", UNKNOWN: "Unknown", SUPERSEDED: "Superseded",
};
