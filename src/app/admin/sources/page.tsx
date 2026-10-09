import Link from "next/link";
import { Flash } from "@/components/admin-ui";
import { listSources } from "@/lib/knowledge";

export default async function Sources({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const sources = await listSources();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="heading text-3xl">Sources</h1><Link href="/admin/sources/new" className="btn btn-sm">Add source</Link></div>
      <p className="mt-2 text-mute">The evidence registry. Rules cite sources; monitored sources are checked for changes and flagged for human review.</p>
      <Flash sp={sp} />
      <table className="mt-6 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["Source", "Type", "Monitoring", "Last checked", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>
          {sources.length === 0 && <tr><td colSpan={5} className="p-4 text-mute">No sources yet. Add the first official source, then attach it to a rule.</td></tr>}
          {sources.map((s) => (
            <tr key={s.id} className="border-t border-hair"><td className="p-2 font-semibold">{s.title}{!s.active && <span className="chip chip-note ml-2">inactive</span>}</td><td className="p-2">{s.sourceType}</td>
              <td className="p-2">{s.monitoringEnabled ? s.monitoringFrequency : "off"}</td><td className="p-2">{s.lastCheckedAt ? s.lastCheckedAt.slice(0, 16).replace("T", " ") : "never"}</td>
              <td className="p-2"><Link className="underline" href={`/admin/sources/${s.id}`}>Open</Link></td></tr>))}
        </tbody></table>
    </>
  );
}
