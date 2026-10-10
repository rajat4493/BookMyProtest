import { recordOfficialCheckAction, saveVenueSignalAction, setSchedulingModeAction } from "@/app/actions";
import { Field, Flash } from "@/components/admin-ui";
import { EVENT_STATUSES, SCHEDULING_MODES, SIGNAL_LABEL, SIGNAL_TYPES } from "@/lib/engine/availability";
import { listSources } from "@/lib/knowledge";
import { listOfficialChecks, listVenueSignals, listVenues } from "@/lib/venue-signals";

const MODE_HELP: Record<string, string> = {
  EXCLUSIVE: "One event holds the venue at a time.", SHARED_CAPACITY: "Several gatherings can share it (up to a capacity). Other events inform, never block.",
  AUTHORITY_MANAGED: "An authority allots it and a second authority (police) permits events: both are checked.", UNKNOWN: "Arrangement not known.",
};

export default async function Venues({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const [venues, signals, checks, sources] = await Promise.all([listVenues(), listVenueSignals(), listOfficialChecks(), listSources()]);
  const official = sources.filter((s) => s.sourceType !== "SECONDARY_LEAD" && s.lifecycle === "CURRENT");
  return (
    <>
      <h1 className="heading text-3xl">Venues and date signals</h1>
      <p className="mt-2 max-w-2xl text-mute">What is known about a venue on a date. A signal is evidence of an event, never proof that a date is free: the planner never says &ldquo;available&rdquo;. Official signals need a current official source. Social media and news can only be low-confidence public reports.</p>
      <Flash sp={sp} />
      <h2 className="heading mt-8 text-xl">Scheduling mode</h2>
      <table className="mt-3 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr><th className="p-2">Venue</th><th className="p-2">Mode</th></tr></thead><tbody>
        {venues.map((v) => (
          <tr key={v.id} className="border-t border-hair"><td className="p-2 font-semibold">{v.name}</td><td className="p-2">
            <form action={setSchedulingModeAction} className="flex flex-wrap items-center gap-2"><input type="hidden" name="venueId" value={v.id} />
              <select name="mode" defaultValue={v.scheduling_mode} aria-label={`Scheduling mode for ${v.name}`} className="field !min-h-9 !w-56">{SCHEDULING_MODES.map((m) => <option key={m}>{m}</option>)}</select>
              <button className="btn btn-secondary !min-h-9">Save</button><span className="text-mute">{MODE_HELP[v.scheduling_mode]}</span></form></td></tr>))}
      </tbody></table>

      <h2 className="heading mt-10 text-xl">Record an official check</h2>
      <p className="mt-1 max-w-2xl text-sm text-mute">Records that an official calendar or register was actually looked at for a date range. Without a fresh one, that authority&rsquo;s status is &ldquo;unknown&rdquo;.</p>
      <form action={recordOfficialCheckAction} className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-2">
        <label>Venue<select name="venueId" className="field !min-h-11">{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <label>Authority<select name="authority" className="field !min-h-11"><option value="BOOKING">BOOKING (allots the ground)</option><option value="POLICE">POLICE</option></select></label>
        <label>Official source<select name="sourceId" required className="field !min-h-11">{official.map((s) => <option key={s.id} value={s.id}>{s.title.slice(0, 70)}</option>)}</select></label>
        <label>Outcome<select name="outcome" className="field !min-h-11"><option>OK</option><option>FAILED</option></select></label>
        <Field label="Covers from"><input name="from" type="date" required className="field !min-h-11" /></Field>
        <Field label="Covers to"><input name="to" type="date" required className="field !min-h-11" /></Field>
        <Field label="Notes"><input name="notes" className="field !min-h-11" /></Field>
        <button className="btn w-fit">Record check</button>
      </form>
      <table className="mt-4 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["Venue", "Authority", "Covers", "Checked", "Outcome", "Source"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {checks.length === 0 && <tr><td colSpan={6} className="p-3 text-mute">No official checks recorded: every venue&rsquo;s official status reads &ldquo;unknown&rdquo;.</td></tr>}
        {checks.map((c: any) => <tr key={c.id} className="border-t border-hair"><td className="p-2">{c.venue}</td><td className="p-2">{c.authority}</td><td className="p-2">{c.f} → {c.t}</td><td className="p-2">{new Date(c.checked_at).toISOString().slice(0, 16).replace("T", " ")}</td><td className="p-2">{c.outcome}</td><td className="p-2">{c.source}</td></tr>)}
      </tbody></table>

      <h2 className="heading mt-10 text-xl">Add a date signal</h2>
      <form action={saveVenueSignalAction} className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-2">
        <label>Venue<select name="venueId" className="field !min-h-11">{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <label>Signal type<select name="type" className="field !min-h-11">{SIGNAL_TYPES.filter((t) => !t.startsWith("BMP_")).map((t) => <option key={t} value={t}>{t} ({SIGNAL_LABEL[t]})</option>)}</select></label>
        <Field label="Date"><input name="date" type="date" required className="field !min-h-11" /></Field>
        <label>Status<select name="status" className="field !min-h-11">{EVENT_STATUSES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <Field label="Start (optional)"><input name="startTime" type="time" className="field !min-h-11" /></Field>
        <Field label="End (optional)"><input name="endTime" type="time" className="field !min-h-11" /></Field>
        <Field label="Expected attendance"><input name="attendance" inputMode="numeric" className="field !min-h-11" /></Field>
        <label>Confidence<select name="confidence" className="field !min-h-11"><option>low</option><option>medium</option><option>high</option></select></label>
        <label>Official source (required except for public reports)<select name="sourceId" className="field !min-h-11"><option value="">—</option>{official.map((s) => <option key={s.id} value={s.id}>{s.title.slice(0, 70)}</option>)}</select></label>
        <Field label="Source URL (https)"><input name="sourceUrl" className="field !min-h-11" /></Field>
        <Field label="Short label (no personal data)"><input name="label" className="field !min-h-11" /></Field>
        <button className="btn w-fit">Save signal</button>
      </form>
      <table className="mt-4 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["Venue", "Date", "Type", "Status", "Attendance", "Confidence", "Checked"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {signals.length === 0 && <tr><td colSpan={7} className="p-3 text-mute">No signals recorded.</td></tr>}
        {signals.map((s: any) => <tr key={s.id} className="border-t border-hair"><td className="p-2">{s.venue}</td><td className="p-2">{s.d}</td><td className="p-2">{s.signal_type}</td><td className="p-2">{s.event_status}</td><td className="p-2">{s.expected_attendance ?? "—"}</td><td className="p-2">{s.confidence}</td><td className="p-2">{new Date(s.checked_at).toISOString().slice(0, 16).replace("T", " ")}</td></tr>)}
      </tbody></table>
    </>
  );
}
