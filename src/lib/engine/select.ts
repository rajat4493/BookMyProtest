import type { Answers, Rule, RestrictionOverlay, TemporaryRestriction } from "./types";

/** [from, until) — `until` is exclusive, null means open-ended. */
export function inWindow(from: string | null, until: string | null, asOf: string): boolean {
  return (!from || from <= asOf) && (!until || asOf < until);
}

/**
 * Can this rule version be used for guidance on `asOf` (the event date)?
 * - ACTIVE / CHANGE_DETECTED: when its effective window covers asOf.
 * - SUPERSEDED: only while its window still covers asOf (an event before the new version takes effect).
 * - DRAFT / UNDER_REVIEW / ARCHIVED: never.
 */
export function eligible(rule: Rule, asOf: string): boolean {
  if (rule.status === "ACTIVE" || rule.status === "CHANGE_DETECTED") return inWindow(rule.effectiveFrom, rule.effectiveUntil, asOf);
  if (rule.status === "SUPERSEDED") return rule.effectiveUntil !== null && inWindow(rule.effectiveFrom, rule.effectiveUntil, asOf);
  return false;
}

/**
 * Picks the rules that apply to a place and date.
 * `chain` is ordered general -> specific (e.g. country, region, city, venue).
 * Inheritance: rules at every level apply, unless a more specific rule OVERRIDEs or EXCLUDEs
 * (by `overridesFamilyId`) a less specific family. Narrowing is just a more specific rule with tighter conditions.
 */
export function selectRules(rules: Rule[], chain: string[], asOf: string): Rule[] {
  const depth = (r: Rule) => chain.indexOf(r.jurisdictionId);
  const inChain = rules.filter((r) => depth(r) >= 0 && eligible(r, asOf));

  // One version per family+jurisdiction: highest eligible version.
  const best = new Map<string, Rule>();
  for (const r of inChain) {
    const key = `${r.jurisdictionId}|${r.ruleFamilyId}`;
    const cur = best.get(key);
    if (!cur || r.version > cur.version) best.set(key, r);
  }
  const candidates = [...best.values()];

  const removed = new Set<Rule>();
  for (const r of candidates) {
    if (r.inheritanceMode === "ADD" || !r.overridesFamilyId) continue;
    for (const other of candidates) {
      if (other.ruleFamilyId === r.overridesFamilyId && depth(other) < depth(r)) removed.add(other);
    }
  }
  return candidates.filter((r) => !removed.has(r) && r.inheritanceMode !== "EXCLUDE").sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
}

/* ---------- Temporary restrictions ---------- */

export function activitiesOf(a: Answers): string[] {
  const out = ["ASSEMBLY"];
  if (a.kind === "march") out.push("MARCH");
  if (a.sound) out.push("SOUND");
  if (a.stage) out.push("STAGE");
  if (a.vehicles) out.push("VEHICLES");
  if (a.food) out.push("FOOD");
  return out;
}

const FIELD_ACTIVITY: Record<string, string> = { march: "MARCH", sound: "SOUND", stage: "STAGE", vehicles: "VEHICLES", food: "FOOD" };
/** Which activities a rule is about, inferred from the fields its conditions reference. */
export function ruleActivities(rule: Rule): string[] {
  const fields = [...rule.condition.all, ...rule.condition.any].map((c) => c.field);
  const acts = new Set(fields.map((f) => FIELD_ACTIVITY[f]).filter(Boolean));
  if (rule.assemblyType === "march") acts.add("MARCH");
  return [...acts];
}

/** Restrictions in force on the event date, in the place's chain, active, touching what the organiser plans. */
export function overlaysFor(restrictions: TemporaryRestriction[], chain: string[], eventDate: string, answers: Answers): RestrictionOverlay[] {
  const acts = activitiesOf(answers);
  const out: RestrictionOverlay[] = [];
  for (const r of restrictions) {
    if (r.status !== "ACTIVE" || !chain.includes(r.jurisdictionId)) continue;
    if (!(r.startsAt.slice(0, 10) <= eventDate && eventDate <= r.endsAt.slice(0, 10))) continue;
    const matched = r.affectedActivities.includes("ALL") ? acts : acts.filter((x) => r.affectedActivities.includes(x));
    if (matched.length > 0) out.push({ restriction: r, matchedActivities: matched });
  }
  return out;
}

/** Overlay ids that bear on a rule (a restriction on ASSEMBLY bears on everything). */
export function restrictionsBearingOn(rule: Rule, overlays: RestrictionOverlay[]): string[] {
  const acts = ruleActivities(rule);
  return overlays
    .filter((o) => o.matchedActivities.includes("ASSEMBLY") || o.matchedActivities.some((a) => acts.includes(a)))
    .map((o) => o.restriction.id);
}
