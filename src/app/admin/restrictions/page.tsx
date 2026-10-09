import { saveRestrictionAction } from "@/app/actions";
import { Field, Flash } from "@/components/admin-ui";
import { listRestrictions, listSources } from "@/lib/knowledge";
import { listJurisdictions } from "@/lib/store";

export default async function Restrictions({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const [rs, js, sources] = await Promise.all([listRestrictions(), listJurisdictions(), listSources()]);
  const jn = new Map(js.map((j) => [j.id, j.name]));
  return (
    <>
      <h1 className="heading text-3xl">Temporary restrictions</h1>
      <p className="mt-2 max-w-2xl text-mute">Time-limited orders that overlay the standing rules (base law → local rule → venue rule → temporary restriction). Active restrictions need a source. They are shown to users as a warning and mark affected requirements; they never silently rewrite a rule.</p>
      <Flash sp={sp} />
      <table className="mt-6 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["Restriction", "Where", "From → to", "Affects", "Effect", "Status"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>
          {rs.length === 0 && <tr><td colSpan={6} className="p-4 text-mute">No temporary restrictions recorded.</td></tr>}
          {rs.map((r) => <tr key={r.id} className="border-t border-hair"><td className="p-2 font-semibold">{r.title}</td><td className="p-2">{jn.get(r.jurisdictionId)}{r.geographicScope && ` · ${r.geographicScope}`}</td><td className="p-2">{r.startsAt.slice(0, 16).replace("T", " ")} → {r.endsAt.slice(0, 16).replace("T", " ")}</td><td className="p-2">{r.affectedActivities.join(", ")}</td><td className="p-2">{r.effect}</td><td className="p-2">{r.status}</td></tr>)}
        </tbody></table>
      <h2 className="heading mt-10 text-xl">Add restriction</h2>
      <form action={saveRestrictionAction} className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-2">
        <Field label="Title"><input name="title" required className="field !min-h-11" /></Field>
        <label>Jurisdiction<select name="jurisdictionId" className="field !min-h-11">{js.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.level})</option>)}</select></label>
        <Field label="Geographic scope (free text)"><input name="geographicScope" className="field !min-h-11" /></Field>
        <Field label="Legal basis"><input name="legalBasis" className="field !min-h-11" /></Field>
        <Field label="Starts"><input name="startsAt" type="datetime-local" required className="field !min-h-11" /></Field>
        <Field label="Ends"><input name="endsAt" type="datetime-local" required className="field !min-h-11" /></Field>
        <Field label="Affected activities (comma list: ASSEMBLY, MARCH, SOUND, STAGE, VEHICLES, FOOD, ALL)"><input name="affectedActivities" defaultValue="ASSEMBLY" className="field !min-h-11" /></Field>
        <label>Effect<select name="effect" className="field !min-h-11">{["PROHIBITED", "RESTRICTED", "CONDITIONAL"].map((e) => <option key={e}>{e}</option>)}</select></label>
        <label>Source<select name="sourceId" className="field !min-h-11"><option value="">—</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        <label>Status<select name="status" className="field !min-h-11">{["DRAFT", "ACTIVE", "EXPIRED", "ARCHIVED"].map((e) => <option key={e}>{e}</option>)}</select></label>
        <Field label="Plain explanation"><input name="plainExplanation" className="field !min-h-11" /></Field>
        <button className="btn w-fit">Save restriction</button>
      </form>
    </>
  );
}
