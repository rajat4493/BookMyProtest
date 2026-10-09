import { Footer, Header } from "@/components/chrome";
import { Wizard } from "@/components/wizard";
import { listSupportedCities } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan a protest" };

export default async function PlanPage() {
  const cities = await listSupportedCities();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Header />
      <main id="main" className="mx-auto px-4 pb-10 pt-6 sm:px-8">
        <Wizard cities={cities.map((c) => ({ id: c.id, label: c.label, isDevSeed: c.isDevSeed }))} today={today} />
      </main>
      <Footer />
    </>
  );
}
