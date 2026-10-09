import Link from "next/link";
import { recheckPlanAction } from "@/app/actions";
import { Footer, TrustNote, Wordmark } from "@/components/chrome";
import { Score, SubmitButton, Tracker } from "@/components/client";
import { EmptyState } from "@/components/empty";
import { Arrow, Glyph } from "@/components/icons";
import { RequirementRow } from "@/components/requirement";
import { getUser } from "@/lib/auth";
import { headline } from "@/lib/engine/readiness";
import { addDays, isActionable } from "@/lib/engine/evaluate";
import { PLANNING_BUFFER_DAYS, daysUntil, formatDate, loadPlan, LEVEL_LABEL } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your readiness" };

const CAT_LABEL = { permissions: "Permissions", documents: "Documents", logistics: "Logistics", safety: "Safety" } as const;

export default async function Dashboard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rechecked?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { event, city, cityLabel, items, readiness: r, evaluation, rulesChanged, overlays, verifiedOn } = await loadPlan(id);
  const user = await getUser();
  const a = event.answers;
  const h = headline(r);
  const open = items.filter((i) => isActionable(i) && !i.done);
  const done = items.filter((i) => isActionable(i) && i.done);
  const notes = items.filter((i) => !isActionable(i));
  const next = r.blockers[0] ?? r.required[0] ?? r.recommended[0];
  const target = addDays(event.date, -PLANNING_BUFFER_DAYS);
  const toEvent = daysUntil(event.date);
  const toTarget = daysUntil(target);
  const critDeadlines = open.filter((i) => i.deadline && i.rule.severity !== "RECOMMENDED").sort((x, y) => x.deadline!.localeCompare(y.deadline!));
  const returning = Date.now() - Date.parse(event.createdAt) > 60 * 60 * 1000;

  const groups = [
    { key: "CRITICAL", title: "Critical", sub: "These block everything else.", items: open.filter((i) => i.rule.severity === "CRITICAL") },
    { key: "REQUIRED", title: "Required", sub: "Expected for your plan.", items: open.filter((i) => i.rule.severity === "REQUIRED") },
    { key: "RECOMMENDED", title: "Recommended", sub: "Not mandatory, but you'll want them.", items: open.filter((i) => i.rule.severity === "RECOMMENDED") },
  ];

  return (
    <>
      <Tracker name="view_requirements" props={{ eventId: event.id }} />
      {returning && <Tracker name="return_visit" props={{ eventId: event.id }} />}
      <main id="main">
        <div className="on-ink bg-ink text-paper">
          <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8"><Wordmark invert /><Link href={user ? "/account" : "/"} className="label hover:underline">{user ? "My plans" : "Home"}</Link></header>
          <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-8 md:pb-14">
            <p className="label text-paper/60">Your assembly plan</p>
            <h1 className="heading mt-2 text-3xl sm:text-4xl">{event.name}</h1>
            <dl className="mt-5 grid gap-x-8 gap-y-3 border-t border-paper/20 pt-4 sm:grid-cols-[auto_auto_1fr] sm:justify-start">
              <div><dt className="label text-paper/55">Date</dt><dd>{formatDate(event.date)}</dd></div>
              <div><dt className="label text-paper/55">Time</dt><dd>{a.startTime}–{a.endTime}</dd></div>
              <div><dt className="label text-paper/55">Location</dt><dd>{a.startLocation}, {cityLabel}</dd></div>
            </dl>
            <div className="mt-8 grid items-end gap-6 md:grid-cols-[auto_1fr] md:gap-12">
              <Score value={r.pct} className="numeral rise text-[clamp(7.5rem,29vw,15rem)] text-accent" />
              <div className="rise pb-2 md:pb-5" style={{ "--i": 2 } as React.CSSProperties}>
                <p className="display text-[clamp(1.9rem,5.6vw,3.9rem)]">{h.title}</p>
                <p className="mt-3 text-lg text-paper/80">{h.sub}</p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link href={`/plan/${event.id}/pack`} className="btn btn-accent">Generate my preparation pack <Arrow /></Link>
                  <Link href={`/plan/${event.id}/vendors`} className="btn btn-ghost !border-paper/50 !text-paper hover:!bg-paper hover:!text-ink">Get quotes</Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl space-y-16 px-4 py-10 sm:px-8">
          {city?.isDevSeed && (
            <p className="panel p-4 text-sm" role="note"><span className="chip chip-note mr-2">Development sample</span>These requirements are placeholder data for testing and have not been verified. Do not rely on them.</p>
          )}
          {sp.rechecked && <p className="panel p-4 text-sm" role="status"><span className="chip chip-required mr-2">Rechecked</span>Your plan now uses the latest rules.</p>}
          {rulesChanged && (
            <aside className="panel flex flex-col gap-3 bg-paper-2 p-5 sm:flex-row sm:items-center sm:justify-between" role="note">
              <div><p className="heading text-lg">Rules have changed since this plan was generated.</p><p className="text-mute">Your checklist below still uses the earlier versions. Recheck to see what is current.</p></div>
              <form action={recheckPlanAction}><input type="hidden" name="eventId" value={event.id} /><SubmitButton className="btn btn-sm shrink-0" pending="Rechecking…">Recheck my plan</SubmitButton></form>
            </aside>
          )}
          {overlays.map((o) => (
            <aside key={o.restriction.id} className="card p-5" role="note">
              <p className="label">Temporary restriction may apply</p>
              <p className="heading mt-1 text-lg">{o.restriction.title}</p>
              <p className="mt-1 text-mute">{o.restriction.plainExplanation || "A time-limited order may affect your plans."} Affects: {o.matchedActivities.join(", ").toLowerCase()}.</p>
              <p className="mt-1 text-sm">{o.restriction.legalBasis && <>Basis: {o.restriction.legalBasis}. </>}Please verify with the relevant authority.</p>
            </aside>
          ))}
          {!user && (
            <aside className="panel flex flex-col gap-4 bg-paper-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="heading text-xl">Save your plan</p><p className="text-mute">Create a free account to keep it safe and come back from any device.</p></div>
              <Link href={`/signup?next=/plan/${event.id}`} className="btn btn-sm shrink-0">Save with an account</Link>
            </aside>
          )}

          {next && (
            <section aria-labelledby="next-h">
              <h2 id="next-h" className="label text-mute">Next action</h2>
              <a href={`#r-${next.rule.id}`} className="tile mt-3 flex items-center justify-between gap-4 bg-paper p-5">
                <span><span className="heading block text-xl sm:text-2xl">{next.rule.title}</span><span className="text-mute">{next.rule.description}</span></span>
                <Arrow className="shrink-0" />
              </a>
            </section>
          )}

          <section aria-labelledby="cats-h">
            <h2 id="cats-h" className="sr-only">Progress by category</h2>
            <div className="panel grid grid-cols-2 lg:grid-cols-4">
              {r.categories.map((c, i) => (
                <div key={c.category} className="rise border-hair p-4 sm:p-5 [&:nth-child(odd)]:border-r [&:nth-child(-n+2)]:border-b lg:[&:nth-child(-n+2)]:border-b-0 lg:border-r lg:[&:last-child]:border-r-0" style={{ "--i": i } as React.CSSProperties}>
                  <div className="flex items-center justify-between"><span className="label">{CAT_LABEL[c.category]}</span><Glyph name={c.category} width={20} height={20} className="text-mute" /></div>
                  {c.total === 0 ? (
                    <p className="mt-5 text-mute">Nothing configured for your plan.</p>
                  ) : (
                    <>
                      <p className="mt-4 text-3xl font-black tabular-nums sm:text-4xl">{c.done}<span className="text-mute"> / {c.total}</span></p>
                      <p className="label mt-1 text-mute">{c.done} of {c.total} complete</p>
                      <div className="mt-3 h-1 bg-paper-2" aria-hidden="true"><div className="bar-grow h-full bg-ink" style={{ width: `${c.pct ?? 0}%` }} /></div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="time-h">
            <h2 id="time-h" className="heading text-2xl sm:text-3xl">Timeline</h2>
            <div className="mt-6 grid gap-8 md:grid-cols-3 md:gap-0">
              <div className="md:pr-8">
                <p className="label text-mute">Application target date</p>
                <p className="heading mt-2 text-xl">{formatDate(target)}</p>
                <p className="mt-2 text-sm text-mute">{toTarget >= 0 ? `${toTarget} days from today.` : "This date has passed. Contact the authority as soon as you can."} Our suggested {PLANNING_BUFFER_DAYS}-day planning buffer, not a legal deadline.</p>
              </div>
              <div className="md:border-l md:border-hair md:px-8">
                <p className="label text-mute">Event date</p>
                <p className="heading mt-2 text-xl">{formatDate(event.date)}</p>
                <p className="mt-2 text-sm text-mute">{toEvent > 0 ? `${toEvent} days to go.` : toEvent === 0 ? "That's today." : "This date has passed."}</p>
              </div>
              <div className="md:border-l md:border-hair md:pl-8">
                <p className="label text-mute">Critical deadlines</p>
                {critDeadlines.length === 0 ? (
                  <div className="mt-2"><EmptyState bare glyph="route" title="No fixed deadlines on file">Ask the authority about notice periods. Dates appear here when a rule has one.</EmptyState></div>
                ) : (
                  <ul className="mt-2 space-y-2">{critDeadlines.slice(0, 4).map((i) => <li key={i.rule.id} className="text-sm"><span className="font-bold">{formatDate(i.deadline!)}</span> — {i.rule.title}</li>)}</ul>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="req-h" className="space-y-12">
            <div>
              <h2 id="req-h" className="heading text-2xl sm:text-3xl">What needs doing</h2>
              <p className="mt-2 text-mute">Based on currently configured local requirements for {cityLabel}.</p>
              <p className="mt-1 text-sm text-mute">Generated {formatDate(evaluation.evaluatedAt.slice(0, 10))} using {verifiedOn ? `rules verified on ${formatDate(verifiedOn)}` : "rules that have not yet been verified"}.</p>
            </div>
            {groups.filter((g) => g.items.length).map((g) => (
              <div key={g.key}>
                <div className="mb-4 flex flex-wrap items-baseline gap-3"><h3 className="heading text-xl">{g.title}</h3><span className="label text-mute">{g.items.length} · {g.sub}</span></div>
                <ul className={g.key === "RECOMMENDED" ? "border-t border-hair" : "space-y-3"}>{g.items.map((i) => <RequirementRow key={i.rule.id} item={i} eventId={event.id} />)}</ul>
              </div>
            ))}
            {open.length === 0 && (
              <EmptyState glyph="safety" title={items.some(isActionable) ? "Everything on your list is done" : "No requirements configured"}>
                {items.some(isActionable) ? "Verify details with the relevant authority before the day." : "We have nothing configured for this plan yet. Check with the relevant authority."}
              </EmptyState>
            )}
            {done.length > 0 && (
              <details>
                <summary className="heading cursor-pointer text-xl">Done <span className="text-mute">({done.length})</span></summary>
                <ul className="mt-4 space-y-3">{done.map((i) => <RequirementRow key={i.rule.id} item={i} eventId={event.id} />)}</ul>
              </details>
            )}
            {notes.length > 0 && (
              <details>
                <summary className="heading cursor-pointer text-xl">Other notes <span className="text-mute">({notes.length})</span></summary>
                <ul className="mt-4 border-t border-hair">
                  {notes.map((i) => (
                    <li key={i.rule.id} className="border-b border-hair py-4"><p className="heading text-lg">{i.rule.title} <span className="label ml-2 text-mute">{LEVEL_LABEL[i.level]}</span></p><p className="mt-1 text-sm text-mute">{i.rule.description}</p><p className="mt-1 text-sm">Please verify with the relevant authority.</p></li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <TrustNote />
        </div>
      </main>
      <Footer />
    </>
  );
}
