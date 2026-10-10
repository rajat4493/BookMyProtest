import { activateRestrictionAction, parseOrderAction, reviewCandidateAction, saveRestrictionAction } from "@/app/actions";
import { Field, Flash } from "@/components/admin-ui";
import { listCandidates, listRestrictions, listSources } from "@/lib/knowledge";
import { listJurisdictions } from "@/lib/store";

export default async function Restrictions({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; parsed?: string }> }) {
  const sp = await searchParams;
  const [rs, js, sources, candidates] = await Promise.all([listRestrictions(), listJurisdictions(), listSources(), listCandidates("PENDING")]);
  const feeds = sources.filter((x) => x.parser);
  const jn = new Map(js.map((j) => [j.id, j.name]));
  return (
    <>
      <h1 className="heading text-3xl">Temporary restrictions</h1>
      <p className="mt-2 max-w-2xl text-mute">Time-limited orders that overlay the standing rules (base law → local rule → venue rule → temporary restriction). Active restrictions need a source. They are shown to users as a warning and mark affected requirements; they never silently rewrite a rule.</p>
      <Flash sp={sp} />
      <h2 className="heading mt-8 text-xl">Parsed orders awaiting review ({candidates.length})</h2>
      <p className="mt-1 max-w-2xl text-sm text-mute">The parser only suggests. Each field shows the text it was read from; anything it could not find is blank and must be entered by a person. Accepting creates a <strong>draft</strong> restriction, never an active one.</p>
      {sp.parsed && <p role="status" className="panel mt-3 p-3 text-sm">{sp.parsed} candidate(s) created from the pasted text.</p>}
      <ul className="mt-3 space-y-4">
        {candidates.length === 0 && <li className="panel p-4 text-mute">No parsed orders waiting.</li>}
        {candidates.map((c) => {
          const p = c.parsed; const f = (x: { value: unknown }) => (x.value == null ? "" : String(x.value));
          return (
            <li key={c.id} className="card p-4">
              <p className="label text-mute">{c.sourceTitle} · {c.createdAt.slice(0, 16).replace("T", " ")} · {p.completeness}</p>
              <p className="mt-1 text-sm">{p.summary}</p>
              {p.missing.length > 0 && <p className="mt-1 text-sm font-semibold">Not found in the text: {p.missing.join(", ")}</p>}
              <details className="mt-2"><summary className="cursor-pointer text-sm underline">Original text</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap bg-paper-2 p-3 text-xs">{c.rawText}</pre></details>
              <form action={reviewCandidateAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={c.id} />
                <Field label="Title"><input name="title" required defaultValue={p.orderNumber.value ? `Order ${p.orderNumber.value}` : "Order from feed"} className="field !min-h-11" /></Field>
                <label>Jurisdiction<select name="jurisdictionId" className="field !min-h-11">{js.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.level})</option>)}</select></label>
                <Field label="Issuing authority"><input name="issuingAuthority" defaultValue={f(p.issuingAuthority)} className="field !min-h-11" /></Field>
                <Field label="Order reference"><input name="orderReference" defaultValue={f(p.orderNumber)} className="field !min-h-11" /></Field>
                <Field label="Order date"><input name="orderDate" type="date" defaultValue={f(p.orderDate)} className="field !min-h-11" /></Field>
                <Field label="Legal basis"><input name="legalBasis" defaultValue={f(p.legalBasis)} className="field !min-h-11" /></Field>
                <Field label="Geographic scope"><input name="geographicScope" defaultValue={f(p.geographicScope)} className="field !min-h-11" /></Field>
                <Field label="Affected activities"><input name="affectedActivities" defaultValue={(p.activities.value ?? []).join(", ")} className="field !min-h-11" /></Field>
                <Field label="Starts (required)"><input name="startsAt" type="datetime-local" required defaultValue={p.effectiveFrom.value ? `${p.effectiveFrom.value}T00:00` : ""} className="field !min-h-11" /></Field>
                <Field label="Ends (required)"><input name="endsAt" type="datetime-local" required defaultValue={p.effectiveTo.value ? `${p.effectiveTo.value}T23:59` : ""} className="field !min-h-11" /></Field>
                <label>Effect<select name="effect" defaultValue={p.effect.value ?? "RESTRICTED"} className="field !min-h-11">{["PROHIBITED", "RESTRICTED", "CONDITIONAL"].map((e) => <option key={e}>{e}</option>)}</select></label>
                <Field label="Plain explanation"><input name="plainExplanation" className="field !min-h-11" /></Field>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button name="op" value="accept" className="btn">Accept as draft restriction</button>
                  <button name="op" value="reject" formNoValidate className="btn btn-secondary">Reject</button>
                </div>
              </form>
            </li>
          );
        })}
      </ul>
      <h2 className="heading mt-8 text-xl">Parse an order manually</h2>
      <form action={parseOrderAction} className="mt-3 grid max-w-3xl gap-3">
        <label>Feed source<select name="sourceId" className="field !min-h-11">{(feeds.length ? feeds : sources).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        <label>Order text<textarea name="text" rows={6} required className="field" /></label>
        <button className="btn w-fit">Parse for review</button>
      </form>
      <table className="mt-6 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["Restriction", "Where", "From → to", "Affects", "Effect", "Status", "Action"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>
          {rs.length === 0 && <tr><td colSpan={7} className="p-4 text-mute">No temporary restrictions recorded.</td></tr>}
          {rs.map((r) => <tr key={r.id} className="border-t border-hair"><td className="p-2 font-semibold">{r.title}</td><td className="p-2">{jn.get(r.jurisdictionId)}{r.geographicScope && ` · ${r.geographicScope}`}</td><td className="p-2">{r.startsAt.slice(0, 16).replace("T", " ")} → {r.endsAt.slice(0, 16).replace("T", " ")}</td><td className="p-2">{r.affectedActivities.join(", ")}</td><td className="p-2">{r.effect}</td><td className="p-2">{r.status}{r.issuingAuthority && <span className="block text-xs text-mute">{r.issuingAuthority}{r.orderDate && ` · ${r.orderDate}`}{r.orderReference && ` · ${r.orderReference}`}</span>}</td><td className="p-2">{r.status === "DRAFT" && <form action={activateRestrictionAction} className="flex gap-1"><input type="hidden" name="id" value={r.id} /><select name="sourceId" defaultValue={r.sourceId ?? ""} aria-label="Source" className="field !min-h-9 !w-40"><option value="">— source —</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.title.slice(0, 40)}</option>)}</select><button className="btn btn-secondary !min-h-9">Activate</button></form>}</td></tr>)}
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
        <Field label="Issuing authority"><input name="issuingAuthority" className="field !min-h-11" /></Field>
        <Field label="Order reference"><input name="orderReference" className="field !min-h-11" /></Field>
        <Field label="Order date"><input name="orderDate" type="date" className="field !min-h-11" /></Field>
        <button className="btn w-fit">Save restriction</button>
      </form>
    </>
  );
}
