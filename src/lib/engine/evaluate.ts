import { restrictionsBearingOn } from "./select";
import type { Answers, Clause, Condition, DeadlineDef, EvaluatedItem, EvidenceStatus, Freshness, RestrictionOverlay, Rule } from "./types";

/** Reads a field the way rules see it. */
export function fieldValue(a: Answers, field: Clause["field"]): string | number | boolean {
  if (field === "march") return a.kind === "march";
  if (field === "buses") return a.buses ?? 0;
  return a[field];
}

export function clauseMatches(a: Answers, c: Clause): boolean {
  const actual = fieldValue(a, c.field);
  switch (c.op) {
    case "present":
      return typeof actual === "string" ? actual.trim().length > 0 : actual !== undefined && actual !== null && actual !== false;
    case "eq":
      return actual === c.value;
    case "neq":
      return actual !== c.value;
    case "in":
      return Array.isArray(c.value) && c.value.includes(String(actual));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const x = Number(actual);
      const y = Number(c.value);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      return c.op === "gt" ? x > y : c.op === "gte" ? x >= y : c.op === "lt" ? x < y : x <= y;
    }
  }
}

export function conditionMatches(a: Answers, cond: Condition | null | undefined): boolean {
  if (!cond) return false;
  const all = cond.all ?? [];
  const any = cond.any ?? [];
  if (!all.every((c) => clauseMatches(a, c))) return false;
  return any.length === 0 || any.some((c) => clauseMatches(a, c));
}

/**
 * Non-negotiable: a rule only counts as verified when it is ACTIVE, has a legal certainty above UNVERIFIED, has a linked source with a real URL
 * that is NOT merely a secondary lead, has a verification date, is not flagged for review and is not low confidence.
 * Everything else must be surfaced as "Needs verification".
 */
export function evidenceStatus(rule: Rule): EvidenceStatus {
  const hasPrimary = rule.sources.some((s) => !!s.url && s.url.trim() !== "" && !!s.sourceType && s.sourceType !== "SECONDARY_LEAD" && s.strength !== "LEAD");
  if (rule.status === "ACTIVE" && rule.legalCertainty !== "UNVERIFIED" && hasPrimary && rule.lastVerifiedAt && !rule.needsReview && rule.confidence !== "low") return "verified";
  return "needs_verification";
}

export function freshnessOf(rule: Rule, level: EvaluatedItem["level"], evidence: EvidenceStatus): Freshness {
  if (level === "UNKNOWN") return "UNKNOWN";
  if (rule.status === "CHANGE_DETECTED") return "CHANGE_UNDER_REVIEW";
  if (rule.status === "SUPERSEDED") return "SUPERSEDED";
  return evidence === "verified" ? "CURRENT" : "VERIFY_REQUIRED";
}

/** Structured deadline -> concrete date. Never invents one: only STRUCTURED definitions with a minimum produce a date. */
export function computeDeadline(def: DeadlineDef, eventDate: string): string | null {
  if (!eventDate || def.kind !== "STRUCTURED" || def.minimumDaysBeforeEvent == null) return null;
  const n = def.minimumDaysBeforeEvent;
  if (def.dayType !== "BUSINESS") return addDays(eventDate, -n);
  let d = eventDate;
  for (let left = n; left > 0; ) {
    d = addDays(d, -1);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) left--; // business days skip weekends (public holidays are not modelled)
  }
  return d;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Evaluates all rules against the answers. Rules that do not apply (and have no else_level) are dropped. */
export function evaluate(rules: Rule[], answers: Answers, doneRuleIds: ReadonlySet<string> = new Set(), overlays: RestrictionOverlay[] = []): EvaluatedItem[] {
  const out: EvaluatedItem[] = [];
  for (const rule of rules) {
    if (rule.assemblyType !== "any" && rule.assemblyType !== answers.kind) continue;
    const matched = conditionMatches(answers, rule.condition);
    const level = matched ? rule.level : rule.elseLevel;
    if (!level) continue;
    const autoComplete = rule.completeWhen ? conditionMatches(answers, rule.completeWhen) : false;
    const evidence = evidenceStatus(rule);
    out.push({
      rule,
      level,
      evidence,
      freshness: freshnessOf(rule, level, evidence),
      restrictedBy: restrictionsBearingOn(rule, overlays),
      autoComplete,
      done: autoComplete || doneRuleIds.has(rule.id),
      deadline: computeDeadline(rule.deadline, answers.date),
    });
  }
  return out.sort((a, b) => a.rule.sort - b.rule.sort || a.rule.title.localeCompare(b.rule.title));
}

/** Informational heads-ups (requirementType "warning"): shown to the user, never a task and never scored. */
export const isWarning = (i: EvaluatedItem) => i.rule.requirementType === "warning";

/** Items that need doing (everything except NOT_REQUIRED / UNKNOWN / warnings). */
export const isActionable = (i: EvaluatedItem) => !isWarning(i) && (i.level === "REQUIRED" || i.level === "LIKELY_REQUIRED" || i.level === "RECOMMENDED");
