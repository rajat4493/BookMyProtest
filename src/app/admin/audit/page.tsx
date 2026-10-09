import { listAudit } from "@/lib/store";

export default async function Audit() {
  const rows: any[] = await listAudit(200);
  return (
    <>
      <h1 className="heading text-3xl">Audit log</h1>
      <p className="mt-2 text-mute">Every change to jurisdictions, authorities, sources, rules, reviews and templates: who, what, before, after, why.</p>
      <table className="mt-6 w-full border border-hair text-left text-xs"><thead className="bg-paper-2"><tr>{["When", "Who", "Action", "Entity", "Before → after", "Reason"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} className="border-t border-hair align-top"><td className="p-2 whitespace-nowrap">{new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")}</td><td className="p-2">{r.actor_email ?? "system"}</td><td className="p-2 font-mono">{r.action}</td>
            <td className="p-2">{r.entity} <span className="font-mono">{String(r.entity_id).slice(0, 8)}</span></td><td className="p-2 font-mono break-all">{r.before ? JSON.stringify(r.before).slice(0, 80) : "—"} → {r.after ? JSON.stringify(r.after).slice(0, 120) : "—"}</td><td className="p-2">{r.reason}</td></tr>))}</tbody></table>
    </>
  );
}
