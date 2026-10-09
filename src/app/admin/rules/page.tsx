import Link from "next/link";
import { evidenceStatus } from "@/lib/engine/evaluate";
import { listJurisdictions, listRulesAdmin } from "@/lib/store";

export default async function Rules({ searchParams }: { searchParams: Promise<{ j?: string }> }) {
  const { j } = await searchParams;
  const js = (await listJurisdictions());
  const rules = await listRulesAdmin(j || undefined, true);
  const name = new Map(js.map((x) => [x.id, x.name]));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="display text-5xl">Rules</h1><Link href="/admin/rules/new" className="btn btn-sm">Add rule</Link></div>
      <form className="mt-4 flex gap-2"><select name="j" defaultValue={j ?? ""} className="field !min-h-11 max-w-xs"><option value="">All jurisdictions</option>{js.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.level})</option>)}</select><button className="btn btn-sm">Filter</button></form>
      <table className="mt-6 w-full border-2 border-ink text-left text-sm"><thead className="bg-paper-2"><tr>{["Rule", "Where", "Category", "Level", "Severity", "Evidence", "Verified", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{rules.map((r) => (
          <tr key={r.id} className={`border-t border-ink ${r.sort < 0 ? "" : ""}`}>
            <td className="p-2 font-semibold">{r.title}</td><td className="p-2">{name.get(r.jurisdictionId)}</td><td className="p-2">{r.category}</td><td className="p-2">{r.level}</td><td className="p-2">{r.severity}</td>
            <td className="p-2">{evidenceStatus(r) === "verified" ? "Verified" : "Needs verification"}</td><td className="p-2">{r.lastVerifiedAt ?? "—"}</td>
            <td className="p-2"><Link className="underline" href={`/admin/rules/${r.id}`}>Edit</Link></td>
          </tr>))}</tbody></table>
    </>
  );
}
