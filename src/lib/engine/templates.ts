import type { DocBlock } from "../documents";

export interface DocTemplate {
  id: string;
  templateKey: string;
  name: string;
  jurisdictionId: string | null; // null = global default
  authorityId: string | null;
  authorityName?: string | null;
  version: number;
  content: string;
  disclaimer: string;
  active: boolean;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  sourceId: string | null;
}

/** Most specific jurisdiction wins (global default is least specific); within it, the highest active, in-window version. */
export function selectTemplate(templates: DocTemplate[], key: string, chain: string[], asOf: string): DocTemplate | null {
  const ok = templates.filter(
    (t) => t.templateKey === key && t.active && (!t.effectiveFrom || t.effectiveFrom <= asOf) && (!t.effectiveUntil || asOf < t.effectiveUntil) &&
      (t.jurisdictionId === null || chain.includes(t.jurisdictionId)),
  );
  ok.sort((a, b) => (b.jurisdictionId ? chain.indexOf(b.jurisdictionId) : -1) - (a.jurisdictionId ? chain.indexOf(a.jurisdictionId) : -1) || b.version - a.version);
  return ok[0] ?? null;
}

export type Vars = Record<string, string>;

const sub = (line: string, vars: Vars) =>
  line.replace(/\{\{\s*([a-z0-9_]+)\s*(?:\|([^}]*))?\}\}/gi, (_, name: string, dflt?: string) => (vars[name]?.trim() ? vars[name] : dflt ?? ""));

/**
 * Tiny template language (no code execution):
 *   {{var}}  {{var|default}}   variables
 *   {{#if v}}..{{/if}}  {{#unless v}}..{{/unless}}   line-level conditionals
 *   # Heading   | Label | value (dropped if value is empty)   - bullet   [[list]] (inserted by the app)   blank line = new paragraph
 */
export function renderTemplate(content: string, vars: Vars, lists: Record<string, DocBlock[]> = {}): DocBlock[] {
  const lines: string[] = [];
  const stack: boolean[] = [];
  for (const raw of content.replace(/\r\n/g, "\n").split("\n")) {
    const t = raw.trim();
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^\{\{#if\s+([a-z0-9_]+)\s*\}\}$/i))) { stack.push(!!vars[m[1]]?.trim()); continue; }
    if ((m = t.match(/^\{\{#unless\s+([a-z0-9_]+)\s*\}\}$/i))) { stack.push(!vars[m[1]]?.trim()); continue; }
    if (/^\{\{\/(if|unless)\}\}$/i.test(t)) { stack.pop(); continue; }
    if (stack.every(Boolean)) lines.push(sub(raw, vars));
  }

  const blocks: DocBlock[] = [];
  let cur: DocBlock | null = null;
  let para: string[] = [];
  let kind: "rows" | "para" | "bullets" | null = null;
  let pendingHeading: string | undefined;

  const open = (k: "rows" | "para" | "bullets") => {
    if (cur && kind === k) return;
    cur = { heading: pendingHeading };
    pendingHeading = undefined;
    kind = k;
    blocks.push(cur);
  };
  const flushPara = () => {
    if (para.length) { open("para"); (cur!.paragraphs ??= []).push(para.join("\n")); para = []; }
  };

  for (const line of lines) {
    const t = line.trim();
    if (t === "") { flushPara(); continue; }
    const list = t.match(/^\[\[([a-z0-9_]+)\]\]$/i);
    if (list) { flushPara(); blocks.push(...(lists[list[1]] ?? [])); cur = null; kind = null; continue; }
    if (t.startsWith("# ")) { flushPara(); pendingHeading = t.slice(2).trim(); cur = null; kind = null; continue; }
    const row = t.match(/^\|\s*(.*?)\s*\|\s*(.*)$/);
    if (row) { flushPara(); if (row[2].trim()) { open("rows"); (cur!.rows ??= []).push([row[1], row[2].trim()]); } continue; }
    if (t.startsWith("- ")) { flushPara(); open("bullets"); (cur!.bullets ??= []).push(t.slice(2)); continue; }
    para.push(line.trimEnd());
  }
  flushPara();
  return blocks;
}
