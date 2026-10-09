import { loadOwnedEvent } from "./access";
import { evaluate } from "./engine/evaluate";
import { computeReadiness } from "./engine/readiness";
import { doneRuleIds, getJurisdiction, rulesForJurisdiction } from "./store";
import type { Level, Severity } from "./engine/types";

export const LEVEL_LABEL: Record<Level, string> = {
  REQUIRED: "Required", LIKELY_REQUIRED: "May be required", RECOMMENDED: "Recommended", NOT_REQUIRED: "Not required", UNKNOWN: "Unknown",
};
export const SEVERITY_LABEL: Record<Severity, string> = { CRITICAL: "Critical", REQUIRED: "Required", RECOMMENDED: "Recommended" };

/** Suggested planning buffer before the event. This is OUR suggestion, never a legal deadline. */
export const PLANNING_BUFFER_DAYS = 14;

export async function loadPlan(id: string) {
  const event = await loadOwnedEvent(id);
  const city = await getJurisdiction(event.jurisdictionId);
  const parent = city?.parentId ? await getJurisdiction(city.parentId) : null;
  const rules = await rulesForJurisdiction(event.jurisdictionId);
  const items = evaluate(rules, event.answers, await doneRuleIds(event.id));
  const readiness = computeReadiness(items);
  const cityLabel = city ? (parent ? `${city.name}, ${parent.name}` : city.name) : "";
  return { event, city, cityLabel, items, readiness };
}

export function formatDate(iso: string, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

export function daysUntil(iso: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
