import Link from "next/link";
import { notFound } from "next/navigation";
import { Tracker } from "@/components/client";
import { Footer, Header } from "@/components/chrome";
import { EmptyState } from "@/components/empty";
import { IssueCard } from "@/components/hill";
import { ISSUE_CATEGORIES } from "@/lib/engine/issues";
import { findYourHillEnabled } from "@/lib/flags";
import { listIssuePlaces, searchIssues } from "@/lib/issues";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find Your Hill", description: "Find the issue. Understand the facts. Decide what matters to you." };

type SP = { q?: string; state?: string; city?: string; category?: string; nationwide?: string };
export default async function FindYourHill({ searchParams }: { searchParams: Promise<SP> }) {
  if (!findYourHillEnabled()) notFound();
  const sp = await searchParams;
  const places = await listIssuePlaces();
  const hits = await searchIssues({ q: sp.q, state: sp.state || undefined, city: sp.city || undefined, category: sp.category || undefined, nationwide: sp.nationwide === "on" });
  const searched = !!(sp.q || sp.state || sp.city || sp.category || sp.nationwide);
  return (
    <>
      <Header />
      {searched && <Tracker name="ISSUE_SEARCHED" props={{ state: sp.state ?? "", city: sp.city ?? "", category: sp.category ?? "" }} />}
      <main id="main" className="mx-auto max-w-5xl px-4 pb-10 pt-6 sm:px-8">
        <h1 className="display text-[clamp(2.5rem,9.8vw,5.3rem)]">Find your hill.</h1>
        <p className="mt-3 max-w-2xl text-lg text-mute">Find the issue. Understand the facts. Decide what matters to you. Each issue page shows its sources, the different perspectives, what is disputed and what is not yet known. You can read everything without an account.</p>
        <form method="get" className="panel mt-6 grid gap-3 p-4 sm:grid-cols-3" role="search" aria-label="Search issues">
          <label className="sm:col-span-3">Search<input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="A topic, place or keyword" className="field !min-h-11" /></label>
          <label>State<select name="state" defaultValue={sp.state ?? ""} className="field !min-h-11"><option value="">All</option>{places.states.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>City<select name="city" defaultValue={sp.city ?? ""} className="field !min-h-11"><option value="">All</option>{places.cities.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Topic<select name="category" defaultValue={sp.category ?? ""} className="field !min-h-11"><option value="">All</option>{Object.entries(ISSUE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <div className="flex items-end gap-4 sm:col-span-3"><label className="flex items-center gap-2 pb-3"><input type="checkbox" name="nationwide" defaultChecked={sp.nationwide === "on"} className="size-5" /> Nationwide issues only</label><button className="btn">Search</button></div>
        </form>
        <p className="mt-3 text-sm text-mute">Results are ordered by how well they match your search, whether they cover your place, how recently the information was checked, and how well documented the sources are. They are not ordered by popularity, and nothing about you is used.</p>
        {hits.length === 0 ? (
          <div className="mt-8"><EmptyState glyph="route" title={searched ? "No issue matches yet" : "No issues are published yet"}>{searched ? "Try fewer words or a wider place. " : ""}Issues appear here only after a person has checked their sources. <Link className="underline" href="/issues/suggest">Suggest an issue</Link> for review.</EmptyState></div>
        ) : (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2" aria-label="Issues">{hits.map((h) => <IssueCard key={h.issue.slug} i={h.issue} protests={h.protests} campaigns={h.campaigns} />)}</ul>
        )}
        <p className="mt-8 text-sm text-mute">Missing something? <Link className="underline" href="/issues/suggest">Suggest an issue</Link>. A person reviews every suggestion; nothing is published automatically.</p>
      </main>
      <Footer />
    </>
  );
}
