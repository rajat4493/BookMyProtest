import { moderateProtestAction, suspendOrganizerAction } from "@/app/actions";
import { Flash } from "@/components/admin-ui";
import { MODERATION_REASONS } from "@/lib/engine/public-protest";
import { listModerationLog, listModerationQueue } from "@/lib/moderation";

export const metadata = { title: "Public listings" };

export default async function AdminProtests({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const [rows, log] = await Promise.all([listModerationQueue(), listModerationLog()]);
  const reasons = (name: string) => <select name="reason" aria-label="Reason" className="field !min-h-9 !w-56" defaultValue="OTHER">{Object.entries(MODERATION_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>;
  return (
    <>
      <h1 className="heading text-3xl">Public listings</h1>
      <p className="mt-2 max-w-2xl text-mute">Moderation enforces neutral platform rules about conduct and content. It is never a judgement about a cause or viewpoint. Every action needs a reason category and a note, and is logged. Hidden pages can be restored.</p>
      <Flash sp={sp} />
      <table className="mt-6 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["Listing", "Where / when", "Visibility", "Moderation", "Organizer", "Action"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-mute">No public pages yet.</td></tr>}
        {rows.map((r: any) => (
          <tr key={r.slug} className="border-t border-hair align-top" data-slug={r.slug}>
            <td className="p-2"><a className="font-semibold underline" href={`/protests/${r.slug}`}>{r.title}</a></td>
            <td className="p-2">{r.city}, {r.state}<br />{r.d}</td>
            <td className="p-2">{r.visibility}</td>
            <td className="p-2">{r.moderation_status}</td>
            <td className="p-2">{r.owner_email}{r.owner_suspended && <span className="chip chip-critical ml-1">suspended</span>}</td>
            <td className="p-2">
              <form action={moderateProtestAction} className="grid gap-1"><input type="hidden" name="slug" value={r.slug} />{reasons("reason")}<input name="note" required minLength={3} placeholder="Note" aria-label="Note" className="field !min-h-9" />
                <span className="flex gap-1">{r.moderation_status === "OK" ? <><button name="op" value="HIDE" className="btn btn-secondary !min-h-9">Hide</button><button name="op" value="REMOVE" className="btn btn-secondary !min-h-9">Remove</button></> : <button name="op" value="RESTORE" className="btn btn-secondary !min-h-9">Restore</button>}</span></form>
              <form action={suspendOrganizerAction} className="mt-2 grid gap-1"><input type="hidden" name="userId" value={r.owner_id} /><input type="hidden" name="suspend" value={String(!r.owner_suspended)} />{reasons("reason")}<input name="note" required minLength={3} placeholder="Note" aria-label="Note for organizer action" className="field !min-h-9" />
                <button className="btn btn-secondary !min-h-9">{r.owner_suspended ? "Reinstate organizer" : "Suspend organizer"}</button></form>
            </td>
          </tr>))}
      </tbody></table>
      <h2 className="heading mt-10 text-xl">Moderation log</h2>
      <table className="mt-3 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["When", "Action", "Reason", "Listing", "Note", "By"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {log.length === 0 && <tr><td colSpan={6} className="p-3 text-mute">No moderation actions yet.</td></tr>}
        {log.map((m: any, i: number) => <tr key={i} className="border-t border-hair"><td className="p-2">{new Date(m.created_at).toISOString().slice(0, 16).replace("T", " ")}</td><td className="p-2">{m.action}</td><td className="p-2">{MODERATION_REASONS[m.reason_code]}</td><td className="p-2">{m.title ?? "—"}</td><td className="p-2">{m.note}</td><td className="p-2">{m.admin_email}</td></tr>)}
      </tbody></table>
    </>
  );
}
