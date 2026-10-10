import Link from "next/link";
import { Footer, Header } from "@/components/chrome";
import { EmptyState } from "@/components/empty";
import { ProtestCard } from "@/components/protest-card";
import { CATEGORIES } from "@/lib/engine/public-protest";
import { listPlaces, listProtests } from "@/lib/protests";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discover public protests", description: "Public listings by organizers. A listing is not an approval or an endorsement." };

type SP = { city?: string; state?: string; category?: string; date?: string; upcoming?: string; sort?: string };
export default async function Discover({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sort = sp.sort === "updated" || sp.sort === "newest" ? sp.sort : "upcoming";
  const places = await listPlaces();
  const list = await listProtests({
    city: sp.city || undefined, state: sp.state || undefined, category: sp.category || undefined,
    from: /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date : undefined, to: /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date : undefined,
    upcoming: sp.upcoming === "on", sort,
  });
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-5xl px-4 pb-10 pt-6 sm:px-8">
        <h1 className="display text-[clamp(2.5rem,9.8vw,5.3rem)]">Discover.</h1>
        <p className="mt-3 max-w-2xl text-lg text-mute">Public gatherings listed by their organizers. Anyone can browse. Details are supplied by organizers, and a listing is not an approval or an endorsement by BookMyProtest.</p>
        <form method="get" className="panel mt-6 grid gap-3 p-4 sm:grid-cols-3" aria-label="Filters">
          <label>State<select name="state" defaultValue={sp.state ?? ""} className="field !min-h-11"><option value="">All</option>{places.states.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>City<select name="city" defaultValue={sp.city ?? ""} className="field !min-h-11"><option value="">All</option>{places.cities.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Subject<select name="category" defaultValue={sp.category ?? ""} className="field !min-h-11"><option value="">All</option>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Date<input type="date" name="date" defaultValue={sp.date ?? ""} className="field !min-h-11" /></label>
          <label>Sort<select name="sort" defaultValue={sort} className="field !min-h-11"><option value="upcoming">Upcoming first</option><option value="updated">Recently updated</option><option value="newest">Newest listed</option></select></label>
          <div className="flex items-end gap-4"><label className="flex items-center gap-2 pb-3"><input type="checkbox" name="upcoming" defaultChecked={sp.upcoming === "on"} className="size-5" /> Upcoming only</label><button className="btn">Apply</button></div>
        </form>
        {list.length === 0 ? (
          <div className="mt-8"><EmptyState glyph="route" title="Nothing listed for these filters">Try widening them. Listings appear here when organizers choose to publish them.</EmptyState></div>
        ) : (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2" aria-label="Public protests">{list.map((p) => <ProtestCard key={p.slug} p={p} />)}</ul>
        )}
        <p className="mt-8 text-sm text-mute">Organizing something? <Link className="underline" href="/plan">Plan your protest</Link> first; you can publish it when you are ready.</p>
      </main>
      <Footer />
    </>
  );
}
