import Link from "next/link";
import { StatusChip } from "@/components/admin-ui";
import { evidenceStatus } from "@/lib/engine/evaluate";
import { RULE_STATUSES } from "@/lib/engine/types";
import { listJurisdictions, listRulesAdmin } from "@/lib/store";

export default async function Rules({ searchParams }: { searchParams: Promise<{ j?: string; s?: string }> }) {
  const { j, s } = await searchParams;
  const js = await listJurisdictions(true);
  const rules = await listRulesAdmin({ jurisdictionId: j || undefined, status: s || undefined });
  const name = new Map(js.map((x) => [x.id, x.name]));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="heading text-3xl">Rules</h1><Link href="/admin/rules/new" className="btn btn-sm">Add rule</Link></div>
      <form className="mt-4 flex flex-wrap gap-2">
        <select name="j" defaultValue={j ?? ""} aria-label="Jurisdiction" className="field !min-h-11 max-w-xs"><option value="">All jurisdictions</option>{js.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.level})</option>)}</select>
        <select name="s" defaultValue={s ?? ""} aria-label="Status" className="field !min-h-11 max-w-xs"><option value="">Any status</option>{RULE_STATUSES.map((x) => <option key={x}>{x}</option>)}</select>
        <button className="btn btn-sm">Filter</button>
      </form>
      <table className="mt-6 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["Family", "Ver", "Rule", "Where", "Status", "Effective", "Evidence", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{rules.map((r) => (
          <tr key={r.id} className="border-t border-hair">
            <td className="p-2 font-mono text-xs">{r.ruleFamilyId}</td><td className="p-2">v{r.version}</td><td className="p-2 font-semibold">{r.title}</td><td className="p-2">{name.get(r.jurisdictionId)}</td>
            <td className="p-2"><StatusChip status={r.status} /></td><td className="p-2">{r.effectiveFrom ?? "—"} → {r.effectiveUntil ?? "open"}</td>
            <td className="p-2">{evidenceStatus(r) === "verified" ? "Verified" : "Needs verification"}</td>
            <td className="p-2"><Link className="underline" href={`/admin/rules/${r.id}`}>Open</Link></td>
          </tr>))}</tbody></table>
    </>
  );
}
