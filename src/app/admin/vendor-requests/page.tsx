import { updateVendorRequestAction } from "@/app/actions";
import { listVendorRequests } from "@/lib/store";

export default async function VendorRequests() {
  const rows = await listVendorRequests();
  return (
    <>
      <h1 className="display text-5xl">Vendor requests</h1>
      <p className="mt-2 text-mute">Match vendors manually, then update the status. Contact details are visible to admins only.</p>
      <ul className="mt-6 space-y-4">
        {rows.length === 0 && <li>No requests yet.</li>}
        {rows.map((r) => (
          <li key={r.id} className="card p-4">
            <p className="display-wide text-xl">{r.categoryLabel} <span className="text-mute">· {r.quantity || "qty not given"}</span></p>
            <p className="text-sm">{r.eventName} · {r.city} · {r.eventDate} · ~{r.attendance} people</p>
            <p className="mt-1 text-sm">{r.contactName} · <a className="underline" href={`mailto:${r.contactEmail}`}>{r.contactEmail}</a>{r.contactPhone && ` · ${r.contactPhone}`}</p>
            {r.notes && <p className="mt-1 text-sm">Notes: {r.notes}</p>}
            <form action={updateVendorRequestAction} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={r.id} />
              <label>Status<select name="status" defaultValue={r.status} className="field !min-h-11">{["new", "matching", "matched", "closed"].map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className="min-w-60 flex-1">Admin notes<input name="adminNotes" defaultValue={r.adminNotes} className="field !min-h-11" /></label>
              <button className="btn btn-sm">Save</button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
