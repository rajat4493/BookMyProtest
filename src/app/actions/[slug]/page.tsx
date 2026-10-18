import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { actionIntentAction, campaignParticipationAction } from "@/app/actions-hill";
import { resendVerificationAction } from "@/app/actions";
import { Tracker } from "@/components/client";
import { Footer, Header } from "@/components/chrome";
import { NeutralityNote, ReportForm } from "@/components/hill";
import { Provenance } from "@/components/provenance";
import { ShareButton } from "@/components/protest-bits";
import { getUser } from "@/lib/auth";
import { OUTCOME_KINDS, OUTCOME_STATE_LABEL, outcomeEvidenceLabel } from "@/lib/engine/digital-action";
import { signalLines } from "@/lib/engine/identity";
import { findYourHillEnabled, hitWhereItHurtsEnabled } from "@/lib/flags";
import { campaignViewerState, getPublicCampaign } from "@/lib/digital-actions";
import { formatDate } from "@/lib/plan";
import { isEmailVerified } from "@/lib/verification";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  if (!hitWhereItHurtsEnabled()) return { title: "Not found", robots: { index: false } };
  const f = await getPublicCampaign((await params).slug, (await getUser())?.id ?? null);
  if (!f) return { title: "Not found", robots: { index: false } };
  return { title: f.campaign.title, description: f.campaign.summary || f.campaign.requestedChange.slice(0, 160), robots: f.campaign.visibility === "PUBLIC" && f.campaign.moderation === "OK" ? undefined : { index: false } };
}

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; reported?: string }> }) {
  if (!hitWhereItHurtsEnabled()) notFound();
  const { slug } = await params;
  const sp = await searchParams;
  const user = await getUser();
  const found = await getPublicCampaign(slug, user?.id ?? null);
  if (!found) notFound();
  const { campaign: c, isOwner, notice } = found;
  const [mine, verified] = await Promise.all([campaignViewerState(slug, user?.id ?? null), isEmailVerified(user?.id)]);
  const { corrections } = c;
  const h = await headers();
  const url = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/actions/${c.slug}`;
  const closed = c.outcomeState === "CLOSED_WITHOUT_RESOLUTION" || c.outcomeState === "ARCHIVED";
  const canAct = (c.visibility === "PUBLIC" || c.visibility === "UNLISTED") && c.moderation === "OK";
  const by = (k: string) => c.outcomes.filter((o) => o.kind === k);
  const dims = { visibility: c.visibility };
  return (
    <>
      {!isOwner && <Tracker name="CAMPAIGN_VIEWED" props={dims} />}
      <Header />
      <main id="main">
        {(notice || sp.error || sp.reported) && (
          <div className="mx-auto max-w-5xl space-y-3 px-4 pt-2 sm:px-8">
            {notice && <p className="card p-4" role="status" data-testid="owner-notice">{notice} <Link className="underline" href={`/actions/${c.slug}/manage`}>Manage</Link></p>}
            {sp.reported && <p className="card p-4" role="status" data-testid="report-received">{sp.reported === "already" ? "You have already reported this page. A person will review it." : "Thank you. Your report was received and a person will review it. Reports do not hide a page automatically."}</p>}
            {sp.error && <p role="alert" className="card p-4 font-semibold">{sp.error}</p>}
          </div>)}
        <div className="on-ink bg-ink text-paper">
          <div className="mx-auto max-w-5xl px-4 pb-10 pt-8 sm:px-8">
            <p className="label text-paper/60">Digital action · organizer-led · voluntary</p>
            <h1 className="heading mt-2 text-3xl sm:text-5xl" data-testid="campaign-title">{c.title}</h1>
            {c.summary && <p className="mt-3 max-w-2xl text-lg text-paper/85">{c.summary}</p>}
            <dl className="mt-6 grid gap-x-8 gap-y-3 border-t border-paper/20 pt-4 sm:grid-cols-3">
              <div><dt className="label text-paper/55">About the issue</dt><dd>{findYourHillEnabled() && c.issue.open ? <Link className="underline" href={`/issues/${c.issue.slug}`}>{c.issue.title}</Link> : c.issue.title}</dd></div>
              <div><dt className="label text-paper/55">Organizer</dt><dd>{c.organizerDisplayName} <span className="text-paper/60">(self-declared)</span></dd></div>
              <div><dt className="label text-paper/55">Runs</dt><dd>{c.startsOn ? formatDate(c.startsOn) : "—"} to review on {c.reviewOn ? formatDate(c.reviewOn) : "—"}</dd></div>
            </dl>
            <div className="mt-5 border-t border-paper/20 pt-4" data-testid="outcome-state" data-state={c.outcomeState}>
              <p className="label text-paper/55">Where it stands</p>
              <p className="mt-0.5 text-xl font-extrabold">{OUTCOME_STATE_LABEL[c.outcomeState]}</p>
              {c.stateNote && <p className="text-sm text-paper/75" data-testid="state-note">{c.stateNote}</p>}
            </div>
            <div className="mt-6 flex flex-wrap gap-3"><ShareButton title={c.title} url={url} dims={dims} onInk /></div>
          </div>
        </div>
        <div className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-8">
          {corrections.length > 0 && (
            <section aria-labelledby="corr-h" data-testid="corrections"><h2 id="corr-h" className="heading text-2xl">Corrections</h2>
              <ul className="mt-3 space-y-3">{corrections.map((x, n) => <li key={n} className="panel p-4"><p className="text-sm text-mute">Statement: &ldquo;{x.claim}&rdquo;</p><p className="mt-1 font-semibold">{x.correction}</p>{x.sourceUrl && <Provenance p={{ cls: "EXTERNAL_SOURCE_LINK", source: { title: "Correction source", url: x.sourceUrl } }} />}<p className="text-xs text-mute">Added {formatDate(x.createdAt.slice(0, 10))} after review. The original statement above remains visible to the organizer.</p></li>)}</ul></section>)}
          <section aria-labelledby="ask-h"><h2 id="ask-h" className="heading text-2xl">The change being asked for</h2>
            <p className="mt-3 max-w-3xl whitespace-pre-line text-lg">{c.requestedChange}</p>
            {c.institution && <p className="mt-2 text-sm text-mute" data-testid="institution">Organization named by the organizer: <strong>{c.institution}</strong>. Statements about it are the organizer&rsquo;s claims, cited below. If something is wrong, use &ldquo;Report this page or correct a statement&rdquo; at the end of the page.</p>}
            <Provenance p={{ cls: "ORGANIZER_PROVIDED", asOf: c.updatedAt }} className="mt-2" />
            <h3 className="heading mt-4 text-lg">What would count as success or closure</h3><p className="mt-1 max-w-3xl">{c.closureCriteria}</p></section>
          <section aria-labelledby="ev-h" data-testid="evidence"><h2 id="ev-h" className="heading text-2xl">Evidence cited by the organizer</h2>
            <ul className="mt-4 divide-y divide-hair border-y border-hair">{c.evidence.map((e, n) => <li key={n} className="py-3"><p>{e.claim}</p><Provenance p={{ cls: "EXTERNAL_SOURCE_LINK", source: { title: e.sourceTitle, url: e.sourceUrl } }} /></li>)}</ul>
            <p className="mt-2 text-sm text-mute">These are claims supplied by the organizer with sources. BookMyProtest has not checked them.</p></section>

          <section aria-labelledby="part-h" data-testid="participation"><h2 id="part-h" className="heading text-2xl">Take part, if you choose</h2>
            <p className="mt-2 text-sm text-mute" data-testid="participation-counts">{c.counts.following} following · {c.counts.interested} interested. Signals from people with a confirmed email; the organizer and public see totals only.</p>
            {canAct && !closed ? (user && !verified ? (
              <div className="panel mt-4 p-4" data-testid="verify-needed"><p className="font-semibold">Confirm your email to take part.</p><form action={resendVerificationAction} className="mt-3"><input type="hidden" name="next" value={`/actions/${c.slug}`} /><button className="btn btn-sm">Email me a confirmation link</button></form></div>
            ) : (<>
              <div className="mt-4 flex flex-wrap gap-3">{(["FOLLOWING", "INTERESTED"] as const).map((k) => { const on = mine.kinds.includes(k); return (
                <form key={k} action={campaignParticipationAction}><input type="hidden" name="slug" value={c.slug} /><input type="hidden" name="kind" value={k} /><button className={`btn ${on ? "btn-accent" : ""}`} aria-pressed={on} data-kind={k}>{on ? (k === "FOLLOWING" ? "Following ✓" : "Interested ✓") : (k === "FOLLOWING" ? "Follow" : "I'm interested")}</button></form>); })}</div>
              <ul className="mt-6 divide-y divide-hair border-y border-hair" aria-label="Actions you can choose">{c.actions.map((a) => { const s = mine.intents[a.id]; return (
                <li key={a.id} className="py-4" data-action={a.id}>
                  <p className="label text-mute">{a.categoryLabel}</p><p className="font-semibold">{a.label}</p>{a.detail && <p className="text-sm text-mute">{a.detail}</p>}
                  {a.link && <p className="text-sm"><a className="underline" href={a.link} target="_blank" rel="noopener noreferrer">Link supplied by the organizer</a></p>}
                  <p className="mt-1 text-sm text-mute" data-testid="action-counts">{a.intends} plan to do this · {a.completedSelfReported} say they have done it (self-reported, not verified)</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["INTENDS", "COMPLETED_SELF_REPORTED"] as const).map((st) => (
                      <form key={st} action={actionIntentAction}><input type="hidden" name="slug" value={c.slug} /><input type="hidden" name="actionId" value={a.id} /><input type="hidden" name="status" value={s === st ? "" : st} />
                        <button className={`btn btn-sm ${s === st ? "btn-accent" : "btn-ghost"}`} aria-pressed={s === st} data-intent={st}>{st === "INTENDS" ? (s === st ? "I plan to do this ✓" : "I plan to do this") : (s === st ? "I did this ✓ (self-reported)" : "I did this (self-reported)")}</button></form>))}
                    {s && <form action={actionIntentAction}><input type="hidden" name="slug" value={c.slug} /><input type="hidden" name="actionId" value={a.id} /><input type="hidden" name="status" value="" /><button className="btn btn-sm btn-ghost" data-intent="WITHDRAW">Withdraw</button></form>}
                  </div>
                </li>); })}</ul>
              <p className="mt-2 text-sm text-mute">Nothing is required of you: no receipts, screenshots or purchase records are asked for or stored. Only you can see what you chose, and you can withdraw at any time.</p></>))
              : <p className="mt-3 text-mute">{closed ? "This campaign is closed, so no new participation is recorded." : "Participation is not available for this page."}</p>}
          </section>

          <section aria-labelledby="out-h" data-testid="outcomes"><h2 id="out-h" className="heading text-2xl">Evidence and outcomes</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="panel p-4"><h3 className="label">Participation signals</h3><p className="mt-1 text-sm">{c.counts.following} following · {c.counts.interested} interested · {c.actions.reduce((n, a) => n + a.completedSelfReported, 0)} self-reported completions across actions.</p><p className="mt-1 text-xs text-mute">Self-reported and unverified. These numbers say nothing about the effect on any organization.</p></div>
              <div className="panel p-4"><h3 className="label">Documented responses</h3>{by("DOCUMENTED_RESPONSE").length ? <ul className="mt-1 space-y-2">{by("DOCUMENTED_RESPONSE").map((o, n) => <li key={n}><p className="text-sm">{o.body}</p><Provenance p={{ cls: "EXTERNAL_SOURCE_LINK", source: { title: o.sourceTitle, url: o.sourceUrl } }} /><p className="text-xs text-mute">{outcomeEvidenceLabel({ kind: "DOCUMENTED_RESPONSE", sourceUrl: o.sourceUrl, sourceTitle: o.sourceTitle })}</p></li>)}</ul> : <p className="mt-1 text-sm text-mute">None recorded.</p>}</div>
              <div className="panel p-4"><h3 className="label">Observed outcomes</h3>{by("OBSERVED_OUTCOME").length ? <ul className="mt-1 space-y-2">{by("OBSERVED_OUTCOME").map((o, n) => <li key={n}><p className="text-sm">{o.body}</p><Provenance p={{ cls: "EXTERNAL_SOURCE_LINK", source: { title: o.sourceTitle, url: o.sourceUrl } }} /><p className="text-xs text-mute">{outcomeEvidenceLabel({ kind: "OBSERVED_OUTCOME", sourceUrl: o.sourceUrl, sourceTitle: o.sourceTitle })}</p></li>)}</ul> : <p className="mt-1 text-sm text-mute">None recorded.</p>}</div>
              <div className="panel p-4"><h3 className="label">{OUTCOME_KINDS.UNVERIFIED_CLAIM}</h3>{by("UNVERIFIED_CLAIM").length ? <ul className="mt-1 space-y-2">{by("UNVERIFIED_CLAIM").map((o, n) => <li key={n}><p className="text-sm">{o.body}</p><p className="text-xs text-mute">{outcomeEvidenceLabel({ kind: "UNVERIFIED_CLAIM", sourceUrl: "", sourceTitle: "" })}</p></li>)}</ul> : <p className="mt-1 text-sm text-mute">None.</p>}</div>
            </div></section>

          <section aria-labelledby="upd-h"><h2 id="upd-h" className="heading text-2xl">Updates</h2>
            {c.updates.length === 0 ? <p className="mt-3 text-mute">No updates yet.</p> : <ul className="mt-4 divide-y divide-hair border-y border-hair">{c.updates.map((u, n) => <li key={n} className="py-3"><p className="whitespace-pre-line">{u.body}</p><Provenance p={{ cls: "ORGANIZER_PROVIDED", asOf: u.createdAt }} /></li>)}</ul>}</section>

          <section aria-labelledby="org-h" data-testid="organizer-signals"><h2 id="org-h" className="heading text-2xl">About the organizer</h2><p className="mt-3 text-lg font-semibold">{c.organizerDisplayName}</p><ul className="mt-1 text-sm text-mute">{signalLines(c.organizerSignals).map((l) => <li key={l}>{l}</li>)}</ul></section>
          <NeutralityNote kind="campaign" />
          {!isOwner && c.moderation === "OK" && <ReportForm type="CAMPAIGN" slug={c.slug} />}
        </div>
      </main>
      <Footer />
    </>
  );
}
