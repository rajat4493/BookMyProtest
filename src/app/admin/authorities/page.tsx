import { saveAuthorityAction } from "@/app/actions";
import { Field, Flash } from "@/components/admin-ui";
import { getAuthority, listAuthorities } from "@/lib/knowledge";
import { listJurisdictions } from "@/lib/store";

export default async function Authorities({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const [list, js] = await Promise.all([listAuthorities(), listJurisdictions()]);
  const jn = new Map(js.map((j) => [j.id, j.name]));
  const edit = sp.edit ? await getAuthority(sp.edit) : null;
  return (
    <>
      <h1 className="heading text-3xl">Authorities</h1>
      <p className="mt-2 text-mute">Separate records. Rules point to an authority by ID; contact and submission details live here once.</p>
      <Flash sp={sp} />
      <table className="mt-6 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["Authority", "Type", "Jurisdiction", "Submission", "Verified", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={6} className="p-4 text-mute">No authorities yet. Add the police, traffic, municipal or venue authority below.</td></tr>}
          {list.map((a) => <tr key={a.id} className="border-t border-hair"><td className="p-2 font-semibold">{a.name}{!a.active && <span className="chip chip-note ml-2">inactive</span>}</td><td className="p-2">{a.authorityType}</td><td className="p-2">{jn.get(a.jurisdictionId)}</td><td className="p-2">{a.submissionMethod}</td><td className="p-2">{a.lastVerifiedAt ?? "—"}</td><td className="p-2"><a className="underline" href={`/admin/authorities?edit=${a.id}`}>Edit</a></td></tr>)}
        </tbody></table>
      <h2 className="heading mt-10 text-xl">{edit ? "Edit authority" : "Add authority"}</h2>
      <form action={saveAuthorityAction} key={edit?.id ?? "new"} className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" defaultValue={edit?.id ?? ""} />
        <Field label="Name"><input name="name" required defaultValue={edit?.name} className="field !min-h-11" /></Field>
        <label>Jurisdiction<select name="jurisdictionId" defaultValue={edit?.jurisdictionId} className="field !min-h-11">{js.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.level})</option>)}</select></label>
        <label>Type<select name="authorityType" defaultValue={edit?.authorityType ?? "POLICE"} className="field !min-h-11">{["POLICE", "TRAFFIC", "MUNICIPAL", "VENUE", "NOISE_CONTROL", "OTHER"].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Submission method<select name="submissionMethod" defaultValue={edit?.submissionMethod ?? "UNKNOWN"} className="field !min-h-11">{["ONLINE", "EMAIL", "IN_PERSON", "POST", "UNKNOWN"].map((t) => <option key={t}>{t}</option>)}</select></label>
        <Field label="Website"><input name="website" type="url" defaultValue={edit?.website ?? ""} className="field !min-h-11" /></Field>
        <Field label="Submission URL"><input name="submissionUrl" type="url" defaultValue={edit?.submissionUrl ?? ""} className="field !min-h-11" /></Field>
        <Field label="Contact email"><input name="contactEmail" defaultValue={edit?.contactEmail} className="field !min-h-11" /></Field>
        <Field label="Contact phone"><input name="contactPhone" defaultValue={edit?.contactPhone} className="field !min-h-11" /></Field>
        <Field label="Office address"><input name="officeAddress" defaultValue={edit?.officeAddress} className="field !min-h-11" /></Field>
        <Field label="Last verified"><input name="lastVerifiedAt" type="date" defaultValue={edit?.lastVerifiedAt ?? ""} className="field !min-h-11" /></Field>
        <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={edit?.active ?? true} /> Active</label>
        <Field label="Notes"><input name="notes" defaultValue={edit?.notes} className="field !min-h-11" /></Field>
        <button className="btn w-fit">Save authority</button>
      </form>
    </>
  );
}
