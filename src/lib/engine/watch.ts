import { createHash } from "node:crypto";

export type Materiality = "COSMETIC" | "UNKNOWN" | "POTENTIALLY_MATERIAL" | "MATERIAL";

/** Collapse whitespace so reflowed text does not look like a change. */
export const normalizeText = (t: string) => t.replace(/\s+/g, " ").trim();
export const hashText = (t: string) => createHash("sha256").update(normalizeText(t)).digest("hex");

const lines = (t: string) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export function diffLines(prev: string, curr: string): { added: string[]; removed: string[] } {
  const a = new Set(lines(prev));
  const b = new Set(lines(curr));
  return { added: [...b].filter((l) => !a.has(l)), removed: [...a].filter((l) => !b.has(l)) };
}

/**
 * A SUGGESTION about a detected change. It is plain data: it has no way to alter a rule.
 * Only a signed-in human can publish (see knowledge.publishRule). Replace `heuristicAssistant`
 * with an LLM-backed implementation behind the same type when ready; the guardrails do not change.
 */
export interface ChangeSuggestion {
  summary: string;
  materiality: Materiality;
  priority: "LOW" | "NORMAL" | "HIGH";
  origin: "SYSTEM" | "AI";
  diffExcerpt: string;
}
export type ChangeAssistant = (input: { sourceTitle: string; previousText: string; currentText: string }) => Promise<ChangeSuggestion> | ChangeSuggestion;

const MATERIAL_WORDS = /\b(permission|permit|licen[cs]e|required|must|prohibit|notice|days?|hours?|fee|deadline|loudspeaker|assembly|procession|section|order|ban)\b|\d/i;

export const heuristicAssistant: ChangeAssistant = ({ sourceTitle, previousText, currentText }) => {
  const { added, removed } = diffLines(previousText, currentText);
  const touched = [...added, ...removed];
  const excerpt = [...removed.slice(0, 5).map((l) => `- ${l}`), ...added.slice(0, 5).map((l) => `+ ${l}`)].join("\n").slice(0, 2000);
  if (touched.length === 0) return { summary: `Text of "${sourceTitle}" changed only in formatting or line order.`, materiality: "COSMETIC", priority: "LOW", origin: "SYSTEM", diffExcerpt: "" };
  const material = touched.some((l) => MATERIAL_WORDS.test(l));
  return {
    summary: `"${sourceTitle}": ${added.length} line(s) added, ${removed.length} removed${material ? "; changed lines mention requirements, numbers or deadlines" : ""}. Automatic summary, not a legal finding.`,
    materiality: material ? "POTENTIALLY_MATERIAL" : "UNKNOWN",
    priority: material ? "HIGH" : "NORMAL",
    origin: "SYSTEM",
    diffExcerpt: excerpt,
  };
};
