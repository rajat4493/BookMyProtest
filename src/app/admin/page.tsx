import { ANALYTICS_EVENTS, funnel } from "@/lib/store";
import { query } from "@/lib/db";

export default async function Admin() {
  const f = await funnel();
  const get = (n: string) => f.find((x) => x.name === n) ?? { people: 0, total: 0 };
  const [{ rules, unverified }] = await query<{ rules: number; unverified: number }>(
    `SELECT count(*)::int AS rules, count(*) FILTER (WHERE needs_review OR last_verified_at IS NULL OR NOT EXISTS (SELECT 1 FROM rule_sources s WHERE s.rule_id=rules.id AND s.url IS NOT NULL))::int AS unverified FROM rules WHERE archived_at IS NULL`);
  return (
    <>
      <h1 className="display text-5xl">Overview</h1>
      <p className="mt-4"><b>{unverified}</b> of {rules} active rules are unverified (no source URL, no verification date, or flagged for review). Users see these as &ldquo;Needs verification&rdquo;.</p>
      <h2 className="display-wide mt-8 text-2xl">Validation funnel</h2>
      <table className="mt-3 w-full max-w-xl border-2 border-ink text-left"><thead className="bg-paper-2"><tr><th className="p-2">Event</th><th className="p-2">People</th><th className="p-2">Total</th></tr></thead>
        <tbody>{ANALYTICS_EVENTS.map((n) => <tr key={n} className="border-t border-ink"><td className="p-2 font-mono">{n}</td><td className="p-2">{get(n).people}</td><td className="p-2">{get(n).total}</td></tr>)}</tbody></table>
      <p className="mt-3 text-sm text-mute">Visitor → start_plan → complete_questionnaire → generate_document → request_vendor_quote. People = distinct anonymous browsers.</p>
    </>
  );
}
