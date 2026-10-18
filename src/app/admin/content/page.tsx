import { addCorrectionAction, clearDisputedAction, moderateContentAction, resolveContentReportAction } from "@/app/actions-hill";
import { Flash } from "@/components/admin-ui";
import { query } from "@/lib/db";
import { MODERATION_REASONS } from "@/lib/engine/public-protest";
import { OUTCOME_STATE_LABEL, type OutcomeState } from "@/lib/engine/digital-action";
import { listContentReports, REPORT_REASONS } from "@/lib/content-moderation";

export const metadata = { title: "Issue and campaign reports" };

export default async function AdminContent({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const [reports, issues, campaigns] = await Promise.all([listContentReports(true),
    query("SELECT slug, title, status, moderation_status FROM issues ORDER BY updated_at DESC LIMIT 100"),
    query("SELECT slug, title, visibility, moderation_status, outcome_state FROM digital_campaigns ORDER BY updated_at DESC LIMIT 100")]);
  const reasonSelect = <select name="reason" aria-label="Reason" className="field !min-h-9 !w-56" defaultValue="OTHER">{Object.entries(MODERATION_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>;
  return (
    <>
      <h1 className="heading text-3xl">Issue and campaign reports</h1>
      <p className="mt-2 max-w-2xl text-mute">A report asks a person to look; it hides nothing by itself. A disputed statement of fact is answered with a published correction next to it, or dismissed with a reason. Hiding or removing a page needs a conduct reason (threats, harassment, doxxing, impersonation, fraud, illegal content, spam). A view being unpopular, or disagreed with, is never a reason. Every decision needs a note and is logged.</p>
      <Flash sp={sp} />
      <table className="mt-6 w-full border border-hair text-left text-sm" data-testid="reports"><thead className="bg-paper-2"><tr>{["Page", "Reason", "Statement and details", "From", "Decision"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {reports.length === 0 && <tr><td colSpan={5} className="p-3 text-mute">No reports.</td></tr>}
        {reports.map((r: any) => (
          <tr key={r.id} className="border-t border-hair align-top" data-report={r.id} data-status={r.status}>
            <td className="p-2"><a className="font-semibold underline" href={r.target_type === "ISSUE" ? `/issues/${r.slug}` : `/actions/${r.slug}`}>{r.title}</a><br />{r.target_type.toLowerCase()} · {r.open_for_page} open</td>
            <td className="p-2">{REPORT_REASONS[r.reason_code]}</td>
            <td className="p-2 max-w-sm whitespace-pre-line">{r.disputed_text && <><strong>Disputed:</strong> {r.disputed_text}<br /></>}{r.note || "—"}{r.evidence_url && <><br /><a className="underline" href={r.evidence_url} target="_blank" rel="noopener noreferrer">evidence link</a></>}</td>
            <td className="p-2">{r.signed_in ? r.reporter_email : "anonymous"}</td>
            <td className="p-2">{r.status === "OPEN" ? (
              <form action={resolveContentReportAction} className="grid gap-1"><input type="hidden" name="reportId" value={r.id} />
                <input name="note" required minLength={3} placeholder="Decision note" aria-label="Decision note" className="field !min-h-9" />
                {r.reason_code === "FACTUAL_ERROR" ? (<>
                  <input name="claim" placeholder="Statement being corrected" defaultValue={r.disputed_text} aria-label="Statement being corrected" className="field !min-h-9" />
                  <textarea name="correction" rows={2} placeholder="Correction to publish next to it" aria-label="Correction text" className="field" />
                  <input name="sourceUrl" type="url" placeholder="Source for the correction (https)" aria-label="Correction source" className="field !min-h-9" />
                  <label className="flex items-center gap-2"><input type="checkbox" name="markDisputed" className="size-4" /> Mark the campaign as disputed</label>
                  <span className="flex gap-1"><button name="outcome" value="CORRECTION" className="btn btn-secondary !min-h-9">Publish correction</button><button name="outcome" value="DISMISS" className="btn btn-ghost !min-h-9">Dismiss</button></span></>)
                  : <span className="flex gap-1"><button name="outcome" value="HIDE" className="btn btn-secondary !min-h-9">Hide</button><button name="outcome" value="REMOVE" className="btn btn-secondary !min-h-9">Remove</button><button name="outcome" value="DISMISS" className="btn btn-ghost !min-h-9">Dismiss</button></span>}
              </form>) : <>{r.status.toLowerCase()}<br /><span className="text-mute">{r.resolution_note}</span></>}</td>
          </tr>))}
      </tbody></table>

      <h2 className="heading mt-10 text-xl">Digital actions</h2>
      <table className="mt-3 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["Campaign", "Visibility", "State", "Moderation", "Action"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {campaigns.length === 0 && <tr><td colSpan={5} className="p-3 text-mute">None.</td></tr>}
        {campaigns.map((c: any) => <tr key={c.slug} className="border-t border-hair align-top" data-campaign={c.slug}>
          <td className="p-2"><a className="font-semibold underline" href={`/actions/${c.slug}`}>{c.title}</a></td><td className="p-2">{c.visibility}</td><td className="p-2">{OUTCOME_STATE_LABEL[c.outcome_state as OutcomeState]}</td><td className="p-2">{c.moderation_status}</td>
          <td className="p-2"><form action={moderateContentAction} className="grid gap-1"><input type="hidden" name="type" value="CAMPAIGN" /><input type="hidden" name="slug" value={c.slug} />{reasonSelect}<input name="note" required minLength={3} placeholder="Note" aria-label="Note" className="field !min-h-9" />
            <span className="flex gap-1">{c.moderation_status === "OK" ? <><button name="op" value="HIDE" className="btn btn-secondary !min-h-9">Hide</button><button name="op" value="REMOVE" className="btn btn-secondary !min-h-9">Remove</button></> : <button name="op" value="RESTORE" className="btn btn-secondary !min-h-9">Restore</button>}</span></form>
            <form action={addCorrectionAction} className="mt-2 grid gap-1"><input type="hidden" name="type" value="CAMPAIGN" /><input type="hidden" name="slug" value={c.slug} /><input name="claim" placeholder="Statement being corrected" aria-label="Statement being corrected" className="field !min-h-9" /><input name="correction" placeholder="Correction" aria-label="Correction" className="field !min-h-9" /><input name="sourceUrl" type="url" placeholder="Source (https)" aria-label="Correction source" className="field !min-h-9" /><label className="flex items-center gap-2"><input type="checkbox" name="markDisputed" className="size-4" /> Mark as disputed</label><button className="btn btn-ghost !min-h-9">Add correction</button></form>
            {c.outcome_state === "DISPUTED" && <form action={clearDisputedAction} className="mt-2 grid gap-1"><input type="hidden" name="slug" value={c.slug} /><input name="note" required minLength={3} placeholder="Why the dispute is resolved" aria-label="Clear dispute note" className="field !min-h-9" /><button className="btn btn-ghost !min-h-9">Clear dispute</button></form>}</td></tr>)}
      </tbody></table>

      <h2 className="heading mt-10 text-xl">Issues</h2>
      <table className="mt-3 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["Issue", "Status", "Moderation", "Action"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {issues.length === 0 && <tr><td colSpan={4} className="p-3 text-mute">None.</td></tr>}
        {issues.map((i: any) => <tr key={i.slug} className="border-t border-hair align-top" data-issue={i.slug}>
          <td className="p-2"><a className="font-semibold underline" href={`/issues/${i.slug}`}>{i.title}</a></td><td className="p-2">{i.status}</td><td className="p-2">{i.moderation_status}</td>
          <td className="p-2"><form action={moderateContentAction} className="grid gap-1"><input type="hidden" name="type" value="ISSUE" /><input type="hidden" name="slug" value={i.slug} />{reasonSelect}<input name="note" required minLength={3} placeholder="Note" aria-label="Note" className="field !min-h-9" />
            <span className="flex gap-1">{i.moderation_status === "OK" ? <><button name="op" value="HIDE" className="btn btn-secondary !min-h-9">Hide</button><button name="op" value="REMOVE" className="btn btn-secondary !min-h-9">Remove</button></> : <button name="op" value="RESTORE" className="btn btn-secondary !min-h-9">Restore</button>}</span></form></td></tr>)}
      </tbody></table>
    </>
  );
}
