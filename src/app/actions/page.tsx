import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer, Header } from "@/components/chrome";
import { EmptyState } from "@/components/empty";
import { CampaignCard } from "@/components/hill";
import { ISSUE_CATEGORIES } from "@/lib/engine/issues";
import { hitWhereItHurtsEnabled } from "@/lib/flags";
import { listCampaigns } from "@/lib/digital-actions";
import { listIssuePlaces } from "@/lib/issues";

export const dynamic = "force-dynamic";
export const metadata = { title: "Digital actions", description: "Voluntary, lawful, nonviolent actions you can take from anywhere. Listing is not an endorsement." };

type SP = { q?: string; state?: string; city?: string; category?: string };
export default async function DigitalActions({ searchParams }: { searchParams: Promise<SP> }) {
  if (!hitWhereItHurtsEnabled()) notFound();
  const sp = await searchParams;
  const places = await listIssuePlaces();
  const list = await listCampaigns({ q: sp.q, state: sp.state || undefined, city: sp.city || undefined, category: sp.category || undefined });
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-5xl px-4 pb-10 pt-6 sm:px-8">
        <p className="label text-mute">Digital actions · working name HitWhereItHurts</p>
        <h1 className="display mt-1 text-[clamp(2.5rem,9.8vw,5.3rem)]">Your voice doesn&rsquo;t have to be in the same city to count.</h1>
        <p className="mt-3 max-w-2xl text-lg text-mute">Organizer-led campaigns tied to a documented issue, each asking for one specific change. Taking part is voluntary and anonymous to everyone but you: organizers and the public see totals only, and completed actions are self-reported and not verified. Listing a campaign is not an endorsement.</p>
        <form method="get" className="panel mt-6 grid gap-3 p-4 sm:grid-cols-4" role="search" aria-label="Search digital actions">
          <label className="sm:col-span-4">Search<input type="search" name="q" defaultValue={sp.q ?? ""} className="field !min-h-11" /></label>
          <label>State<select name="state" defaultValue={sp.state ?? ""} className="field !min-h-11"><option value="">All</option>{places.states.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>City<select name="city" defaultValue={sp.city ?? ""} className="field !min-h-11"><option value="">All</option>{places.cities.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Topic<select name="category" defaultValue={sp.category ?? ""} className="field !min-h-11"><option value="">All</option>{Object.entries(ISSUE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <div className="flex items-end"><button className="btn">Search</button></div>
        </form>
        <p className="mt-3 text-sm text-mute">Newest first. Campaigns are never ranked by how many people joined or by any effect on an organization.</p>
        {list.length === 0 ? <div className="mt-8"><EmptyState glyph="route" title="No digital action matches">Campaigns appear here when organizers publish them against a documented issue. <Link className="underline" href="/issues">Find an issue</Link> to start one.</EmptyState></div>
          : <ul className="mt-8 grid gap-3 sm:grid-cols-2" aria-label="Digital actions">{list.map((c) => <CampaignCard key={c.slug} c={c} />)}</ul>}
      </main>
      <Footer />
    </>
  );
}
