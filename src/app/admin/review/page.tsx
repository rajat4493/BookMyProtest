import Link from "next/link";
import { reviewChangeAction } from "@/app/actions";
import { Flash, StatusChip } from "@/components/admin-ui";
import { listChangeEvents } from "@/lib/knowledge";

export default async function Review({ searchParams }: { searchParams: Promise<{ error?: string; highlight?: string; all?: string }> }) {
  const sp = await searchParams;
  const events = await listChangeEvents(sp.all ? undefined : "PENDING");
  return (
    <>
      <h1 className="heading text-3xl">Review queue</h1>
      <p className="mt-2 max-w-2xl text-mute">Detected source changes. Summaries are automatic suggestions, not legal findings. A human decides: dismiss (no change to the requirement) or start a new rule version, which is published only after evidence is attached.</p>
      <Flash sp={sp} />
      <p className="mt-3 text-sm"><Link className="underline" href={sp.all ? "/admin/review" : "/admin/review?all=1"}>{sp.all ? "Show pending only" : "Show resolved too"}</Link></p>
      <ul className="mt-6 space-y-4">
        {events.length === 0 && <li className="panel p-6"><p className="heading text-lg">Nothing to review</p><p className="text-mute">When a monitored source changes, it appears here with the rules it may affect.</p></li>}
        {events.map((e) => (
          <li key={e.id} className={`p-4 ${e.id === sp.highlight ? "card" : "panel"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="heading text-lg">{e.sourceTitle}</span>
              <span className={`chip ${e.materiality === "MATERIAL" || e.materiality === "POTENTIALLY_MATERIAL" ? "chip-critical" : "chip-note"}`}>{e.materiality.replace("_", " ")}</span>
              <span className="chip chip-recommended">Priority {e.priority}</span>
              <span className="chip chip-note">{e.reviewStatus.replace("_", " ")}</span>
            </div>
            <p className="mt-1 text-sm text-mute">Detected {e.detectedAt.slice(0, 16).replace("T", " ")} · summary by {e.summaryOrigin === "AI" ? "AI (suggestion only)" : "automatic diff"}</p>
            <p className="mt-2">{e.summary}</p>
            {e.diffExcerpt && <pre className="mt-2 overflow-x-auto bg-paper-2 p-3 text-xs whitespace-pre-wrap">{e.diffExcerpt}</pre>}
            <h3 className="label mt-3 text-mute">Affected rules</h3>
            <ul className="mt-1 text-sm">{e.affectedRules.length === 0 ? <li className="text-mute">No rule cites this source yet.</li> : e.affectedRules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-1"><Link className="underline" href={`/admin/rules/${r.id}`}>{r.title}</Link><span className="font-mono text-xs">{r.familyId} v{r.version}</span><StatusChip status={r.status} />
                {e.reviewStatus === "PENDING" && r.status === "CHANGE_DETECTED" && !r.replacementId && (
                  <form action={reviewChangeAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="ruleId" value={r.id} /><input type="hidden" name="op" value="replace" /><button className="btn btn-sm">Start new version</button></form>)}
                {r.replacementId && <Link className="underline" href={`/admin/rules/${r.replacementId}`}>Replacement draft</Link>}
              </li>))}</ul>
            {e.reviewStatus === "PENDING" ? (
              <form action={reviewChangeAction} className="mt-4 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={e.id} /><input type="hidden" name="op" value="dismiss" />
                <label className="min-w-60 flex-1 text-sm">Reviewer notes<input name="notes" className="field !min-h-10" placeholder="Why this does not change the requirement" /></label>
                <button className="btn btn-sm btn-ghost">Dismiss: no change to the rule</button>
              </form>
            ) : <p className="mt-3 text-sm text-mute">Reviewed {e.reviewedAt?.slice(0, 16).replace("T", " ")} — {e.reviewNotes}</p>}
          </li>))}
      </ul>
    </>
  );
}
