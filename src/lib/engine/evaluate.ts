import type { Answers, Clause, Condition, EvaluatedItem, EvidenceStatus, Rule } from "./types";

/** Reads a field the way rules see it. */
export function fieldValue(a: Answers, field: Clause["field"]): string | number | boolean {
  if (field === "march") return a.kind === "march";
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
 * Non-negotiable: a rule only counts as verified when it has a real source URL, a
 * verification date, is not flagged for review and is not low confidence.
 * Everything else must be surfaced as "Needs verification".
 */
export function evidenceStatus(rule: Rule): EvidenceStatus {
  const hasSource = rule.sources.some((s) => !!s.url && s.url.trim() !== "");
  if (hasSource && rule.lastVerifiedAt && !rule.needsReview && rule.confidence !== "low") return "verified";
  return "needs_verification";
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Evaluates all rules against the answers. Rules that do not apply (and have no else_level) are dropped. */
export function evaluate(rules: Rule[], answers: Answers, doneRuleIds: ReadonlySet<string> = new Set()): EvaluatedItem[] {
  const out: EvaluatedItem[] = [];
  for (const rule of rules) {
    if (rule.assemblyType !== "any" && rule.assemblyType !== answers.kind) continue;
    const matched = conditionMatches(answers, rule.condition);
    const level = matched ? rule.level : rule.elseLevel;
    if (!level) continue;
    const autoComplete = rule.completeWhen ? conditionMatches(answers, rule.completeWhen) : false;
    out.push({
      rule,
      level,
      evidence: evidenceStatus(rule),
      autoComplete,
      done: autoComplete || doneRuleIds.has(rule.id),
      deadline: rule.deadlineDaysBefore != null && answers.date ? addDays(answers.date, -rule.deadlineDaysBefore) : null,
    });
  }
  return out.sort((a, b) => a.rule.sort - b.rule.sort || a.rule.title.localeCompare(b.rule.title));
}

/** Items that need doing (everything except NOT_REQUIRED / UNKNOWN). */
export const isActionable = (i: EvaluatedItem) => i.level === "REQUIRED" || i.level === "LIKELY_REQUIRED" || i.level === "RECOMMENDED";
