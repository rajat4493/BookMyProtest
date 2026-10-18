import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer, Header } from "@/components/chrome";
import { EmptyState } from "@/components/empty";
import { getAnonId, getUser } from "@/lib/auth";
import { myCampaignActivity, myCampaigns } from "@/lib/digital-actions";
import { findYourHillEnabled, hitWhereItHurtsEnabled } from "@/lib/flags";
import { myFollowedIssues } from "@/lib/issues";
import { eventsFor } from "@/lib/store";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "My activity", robots: { index: false } };

/** Only the signed-in person's own activity. Nobody else's is ever listed here. */
export default async function Activity() {
  if (!findYourHillEnabled() && !hitWhereItHurtsEnabled()) notFound();
  const user = await getUser();
  if (!user) redirect("/login?next=/activity");
  const [issues, joined, mine, plans] = await Promise.all([findYourHillEnabled() ? myFollowedIssues(user.id) : [], hitWhereItHurtsEnabled() ? myCampaignActivity(user.id) : [], hitWhereItHurtsEnabled() ? myCampaigns(user.id) : [], eventsFor(await getAnonId(), user.id)]);
  const List = ({ rows, href, empty }: { rows: any[]; href: (r: any) => string; empty: string }) => rows.length ? <ul className="mt-2 space-y-1">{rows.map((r) => <li key={r.slug}><Link className="underline" href={href(r)}>{r.title}</Link></li>)}</ul> : <p className="mt-2 text-mute">{empty}</p>;
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:px-8">
        <h1 className="display text-[clamp(2.5rem,9vw,5rem)]">My activity.</h1>
        <p className="mt-2 text-mute">{user.email}. This page is only for you.</p>
        {findYourHillEnabled() && <section className="mt-8" aria-labelledby="fi-h"><h2 id="fi-h" className="heading text-xl">Issues I follow</h2><List rows={issues} href={(r) => `/issues/${r.slug}`} empty="You are not following any issue." /></section>}
        {hitWhereItHurtsEnabled() && <>
          <section className="mt-8" aria-labelledby="jc-h"><h2 id="jc-h" className="heading text-xl">Digital actions I joined</h2><List rows={joined} href={(r) => `/actions/${r.slug}`} empty="You have not joined a digital action." /></section>
          <section className="mt-8" aria-labelledby="mc-h"><h2 id="mc-h" className="heading text-xl">Digital actions I organize</h2><List rows={mine} href={(r) => `/actions/${r.slug}/manage`} empty="You have not created one." /></section></>}
        <section className="mt-8" aria-labelledby="mp-h"><h2 id="mp-h" className="heading text-xl">My protest plans</h2>{plans.length ? <ul className="mt-2 space-y-1">{plans.map((e) => <li key={e.id}><Link className="underline" href={`/plan/${e.id}`}>{e.name}</Link></li>)}</ul> : <div className="mt-2"><EmptyState glyph="documents" title="No plans yet" action={{ href: "/plan", label: "Plan a protest" }}>Start one and it will be saved here.</EmptyState></div>}</section>
      </main>
      <Footer />
    </>
  );
}
