import { Footer, Header } from "@/components/chrome";
import { Wizard } from "@/components/wizard";
import { jurisdictionChain, listSupportedCities, listVenuesByPlace, metaForChain } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan a protest" };

export default async function PlanPage() {
  const [cities, venues] = await Promise.all([listSupportedCities(), listVenuesByPlace()]);
  const largeAbove: Record<string, number> = {};
  for (const c of cities) { const m = await metaForChain(await jurisdictionChain(c.id)); if (typeof m.largeEventAbove === "number") largeAbove[c.id] = m.largeEventAbove; }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Header />
      <main id="main" className="mx-auto px-4 pb-10 pt-6 sm:px-8">
        <Wizard cities={cities.map((c) => ({ id: c.id, label: c.label, isDevSeed: c.isDevSeed }))} venues={venues} today={today} largeAbove={largeAbove} />
      </main>
      <Footer />
    </>
  );
}
