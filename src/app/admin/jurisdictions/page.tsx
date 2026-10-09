import { addJurisdictionAction, toggleSupportedAction } from "@/app/actions";
import { listJurisdictions } from "@/lib/store";
import { adminWaitlist } from "@/lib/store";

export default async function Jurisdictions() {
  const js = await listJurisdictions();
  const byId = new Map(js.map((j) => [j.id, j]));
  const path = (j: (typeof js)[number]): string => (j.parentId ? `${path(byId.get(j.parentId)!)} › ` : "") + j.name;
  const wl = await adminWaitlist();
  return (
    <>
      <h1 className="heading text-3xl">Jurisdictions</h1>
      <p className="mt-2 text-mute">Add a city here and write its rules under Rules. No code change needed. Only cities marked live appear in the planner.</p>
      <table className="mt-6 w-full border-2 border-ink text-left"><thead className="bg-paper-2"><tr><th className="p-2">Jurisdiction</th><th className="p-2">Level</th><th className="p-2">Live</th><th className="p-2" /></tr></thead>
        <tbody>{js.map((j) => (
          <tr key={j.id} className="border-t border-ink"><td className="p-2">{path(j)}{j.isDevSeed && <span className="chip chip-note ml-2">dev seed</span>}</td><td className="p-2">{j.level}</td><td className="p-2">{j.level === "city" ? (j.supported ? "Yes" : "No") : "—"}</td>
            <td className="p-2">{j.level === "city" && <form action={toggleSupportedAction}><input type="hidden" name="id" value={j.id} /><input type="hidden" name="supported" value={String(!j.supported)} /><button className="underline">{j.supported ? "Take offline" : "Go live"}</button></form>}</td></tr>))}</tbody></table>
      <h2 className="heading mt-10 text-xl">Add jurisdiction</h2>
      <form action={addJurisdictionAction} className="mt-3 grid max-w-xl gap-3">
        <label>Level<select name="level" className="field"><option value="country">Country</option><option value="state">State / region</option><option value="city">City</option></select></label>
        <label>Parent (required for state and city)<select name="parentId" className="field"><option value="">—</option>{js.filter((j) => j.level !== "city").map((j) => <option key={j.id} value={j.id}>{path(j)}</option>)}</select></label>
        <label>Name<input name="name" required className="field" /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="supported" /> Live in planner (cities only; add rules first)</label>
        <button className="btn w-fit">Add</button>
      </form>
      <h2 className="heading mt-10 text-xl">Waitlist demand</h2>
      <table className="mt-3 w-full max-w-xl border-2 border-ink text-left"><tbody>{wl.map((w: any, i) => <tr key={i} className="border-t border-ink first:border-0"><td className="p-2">{[w.city, w.state, w.country].filter(Boolean).join(", ")}</td><td className="p-2">{w.signups}</td></tr>)}</tbody></table>
    </>
  );
}
