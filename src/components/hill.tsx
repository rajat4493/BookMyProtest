import Link from "next/link";
import { reportContentAction, saveCampaignAction } from "@/app/actions-hill";
import { ACTION_CATEGORIES, OUTCOME_STATE_LABEL, type CampaignDraft } from "@/lib/engine/digital-action";
import { REPORT_REASONS } from "@/lib/content-moderation";
import type { PublicCampaign } from "@/lib/digital-actions";
import type { PublicIssue } from "@/lib/issues";
import { formatDate } from "@/lib/plan";

const placeOf = (i: { scopeLevel: string; city: string; state: string }) => (i.scopeLevel === "NATIONAL" ? "Nationwide" : [i.city, i.state].filter(Boolean).join(", "));

/** Search result card. Shows evidence status (sources, last check), never a popularity or sentiment signal. */
export function IssueCard({ i, protests, campaigns }: { i: PublicIssue; protests: number; campaigns: number }) {
  return (
    <li>
      <Link href={`/issues/${i.slug}`} className="tile-quiet block bg-paper p-5" data-testid="issue-card">
        <span className="label text-mute">{i.categoryLabel} · {placeOf(i)}</span>
        <span className="heading mt-1 block text-xl">{i.title}</span>
        <span className="mt-1 block text-mute">{i.summary}</span>
        <span className="mt-2 block text-sm text-mute">{i.sources.length} source{i.sources.length === 1 ? "" : "s"} · information checked {i.lastCheckedOn ? formatDate(i.lastCheckedOn) : "date not stated"}</span>
        {(protests > 0 || campaigns > 0) && <span className="mt-1 block text-sm text-mute">{[protests && `${protests} related protest${protests === 1 ? "" : "s"}`, campaigns && `${campaigns} digital action${campaigns === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>}
      </Link>
    </li>
  );
}

export function CampaignCard({ c }: { c: PublicCampaign }) {
  return (
    <li>
      <Link href={`/actions/${c.slug}`} className="tile-quiet block bg-paper p-5" data-testid="campaign-card">
        <span className="label text-mute">Digital action · {OUTCOME_STATE_LABEL[c.outcomeState]}</span>
        <span className="heading mt-1 block text-xl">{c.title}</span>
        <span className="mt-1 block text-mute">Asks: {c.requestedChange.length > 140 ? `${c.requestedChange.slice(0, 140)}…` : c.requestedChange}</span>
        <span className="mt-2 block text-sm">Issue: {c.issue.title}</span>
        <span className="block text-sm text-mute">Organizer: {c.organizerDisplayName} (self-declared)</span>
      </Link>
    </li>
  );
}

/** "Report this page": conduct reasons, and a separate route for a statement of fact that is wrong. Nothing is hidden automatically. */
export function ReportForm({ type, slug }: { type: "ISSUE" | "CAMPAIGN"; slug: string }) {
  return (
    <section id="report" aria-labelledby="report-h" data-testid="report">
      <details className="panel p-4">
        <summary id="report-h" className="cursor-pointer font-semibold">Report this page or correct a statement</summary>
        <p className="mt-2 max-w-xl text-sm text-mute">Anyone can use this, including a person or organization named on the page. If a statement of fact is wrong, choose that reason and quote it: a reviewer checks it against its source and may publish a correction next to it. Reports never hide a page automatically, and a disagreement with a view is not a reason for removal.</p>
        <form action={reportContentAction} className="mt-3 grid max-w-xl gap-3"><input type="hidden" name="type" value={type} /><input type="hidden" name="slug" value={slug} />
          <label className="grid gap-1 text-sm font-semibold">What is wrong?
            <select name="reason" required className="field" defaultValue=""><option value="" disabled>Choose a reason</option>{Object.entries(REPORT_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">The statement you say is wrong (for factual errors)
            <textarea name="disputedText" maxLength={800} rows={2} className="field" /></label>
          <label className="grid gap-1 text-sm font-semibold">Details or what the correct fact is (optional)
            <textarea name="note" maxLength={800} rows={3} className="field" /></label>
          <label className="grid gap-1 text-sm font-semibold">Link to evidence (https, optional)
            <input name="evidenceUrl" type="url" inputMode="url" className="field" /></label>
          <button className="btn btn-secondary w-fit">Send report</button>
        </form>
      </details>
    </section>
  );
}

export function NeutralityNote({ kind }: { kind: "issue" | "campaign" }) {
  return (
    <aside className="panel p-5 text-sm text-mute" data-testid="neutrality-note" aria-labelledby="neutral-h">
      <h2 id="neutral-h" className="label text-ink">About this page</h2>
      <ul className="mt-2 list-inside list-disc space-y-1">
        {kind === "issue" ? (
          <>
            <li>BookMyProtest does not endorse any position described here, and listing an issue is not a judgement about it.</li>
            <li>Sources are linked so you can read them yourself. Information may have changed since it was checked.</li>
          </>
        ) : (
          <>
            <li>BookMyProtest does not endorse, organize or guarantee this campaign. The organizer is responsible for its claims.</li>
            <li>Participation is voluntary and lawful actions only. Totals are self-reported by participants and not verified.</li>
            <li>BookMyProtest does not estimate any effect on a business from participation numbers.</li>
          </>
        )}
      </ul>
    </aside>
  );
}

const slot = (n: number) => [...Array(n).keys()];

/** The one campaign form (create and edit). Server-rendered; every field is plain text so nothing depends on client script. */
export function CampaignForm({ d, issueSlug, issues, slug, visibility = "DRAFT" }: { d?: CampaignDraft; issueSlug: string; issues: { slug: string; title: string }[]; slug?: string; visibility?: string }) {
  const ev = d?.evidence ?? [];
  const has = (k: string) => d?.actions.find((a) => a.category === k);
  return (
    <form action={saveCampaignAction} className="mt-6 space-y-6" aria-label="Digital action details">
      {slug && <input type="hidden" name="slug" value={slug} />}
      <div><label htmlFor="issueSlug" className="label mb-1 block">Issue this is about</label>
        <select id="issueSlug" name="issueSlug" required defaultValue={issueSlug} className="field"><option value="" disabled>Choose a published issue</option>{issues.map((i) => <option key={i.slug} value={i.slug}>{i.title}</option>)}</select></div>
      <div><label htmlFor="title" className="label mb-1 block">Campaign title</label><input id="title" name="title" required maxLength={120} defaultValue={d?.title ?? ""} className="field" /></div>
      <div><label htmlFor="summary" className="label mb-1 block">Short summary (up to 280 characters)</label><input id="summary" name="summary" maxLength={280} defaultValue={d?.summary ?? ""} className="field" /></div>
      <div><label htmlFor="requestedChange" className="label mb-1 block">The specific change you are asking for</label><textarea id="requestedChange" name="requestedChange" rows={3} maxLength={800} defaultValue={d?.requestedChange ?? ""} className="field" aria-describedby="rc-h" /><p id="rc-h" className="mt-1 text-sm text-mute">One concrete, checkable request, for example a published policy, a disclosed figure or a changed practice. Not a feeling or a punishment.</p></div>
      <div><label htmlFor="institution" className="label mb-1 block">Organization or institution involved (if any)</label><input id="institution" name="institution" maxLength={120} defaultValue={d?.institution ?? ""} className="field" aria-describedby="inst-h" /><p id="inst-h" className="mt-1 text-sm text-mute">Name an organization only. Never name or describe a private individual or an employee. If you name one, every fact you state about it needs a citation below, and it can use the correction route on your page.</p></div>

      <fieldset className="panel p-4"><legend className="label px-1">Evidence: facts this campaign relies on (each with a source)</legend>
        {slot(4).map((n) => (
          <div key={n} className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="text-sm">Fact {n + 1}<input name={`ev_claim_${n}`} maxLength={300} defaultValue={ev[n]?.claim ?? ""} className="field" /></label>
            <label className="text-sm">Source title<input name={`ev_title_${n}`} maxLength={200} defaultValue={ev[n]?.sourceTitle ?? ""} className="field" /></label>
            <label className="text-sm">Source link (https)<input name={`ev_url_${n}`} type="url" inputMode="url" defaultValue={ev[n]?.sourceUrl ?? ""} className="field" /></label>
          </div>))}
      </fieldset>

      <fieldset className="panel p-4"><legend className="label px-1">Actions people can choose (voluntary, lawful, nonviolent)</legend>
        {Object.entries(ACTION_CATEGORIES).map(([k, v]) => {
          const a = has(k);
          return (
            <div key={k} className="mt-3 border-t border-hair pt-3 first:border-0 first:pt-0">
              <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name={`act_${k}`} defaultChecked={!!a} className="size-5" /> {v.label}</label>
              <p className="ml-7 text-sm text-mute">{v.help}</p>
              <div className="ml-7 mt-1 grid gap-2 sm:grid-cols-3">
                <label className="text-sm">What exactly<input name={`label_${k}`} maxLength={140} defaultValue={a?.label ?? ""} className="field" /></label>
                <label className="text-sm">Detail (optional)<input name={`detail_${k}`} maxLength={300} defaultValue={a?.detail ?? ""} className="field" /></label>
                <label className="text-sm">Link (https, optional)<input name={`link_${k}`} type="url" inputMode="url" defaultValue={a?.link ?? ""} className="field" /></label>
              </div>
            </div>);
        })}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="startsOn" className="label mb-1 block">Start date</label><input id="startsOn" name="startsOn" type="date" defaultValue={d?.startsOn ?? ""} className="field" /></div>
        <div><label htmlFor="reviewOn" className="label mb-1 block">Review date (when you will report where it stands)</label><input id="reviewOn" name="reviewOn" type="date" defaultValue={d?.reviewOn ?? ""} className="field" /></div>
      </div>
      <div><label htmlFor="closureCriteria" className="label mb-1 block">What would count as success or closure</label><textarea id="closureCriteria" name="closureCriteria" rows={3} maxLength={600} defaultValue={d?.closureCriteria ?? ""} className="field" /></div>
      <div><label htmlFor="organizerDisplayName" className="label mb-1 block">Organizer name shown publicly</label><input id="organizerDisplayName" name="organizerDisplayName" required maxLength={80} defaultValue={d?.organizerDisplayName ?? ""} className="field" aria-describedby="odn-h" /><p id="odn-h" className="mt-1 text-sm text-mute">A group or your own name. It is shown as self-declared; BookMyProtest does not check who you are.</p></div>
      <div><label htmlFor="visibility" className="label mb-1 block">Visibility</label>
        <select id="visibility" name="visibility" defaultValue={visibility === "ARCHIVED" ? "DRAFT" : visibility} className="field" data-testid="visibility"><option value="DRAFT">Draft: only you</option><option value="UNLISTED">Unlisted: anyone with the link</option><option value="PUBLIC">Public: listed</option></select>
        <p className="mt-1 text-sm text-mute">Publishing needs a confirmed email and a complete page. You are responsible for your claims. BookMyProtest does not endorse or guarantee your campaign.</p></div>
      <button className="btn" data-testid="save-campaign">Save</button>
    </form>
  );
}
