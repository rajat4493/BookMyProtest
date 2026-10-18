import { notFound } from "next/navigation";
import { archiveIssueAction, publishIssueAction, saveIssueAction } from "@/app/actions-hill";
import { Flash } from "@/components/admin-ui";
import { ISSUE_CATEGORIES, publishProblems, SCOPE_LEVELS, SOURCE_KINDS } from "@/lib/engine/issues";
import { getIssueForEdit } from "@/lib/issues";

export const metadata = { title: "Edit issue" };
const lines = (xs: string[][]) => xs.map((x) => x.join(" | ")).join("\n");

export default async function EditIssue({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const e = await getIssueForEdit(id);
  if (!e) notFound();
  const d = e.draft;
  const problems = publishProblems(d, e.sources);
  return (
    <>
      <h1 className="heading text-3xl">{d.title}</h1>
      <p className="mt-1 text-mute">/issues/{e.slug} · {e.status}{e.moderation !== "OK" ? ` / ${e.moderation}` : ""}</p>
      <Flash sp={sp} />
      <div className="panel mt-4 p-4 text-sm" data-testid="publish-problems">
        <p className="font-semibold">{problems.length ? "Before it can be published:" : "Complete: ready for a person to publish."}</p>
        {problems.length > 0 && <ul className="mt-1 list-inside list-disc">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      </div>
      <form action={saveIssueAction} className="mt-6 grid gap-4" aria-label="Issue content"><input type="hidden" name="id" value={id} />
        <label className="text-sm">Title (neutral: what the issue is)<input name="title" defaultValue={d.title} className="field" required /></label>
        <label className="text-sm">Summary (one or two factual sentences)<input name="summary" defaultValue={d.summary} maxLength={280} className="field" /></label>
        <label className="text-sm">What this is (factual description)<textarea name="description" rows={5} defaultValue={d.description} className="field" /></label>
        <label className="text-sm">Why it is being discussed<textarea name="whyDiscussed" rows={3} defaultValue={d.whyDiscussed} className="field" /></label>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm">Scope<select name="scopeLevel" defaultValue={d.scopeLevel} className="field">{Object.entries(SCOPE_LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-sm">City<input name="city" defaultValue={d.city} className="field" /></label>
          <label className="text-sm">State<input name="state" defaultValue={d.state} className="field" /></label>
          <label className="text-sm">Topic<select name="category" defaultValue={d.category} className="field">{Object.entries(ISSUE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <label className="text-sm">Sources, one per line: <code>TYPE | Title | https://link | Publisher | YYYY-MM-DD</code> (TYPE: {Object.keys(SOURCE_KINDS).join(", ")}). At least one must be independent of the parties.
          <textarea name="sources" rows={5} defaultValue={lines(e.sources.map((s) => [s.kind, s.title, s.url, s.publisher ?? "", s.publishedOn ?? ""]))} className="field font-mono" /></label>
        <label className="text-sm">Different perspectives, one per line: <code>Who or what view | summary | https://source (optional)</code>
          <textarea name="perspectives" rows={4} defaultValue={lines(d.perspectives.map((p) => [p.label, p.summary, p.sourceUrl ?? ""]))} className="field font-mono" /></label>
        <label className="text-sm">Disputed claims, one per line: <code>claim as made | what is disputed | https://source (optional)</code>
          <textarea name="disputedClaims" rows={3} defaultValue={lines(d.disputedClaims.map((p) => [p.claim, p.dispute, p.sourceUrl ?? ""]))} className="field font-mono" /></label>
        <label className="text-sm">Recent developments, one per line: <code>YYYY-MM-DD | what happened | source title | https://source</code>
          <textarea name="developments" rows={3} defaultValue={lines(d.developments.map((p) => [p.date, p.text, p.sourceTitle, p.sourceUrl]))} className="field font-mono" /></label>
        <label className="text-sm">What remains unknown<textarea name="unknowns" rows={3} defaultValue={d.unknowns} className="field" /></label>
        <label className="text-sm">Information last checked on<input type="date" name="lastCheckedOn" defaultValue={d.lastCheckedOn ?? ""} className="field" /></label>
        <button className="btn w-fit" data-testid="save-issue">Save</button>
      </form>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <form action={publishIssueAction} className="panel grid gap-2 p-4"><input type="hidden" name="id" value={id} /><h2 className="heading text-lg">Publish</h2><p className="text-sm text-mute">A person confirms they checked the sources against the page. Publishing makes it visible when the Find Your Hill flag is on.</p>
          <input name="note" required minLength={3} placeholder="What you checked" aria-label="Publish note" className="field" /><button className="btn" data-testid="publish-issue">Publish</button></form>
        <form action={archiveIssueAction} className="panel grid gap-2 p-4"><input type="hidden" name="id" value={id} /><h2 className="heading text-lg">Archive</h2><input name="note" required minLength={3} placeholder="Why" aria-label="Archive note" className="field" /><button className="btn btn-ghost">Archive</button></form>
      </div>
    </>
  );
}
