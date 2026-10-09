import { ANALYTICS_EVENTS, funnel } from "@/lib/store";
import { query } from "@/lib/db";

export default async function Admin() {
  const f = await funnel();
  const get = (n: string) => f.find((x) => x.name === n) ?? { people: 0, total: 0 };
  const [{ rules, unverified, pending, changed }] = await query<{ rules: number; unverified: number; pending: number; changed: number }>(
    `SELECT
       (SELECT count(*)::int FROM rules WHERE rule_status IN ('ACTIVE','CHANGE_DETECTED')) AS rules,
       (SELECT count(*)::int FROM rules r WHERE rule_status IN ('ACTIVE','CHANGE_DETECTED') AND (needs_review OR last_verified_at IS NULL OR NOT EXISTS (
          SELECT 1 FROM rule_sources rs JOIN sources s ON s.id=rs.source_id WHERE rs.rule_id=r.id AND s.active AND s.canonical_url IS NOT NULL AND s.source_type<>'SECONDARY_LEAD' AND rs.evidence_strength<>'LEAD'))) AS unverified,
       (SELECT count(*)::int FROM change_events WHERE review_status='PENDING') AS pending,
       (SELECT count(*)::int FROM rules WHERE rule_status='CHANGE_DETECTED') AS changed`);
  return (
    <>
      <h1 className="heading text-3xl">Overview</h1>
      <p className="mt-4"><b>{unverified}</b> of {rules} live rules are unverified (no official source, no verification date, or flagged for review). Users see these as &ldquo;Needs verification&rdquo;.</p>
      <p className="mt-2"><b>{pending}</b> source change(s) awaiting review · <b>{changed}</b> rule(s) flagged CHANGE_DETECTED. <a className="underline" href="/admin/review">Open review queue</a></p>
      <h2 className="heading mt-8 text-xl">Validation funnel</h2>
      <table className="mt-3 w-full max-w-xl border-2 border-ink text-left"><thead className="bg-paper-2"><tr><th className="p-2">Event</th><th className="p-2">People</th><th className="p-2">Total</th></tr></thead>
        <tbody>{ANALYTICS_EVENTS.map((n) => <tr key={n} className="border-t border-ink"><td className="p-2 font-mono">{n}</td><td className="p-2">{get(n).people}</td><td className="p-2">{get(n).total}</td></tr>)}</tbody></table>
      <p className="mt-3 text-sm text-mute">Visitor → start_plan → complete_questionnaire → generate_document → request_vendor_quote. People = distinct anonymous browsers.</p>
    </>
  );
}
