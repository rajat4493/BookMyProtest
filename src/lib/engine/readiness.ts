import { CATEGORIES, type Category, type EvaluatedItem, type Severity } from "./types";
import { isActionable } from "./evaluate";

const WEIGHT: Record<Severity, number> = { CRITICAL: 3, REQUIRED: 2, RECOMMENDED: 1 };

export interface CategoryScore {
  category: Category;
  done: number;
  total: number;
  /** null when nothing is configured for this category */
  pct: number | null;
}

export interface Readiness {
  pct: number;
  categories: CategoryScore[];
  blockers: EvaluatedItem[]; // incomplete CRITICAL items
  required: EvaluatedItem[]; // incomplete REQUIRED items
  recommended: EvaluatedItem[]; // incomplete RECOMMENDED items
  totalItems: number;
  doneItems: number;
}

const ratio = (items: EvaluatedItem[]) => {
  const total = items.reduce((s, i) => s + WEIGHT[i.rule.severity], 0);
  const done = items.filter((i) => i.done).reduce((s, i) => s + WEIGHT[i.rule.severity], 0);
  return total === 0 ? null : Math.round((done / total) * 100);
};

export function computeReadiness(items: EvaluatedItem[]): Readiness {
  const actionable = items.filter(isActionable);
  const categories: CategoryScore[] = CATEGORIES.map((category) => {
    const inCat = actionable.filter((i) => i.rule.category === category);
    return { category, done: inCat.filter((i) => i.done).length, total: inCat.length, pct: ratio(inCat) };
  });
  const open = actionable.filter((i) => !i.done);
  return {
    pct: ratio(actionable) ?? 0,
    categories,
    blockers: open.filter((i) => i.rule.severity === "CRITICAL"),
    required: open.filter((i) => i.rule.severity === "REQUIRED"),
    recommended: open.filter((i) => i.rule.severity === "RECOMMENDED"),
    totalItems: actionable.length,
    doneItems: actionable.length - open.length,
  };
}

/** Restrained, encouraging microcopy. Never celebratory about compliance. */
export function headline(r: Readiness): { title: string; sub: string } {
  const b = r.blockers.length;
  const plural = (n: number) => (n === 1 ? "blocker" : "blockers");
  if (r.totalItems === 0) return { title: "Nothing configured yet.", sub: "We have no requirements for this plan. Check with the relevant authority." };
  if (r.pct >= 100) return { title: "Checklist complete.", sub: "Ticking items is not permission. Confirm your permission and the latest orders with the authority before the day." };
  if (b === 0) return { title: r.pct >= 75 ? "Nearly there." : "No blockers. Keep going.", sub: `${r.required.length + r.recommended.length} items left, none critical.` };
  if (r.pct >= 70) return { title: "You're close.", sub: `${b} critical ${plural(b)} still ${b === 1 ? "needs" : "need"} attention.` };
  if (r.pct >= 40) return { title: "Your plan is taking shape.", sub: `${b} ${plural(b)} remain.` };
  return { title: "You've got work to do.", sub: `Paperwork first. Megaphones later. ${b} ${plural(b)} to clear.` };
}
