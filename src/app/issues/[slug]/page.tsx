import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { followIssueAction } from "@/app/actions-hill";
import { resendVerificationAction } from "@/app/actions";
import { Tracker } from "@/components/client";
import { Footer, Header } from "@/components/chrome";
import { NeutralityNote, ReportForm, CampaignCard } from "@/components/hill";
import { Provenance } from "@/components/provenance";
import { getUser } from "@/lib/auth";
import { correctionsFor } from "@/lib/content-moderation";
import { SOURCE_KINDS } from "@/lib/engine/issues";
import { findYourHillEnabled, hitWhereItHurtsEnabled } from "@/lib/flags";
import { formatDate } from "@/lib/plan";
import { campaignsForIssue } from "@/lib/digital-actions";
import { getIssue, isFollowingIssue, issueIdFor, protestsForIssue } from "@/lib/issues";
import { isEmailVerified } from "@/lib/verification";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  if (!findYourHillEnabled()) return { title: "Not found", robots: { index: false } };
  const i = await getIssue((await params).slug);
  return i ? { title: i.title, description: i.summary, openGraph: { title: i.title, description: i.summary } } : { title: "Issue not found", robots: { index: false } };
}

export default async function IssuePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; reported?: string }> }) {
  if (!findYourHillEnabled()) notFound();
  const { slug } = await params;
  const sp = await searchParams;
  const user = await getUser();
  const i = await getIssue(slug, user?.role === "admin");
  if (!i) notFound();
  const [protests, campaigns, following, verified, id] = await Promise.all([protestsForIssue(slug), hitWhereItHurtsEnabled() ? campaignsForIssue(slug) : Promise.resolve([]), isFollowingIssue(slug, user?.id ?? null), isEmailVerified(user?.id), issueIdFor(slug)]);
  const corrections = id ? await correctionsFor("ISSUE", id) : [];
  const place = i.scopeLevel === "NATIONAL" ? "Nationwide" : [i.city, i.state].filter(Boolean).join(", ");
  return (
    <>
      <Tracker name="ISSUE_VIEWED" props={{ city: i.city, state: i.state, category: i.category }} />
      <Header />
      <main id="main">
        {(i.status !== "PUBLISHED" || i.moderation !== "OK") && <p className="mx-auto max-w-5xl px-4 pt-2 sm:px-8"><span className="card block p-4" role="status">Admin preview: this issue is {i.status.toLowerCase()} / {i.moderation.toLowerCase()} and not visible to the public.</span></p>}
        {(sp.error || sp.reported) && (
          <div className="mx-auto max-w-5xl space-y-3 px-4 pt-2 sm:px-8">
            {sp.reported && <p className="card p-4" role="status" data-testid="report-received">{sp.reported === "already" ? "You have already reported this page. A person will review it." : "Thank you. Your report was received and a person will review it. Reports do not hide a page automatically."}</p>}
            {sp.error && <p role="alert" className="card p-4 font-semibold">{sp.error}</p>}
          </div>)}
        <div className="on-ink bg-ink text-paper">
          <div className="mx-auto max-w-5xl px-4 pb-10 pt-8 sm:px-8">
            <p className="label text-paper/60">{i.categoryLabel} · {place} · Issue</p>
            <h1 className="heading mt-2 text-3xl sm:text-5xl" data-testid="issue-title">{i.title}</h1>
            <p className="mt-3 max-w-2xl text-lg text-paper/85">{i.summary}</p>
            <p className="mt-4 text-sm text-paper/70" data-testid="last-checked">Information last checked {i.lastCheckedOn ? formatDate(i.lastCheckedOn) : "(date not stated)"} · {i.sources.length} source{i.sources.length === 1 ? "" : "s"} · {i.followers} following</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {user && !verified ? <form action={resendVerificationAction}><input type="hidden" name="next" value={`/issues/${i.slug}`} /><button className="btn btn-ghost !border-paper !text-paper">Confirm your email to follow</button></form>
                : <form action={followIssueAction}><input type="hidden" name="slug" value={i.slug} /><button className={`btn ${following ? "btn-accent" : "btn-ghost !border-paper !text-paper"}`} aria-pressed={following} data-testid="follow-issue">{following ? "Following ✓" : "Follow this issue"}</button></form>}
              <a className="btn btn-ghost !border-paper !text-paper" href="#explore">Explore actions</a>
              {hitWhereItHurtsEnabled() && <Link className="btn btn-ghost !border-paper !text-paper" href={`/actions/new?issue=${i.slug}`} data-testid="create-campaign">Create a campaign</Link>}
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-8">
          {corrections.length > 0 && (
            <section aria-labelledby="corr-h" data-testid="corrections"><h2 id="corr-h" className="heading text-2xl">Corrections</h2>
              <ul className="mt-3 space-y-3">{corrections.map((c, n) => <li key={n} className="panel p-4"><p className="text-sm text-mute">Statement: &ldquo;{c.claim}&rdquo;</p><p className="mt-1 font-semibold">{c.correction}</p>{c.sourceUrl && <Provenance p={{ cls: "EXTERNAL_SOURCE_LINK", source: { title: "Correction source", url: c.sourceUrl } }} />}<p className="text-xs text-mute">Added {formatDate(c.createdAt.slice(0, 10))} after review</p></li>)}</ul></section>)}
          <section aria-labelledby="what-h"><h2 id="what-h" className="heading text-2xl">What this is</h2><p className="mt-3 max-w-3xl whitespace-pre-line text-lg">{i.description}</p></section>
          <section aria-labelledby="why-h"><h2 id="why-h" className="heading text-2xl">Why it is being discussed</h2><p className="mt-3 max-w-3xl whitespace-pre-line text-lg">{i.whyDiscussed}</p></section>
          <section aria-labelledby="src-h" data-testid="sources"><h2 id="src-h" className="heading text-2xl">Evidence and sources</h2>
            <ul className="mt-4 divide-y divide-hair border-y border-hair">{i.sources.map((s) => (
              <li key={s.url} className="py-3"><span className="label text-mute">{SOURCE_KINDS[s.kind]?.label}{s.publisher ? ` · ${s.publisher}` : ""}{s.publishedOn ? ` · ${formatDate(s.publishedOn)}` : ""}</span>
                <p className="font-semibold"><a className="underline underline-offset-2" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></p>
                {s.note && <p className="text-sm text-mute">{s.note}</p>}
                <Provenance p={{ cls: s.kind === "OFFICIAL_RECORD" ? "OFFICIAL_SOURCE_LINK" : "EXTERNAL_SOURCE_LINK", source: { title: s.publisher || s.title } }} /></li>))}</ul>
            <p className="mt-2 text-sm text-mute">A source being listed does not mean BookMyProtest agrees with it. Read the originals.</p></section>
          {i.perspectives.length > 0 && <section aria-labelledby="persp-h" data-testid="perspectives"><h2 id="persp-h" className="heading text-2xl">Different perspectives</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">{i.perspectives.map((p, n) => <li key={n} className="panel p-4"><p className="font-semibold">{p.label}</p><p className="mt-1">{p.summary}</p>{p.sourceUrl && <Provenance p={{ cls: "EXTERNAL_SOURCE_LINK", source: { title: "Source for this view", url: p.sourceUrl } }} />}</li>)}</ul></section>}
          {i.disputedClaims.length > 0 && <section aria-labelledby="disp-h" data-testid="disputed"><h2 id="disp-h" className="heading text-2xl">Disputed claims</h2>
            <ul className="mt-4 space-y-3">{i.disputedClaims.map((c, n) => <li key={n} className="panel p-4"><p className="font-semibold">&ldquo;{c.claim}&rdquo;</p><p className="mt-1">Disputed: {c.dispute}</p>{c.sourceUrl && <Provenance p={{ cls: "EXTERNAL_SOURCE_LINK", source: { title: "Source", url: c.sourceUrl } }} />}</li>)}</ul></section>}
          {i.developments.length > 0 && <section aria-labelledby="dev-h"><h2 id="dev-h" className="heading text-2xl">Recent developments</h2>
            <ul className="mt-4 divide-y divide-hair border-y border-hair">{[...i.developments].sort((a, b) => b.date.localeCompare(a.date)).map((d, n) => <li key={n} className="py-3"><span className="label text-mute">{formatDate(d.date)}</span><p>{d.text}</p><Provenance p={{ cls: "EXTERNAL_SOURCE_LINK", source: { title: d.sourceTitle, url: d.sourceUrl } }} /></li>)}</ul></section>}
          <section aria-labelledby="unk-h" data-testid="unknowns"><h2 id="unk-h" className="heading text-2xl">What remains unknown</h2><p className="mt-3 max-w-3xl whitespace-pre-line text-lg">{i.unknowns}</p></section>

          <section id="explore" aria-labelledby="explore-h" data-testid="explore"><h2 id="explore-h" className="heading text-2xl">Explore</h2>
            <h3 className="heading mt-4 text-lg">Related public protests</h3>
            {protests.length ? <ul className="mt-2">{protests.map((p: any) => <li key={p.slug}><Link className="underline" href={`/protests/${p.slug}`}>{p.title}</Link> · {formatDate(p.d)} · {p.city}</li>)}</ul> : <p className="mt-2 text-mute">No public protest is linked to this issue yet. An issue stands on its own; you do not need a protest to understand it.</p>}
            {hitWhereItHurtsEnabled() && (<>
              <h3 className="heading mt-4 text-lg">Related digital actions</h3>
              {campaigns.length ? <ul className="mt-2 grid gap-3 sm:grid-cols-2">{campaigns.map((c) => <CampaignCard key={c.slug} c={c} />)}</ul> : <p className="mt-2 text-mute" data-testid="no-campaigns">No digital action exists for this issue yet.</p>}
              <p className="mt-3"><Link className="btn btn-secondary" href={`/actions/new?issue=${i.slug}`}>Create an organizer-led campaign</Link></p></>)}
            <p className="mt-3 text-sm text-mute">Organizing a gathering? <Link className="underline" href="/plan">Plan your protest</Link> and link its public page to this issue.</p>
          </section>
          <NeutralityNote kind="issue" />
          <ReportForm type="ISSUE" slug={i.slug} />
        </div>
      </main>
      <Footer />
    </>
  );
}
