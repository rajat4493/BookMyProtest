import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { toggleOfferAction, toggleSupportAction } from "@/app/actions";
import { Tracker } from "@/components/client";
import { Footer, Header } from "@/components/chrome";
import { Fact, Provenance } from "@/components/provenance";
import { ShareButton, TrackedLink } from "@/components/protest-bits";
import { TransparencyFooter } from "@/components/transparency";
import { getUser } from "@/lib/auth";
import { provenanceLabel } from "@/lib/engine/provenance";
import { SUPPORT_KIND_LABEL, SUPPORT_KINDS, SUPPORT_TYPES } from "@/lib/engine/public-protest";
import { formatDate } from "@/lib/plan";
import { getPublicProtest, listUpdates, officialInfoForSlug, otherListedSameDate, viewerState } from "@/lib/protests";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getPublicProtest(slug, { userId: (await getUser())?.id ?? null });
  if (!found) return { title: "Protest not found", robots: { index: false } };
  const p = found.protest;
  return {
    title: `${p.title} · ${formatDate(p.date)}`,
    description: p.summary || `A public gathering listed by ${p.organizerDisplayName}. Details are provided by the organizer.`,
    robots: p.visibility === "PUBLIC" && p.moderation === "OK" ? undefined : { index: false },
    openGraph: { title: p.title, description: p.summary || undefined, type: "website" },
  };
}

export default async function ProtestPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await getUser();
  const found = await getPublicProtest(slug, { userId: user?.id ?? null });
  if (!found) notFound();
  const { protest: p, isOwner, hiddenNotice } = found;
  const [updates, others, official, mine] = await Promise.all([listUpdates(slug), otherListedSameDate(slug), officialInfoForSlug(slug), viewerState(slug, user?.id ?? null)]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const url = `${origin}/protests/${p.slug}`;
  const dims = { city: p.city, state: p.state, category: p.category, date: p.date, organizerType: p.organizerType ?? "", visibility: p.visibility, permissionStatus: p.permission.status };
  const cancelled = p.visibility === "CANCELLED";
  const canAct = !cancelled && p.moderation === "OK" && (p.visibility === "PUBLIC" || p.visibility === "UNLISTED");
  const N = p.counts;

  return (
    <>
      {!isOwner && <Tracker name="PUBLIC_PAGE_VIEWED" props={dims} />}
      <Header />
      <main id="main">
        {(hiddenNotice || cancelled || sp.error) && (
          <div className="mx-auto max-w-5xl space-y-3 px-4 pt-2 sm:px-8">
            {hiddenNotice && <p className="card p-4" role="status" data-testid="owner-notice">{hiddenNotice} <Link className="underline" href="/account">Manage in your account</Link>.</p>}
            {cancelled && <p className="card p-4" role="status" data-testid="cancelled">The organizer has cancelled this event.</p>}
            {sp.error && <p role="alert" className="card p-4 font-semibold">{sp.error}</p>}
          </div>
        )}

        <div className="on-ink bg-ink text-paper">
          <div className="mx-auto max-w-5xl px-4 pb-10 pt-8 sm:px-8">
            <p className="label text-paper/60">{p.categoryLabel} · Public listing</p>
            <h1 className="heading mt-2 text-3xl sm:text-5xl" data-testid="protest-title">{p.title}</h1>
            {p.summary && <p className="mt-3 max-w-2xl text-lg text-paper/85">{p.summary}</p>}
            <dl className="mt-6 grid gap-x-8 gap-y-3 border-t border-paper/20 pt-4 sm:grid-cols-3">
              <div><dt className="label text-paper/55">When</dt><dd>{formatDate(p.date)}, {p.startTime}–{p.endTime}</dd></div>
              <div><dt className="label text-paper/55">Where</dt><dd>{[p.venue, p.city, p.state].filter(Boolean).join(", ")}</dd></div>
              <div><dt className="label text-paper/55">Organizer</dt><dd>{p.organizerDisplayName}</dd></div>
            </dl>
            <div className="mt-5 border-t border-paper/20 pt-4" data-testid="permission-status" data-status={p.permission.status}>
              <p className="label text-paper/55">Permission status</p>
              <p className="mt-0.5 text-xl font-extrabold">{p.permission.label}</p>
              <span className="block text-xs text-paper/60" data-provenance={p.permission.provenance.cls}>{p.permission.provenance.cls === "UNKNOWN" ? "Source not stated" : provenanceLabel(p.permission.provenance)}</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3"><ShareButton title={p.title} url={url} dims={dims} onInk /></div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-8">
          <section aria-labelledby="why-h">
            <h2 id="why-h" className="heading text-2xl">Why this protest</h2>
            <p className="mt-3 max-w-3xl whitespace-pre-line text-lg">{p.description || p.summary || "The organizer has not added a description yet."}</p>
            <Provenance p={{ cls: "ORGANIZER_PROVIDED", asOf: p.updatedAt }} className="mt-2" />
          </section>

          <section aria-labelledby="details-h">
            <h2 id="details-h" className="heading text-2xl">Event details</h2>
            <dl className="mt-4 grid gap-6 sm:grid-cols-2">
              <Fact label="Time" value={`${p.startTime}–${p.endTime}`} p={{ cls: "ORGANIZER_PROVIDED", asOf: p.updatedAt }} />
              <Fact label="Venue" value={p.venue || "Not stated"} p={{ cls: "ORGANIZER_PROVIDED", asOf: p.updatedAt }} />
              <Fact label="City / state" value={[p.city, p.state].filter(Boolean).join(", ")} p={{ cls: "ORGANIZER_PROVIDED", asOf: p.updatedAt }} />
              <Fact label="Format" value={p.expectedFormat === "march" ? "March" : "Static gathering"} p={{ cls: "ORGANIZER_PROVIDED", asOf: p.updatedAt }} />
              {p.organizerType && <Fact label="Organizing as" value={p.organizerType.replace(/^./, (c) => c.toUpperCase())} p={{ cls: "ORGANIZER_PROVIDED", asOf: p.updatedAt }} />}
              {p.logistics && <Fact label="Public logistics" value={<span className="whitespace-pre-line font-normal">{p.logistics}</span>} p={{ cls: "ORGANIZER_PROVIDED", asOf: p.updatedAt }} />}
            </dl>
          </section>

          <section aria-labelledby="status-h" data-testid="status-section">
            <h2 id="status-h" className="heading text-2xl">Status</h2>
            <dl className="mt-4 grid gap-6 sm:grid-cols-2">
              <Fact label="Permission" value={p.permission.label} p={p.permission.provenance} />
              <Fact label="Page last updated" value={formatDate(p.updatedAt.slice(0, 10))} p={{ cls: "SYSTEM_DERIVED" }} />
            </dl>
            <p className="mt-3 max-w-2xl text-sm text-mute">Permission decisions are made by the authorities. This status is what the organizer reports; BookMyProtest does not check or confirm it.</p>
            {others.length > 0 && (
              <div className="panel mt-4 p-4" data-testid="other-protests">
                <p className="font-semibold">Other public protests are listed for this date.</p>
                <ul className="mt-2 text-sm">{others.map((o) => <li key={o.slug}><Link className="underline" href={`/protests/${o.slug}`}>{o.title}</Link> · {o.startTime}–{o.endTime}</li>)}</ul>
                <p className="mt-2 text-sm text-mute">A listing is not an approval, and this says nothing about the venue&rsquo;s official availability or capacity.</p>
              </div>
            )}
          </section>

          {official && (official.links.length > 0 || official.guidance.length > 0) && (
            <section aria-labelledby="official-h" data-testid="official-info">
              <h2 id="official-h" className="heading text-2xl">Official information</h2>
              <p className="mt-2 max-w-2xl text-sm text-mute">Information from official sources held by BookMyProtest{official.checkedOn ? `, checked on ${formatDate(official.checkedOn)}` : ""}. It is information, not authorization, and it may have changed: check the sources.</p>
              {official.guidance.length > 0 && (
                <ul className="mt-4 divide-y divide-hair border-y border-hair">
                  {official.guidance.map((g) => (
                    <li key={g.title} className="py-3"><span className="font-semibold">{g.title}.</span> {g.text}
                      <Provenance p={{ cls: "BOOKMYPROTEST_SOURCE_CHECKED", asOf: official.checkedOn, source: { title: g.source } }} /></li>
                  ))}
                </ul>
              )}
              {official.links.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {official.links.map((l) => (
                    <li key={l.url}><TrackedLink href={l.url} event="OFFICIAL_LINK_CLICKED" dims={dims} className="font-semibold underline underline-offset-2">{l.label === "Official source" ? l.title : l.label}</TrackedLink>
                      <Provenance p={{ cls: "OFFICIAL_SOURCE_LINK", source: { title: l.title, section: l.section } }} /></li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section aria-labelledby="support-h" data-testid="support">
            <h2 id="support-h" className="heading text-2xl">Support</h2>
            <p className="mt-2 text-sm text-mute" data-testid="support-counts">{N.following} following · {N.interested} interested · {N.planning} planning to attend</p>
            {canAct ? (
              <>
                <div className="mt-4 flex flex-wrap gap-3">
                  {SUPPORT_KINDS.map((k) => {
                    const on = mine.kinds.includes(k);
                    return (
                      <form key={k} action={toggleSupportAction}><input type="hidden" name="slug" value={p.slug} /><input type="hidden" name="kind" value={k} />
                        <button className={`btn ${on ? "btn-accent" : ""}`} aria-pressed={on} data-kind={k}>{on ? `${SUPPORT_KIND_LABEL[k].on} ✓` : SUPPORT_KIND_LABEL[k].off}</button></form>
                    );
                  })}
                </div>
                <p className="mt-2 text-sm text-mute">{user ? "Click again to undo. Only you can see what you chose; the organizer sees totals only." : "You can read everything without an account. Signing in is needed to follow or mark interest; the organizer only ever sees totals."} This is not registration.</p>
              </>
            ) : <p className="mt-3 text-mute">Support actions are not available for this page.</p>}
            {canAct && p.supportOptions.length > 0 && (
              <ul className="mt-6 divide-y divide-hair border-y border-hair" aria-label="Ways to help">
                {p.supportOptions.map((o) => {
                  const on = mine.offers.includes(o.type);
                  return (
                    <li key={o.type} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <span><span className="font-semibold">{SUPPORT_TYPES[o.type]}</span>{N.offers[o.type] ? <span className="text-mute"> · {N.offers[o.type]} can help</span> : null}
                        {o.note && <span className="block text-sm text-mute">{o.note}</span>}
                        {o.link && <span className="block text-sm"><TrackedLink href={o.link} event="SUPPORT_ACTION_CLICKED" dims={{ ...dims, supportType: o.type }} className="underline">External link</TrackedLink> <span className="text-mute">(supplied by the organizer)</span></span>}</span>
                      <form action={toggleOfferAction}><input type="hidden" name="slug" value={p.slug} /><input type="hidden" name="type" value={o.type} />
                        <button className={`btn btn-sm ${on ? "btn-accent" : "btn-ghost"}`} aria-pressed={on}>{on ? "I can help ✓" : "I can help"}</button></form>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="updates-h">
            <h2 id="updates-h" className="heading text-2xl">Updates</h2>
            {updates.length === 0 ? <p className="mt-3 text-mute">No updates yet.</p> : (
              <ul className="mt-4 divide-y divide-hair border-y border-hair">
                {updates.map((u, i) => <li key={i} className="py-3"><p className="whitespace-pre-line">{u.body}</p><Provenance p={{ cls: "ORGANIZER_PROVIDED", asOf: u.createdAt }} /></li>)}
              </ul>
            )}
          </section>

          <TransparencyFooter />
        </div>
      </main>
      <Footer />
    </>
  );
}
