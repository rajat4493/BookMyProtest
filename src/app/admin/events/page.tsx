import { adminEvents } from "@/lib/store";

export default async function Events() {
  const rows: any[] = await adminEvents();
  return (
    <>
      <h1 className="display text-5xl">Events</h1>
      <table className="mt-6 w-full border-2 border-ink text-left text-sm"><thead className="bg-paper-2"><tr>{["Event", "City", "Date", "People", "Saved", "Docs", "Vendor reqs", "Created"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-ink"><td className="p-2">{r.name}</td><td className="p-2">{r.city}</td><td className="p-2">{r.date}</td><td className="p-2">{r.attendance}</td><td className="p-2">{r.saved ? "Yes" : "No"}</td><td className="p-2">{r.documents}</td><td className="p-2">{r.vendor_requests}</td><td className="p-2">{new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")}</td></tr>)}</tbody></table>
    </>
  );
}
