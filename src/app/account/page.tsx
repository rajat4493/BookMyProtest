import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { Footer, Header } from "@/components/chrome";
import { EmptyState } from "@/components/empty";
import { getAnonId, getUser } from "@/lib/auth";
import { computePlan, formatDate } from "@/lib/plan";
import { eventsFor } from "@/lib/store";
import { getOwnerProtest } from "@/lib/protests";

export const dynamic = "force-dynamic";
export const metadata = { title: "My plans" };

export default async function Account() {
  const user = await getUser();
  if (!user) redirect("/login?next=/account");
  const events = await eventsFor(await getAnonId(), user.id);
  const cards = await Promise.all(events.map(async (e) => ({ e, pct: (await computePlan(e)).readiness.pct, pub: (await getOwnerProtest(e.id))?.protest ?? null })));
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-4xl px-4 pb-10 pt-8 sm:px-8">
        <h1 className="display text-[clamp(2.5rem,9.8vw,5.3rem)]">My plans</h1>
        <p className="mt-2 text-mute">{user.email}</p>
        {cards.length === 0 ? (
          <div className="mt-8"><EmptyState glyph="documents" title="No plans yet" action={{ href: "/plan", label: "Plan a protest" }}>Start one and it will be saved here, with its checklist progress.</EmptyState></div>
        ) : (
          <ul className="mt-8 grid gap-3">
            {cards.map(({ e, pct, pub }) => (
              <li key={e.id}>
                <Link href={`/plan/${e.id}`} className="tile-quiet flex items-center justify-between gap-4 bg-paper p-5">
                  <span><span className="heading block text-xl">{e.name}</span><span className="text-mute">{formatDate(e.date)}</span></span>
                  <span className="numeral text-5xl" aria-label={`${pct} percent of checklist done`}>{pct}<span className="text-xl">%</span></span>
                </Link>
                <p className="mt-1 text-sm text-mute">{pub ? <>Public page: {pub.visibility.toLowerCase()} · <Link className="underline" href={`/plan/${e.id}/publish`}>manage</Link> · <Link className="underline" href={`/protests/${pub.slug}`}>view</Link></> : <Link className="underline" href={`/plan/${e.id}/publish`}>Create a public page</Link>}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/plan" className="btn btn-ghost">New plan</Link>
          <form action={logoutAction}><button className="btn btn-ghost">Sign out</button></form>
        </div>
      </main>
      <Footer />
    </>
  );
}
