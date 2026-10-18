import Link from "next/link";
import { createIssueAction, resolveSuggestionAction } from "@/app/actions-hill";
import { Flash } from "@/components/admin-ui";
import { ISSUE_CATEGORIES } from "@/lib/engine/issues";
import { listIssuesForAdmin, listSuggestions } from "@/lib/issues";

export const metadata = { title: "Issues" };

export default async function AdminIssues({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const [issues, suggestions] = await Promise.all([listIssuesForAdmin(), listSuggestions()]);
  return (
    <>
      <h1 className="heading text-3xl">Issues (Find Your Hill)</h1>
      <p className="mt-2 max-w-2xl text-mute">The catalogue is small and written by people. An issue is published only after a person has checked its sources, and the page states what remains unknown. Nothing here is published automatically, and no AI writes or publishes anything.</p>
      <Flash sp={sp} />
      <form action={createIssueAction} className="panel mt-6 grid gap-3 p-4 sm:grid-cols-4" aria-label="New issue draft">
        <label className="sm:col-span-4 text-sm">Neutral working title<input name="title" required minLength={3} className="field" /></label>
        <label className="text-sm">Topic<select name="category" className="field" defaultValue="OTHER">{Object.entries(ISSUE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="text-sm">City (blank if not local)<input name="city" className="field" /></label>
        <label className="text-sm">State (blank if nationwide)<input name="state" className="field" /></label>
        <div className="flex items-end"><button className="btn">Create draft</button></div>
      </form>
      <table className="mt-6 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["Issue", "Place", "Status", "Checked"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {issues.length === 0 && <tr><td colSpan={4} className="p-3 text-mute">No issues yet.</td></tr>}
        {issues.map((i: any) => <tr key={i.id} className="border-t border-hair" data-issue={i.slug}><td className="p-2"><Link className="font-semibold underline" href={`/admin/issues/${i.id}`}>{i.title}</Link></td><td className="p-2">{[i.city, i.state].filter(Boolean).join(", ") || "Nationwide"}</td><td className="p-2">{i.status}{i.moderation_status !== "OK" ? ` / ${i.moderation_status}` : ""}</td><td className="p-2">{i.checked ?? "—"}</td></tr>)}
      </tbody></table>
      <h2 className="heading mt-10 text-xl">Suggestions <span className="chip ml-2">{suggestions.filter((s: any) => s.status === "NEW").length} new</span></h2>
      <table className="mt-3 w-full border border-hair text-left text-sm" data-testid="suggestions"><thead className="bg-paper-2"><tr>{["Suggestion", "From", "Source", "Decision"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {suggestions.length === 0 && <tr><td colSpan={4} className="p-3 text-mute">No suggestions.</td></tr>}
        {suggestions.map((s: any) => <tr key={s.id} className="border-t border-hair align-top" data-suggestion={s.id}>
          <td className="p-2"><p className="font-semibold">{s.title}</p><p className="max-w-md whitespace-pre-line text-mute">{s.description}</p><p className="text-mute">{[s.city, s.state].filter(Boolean).join(", ")}</p></td><td className="p-2">{s.email ?? "—"}</td>
          <td className="p-2">{s.source_url ? <a className="underline" href={s.source_url} target="_blank" rel="noopener noreferrer">link</a> : "—"}</td>
          <td className="p-2">{s.status === "NEW" ? <form action={resolveSuggestionAction} className="grid gap-1"><input type="hidden" name="id" value={s.id} /><input name="note" required minLength={3} placeholder="Note" aria-label="Decision note" className="field !min-h-9" />
            <span className="flex gap-1"><button name="outcome" value="PROMOTED" className="btn btn-secondary !min-h-9">Start a draft</button><button name="outcome" value="DECLINED" className="btn btn-ghost !min-h-9">Decline</button></span></form> : <>{s.status.toLowerCase()}<br /><span className="text-mute">{s.admin_note}</span></>}</td></tr>)}
      </tbody></table>
    </>
  );
}
