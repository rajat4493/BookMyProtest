import Link from "next/link";
import { Footer, Header } from "@/components/chrome";
import { Back, Check } from "@/components/icons";
import { QuoteForm } from "@/components/quote-form";
import { formatDate, loadPlan } from "@/lib/plan";
import { listVendorCategories, listVendorRequests } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get quotes" };

const STATUS: Record<string, string> = { new: "Received", matching: "Finding vendors", matched: "Vendors matched", closed: "Closed" };

export default async function Vendors({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ category?: string; sent?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { event, cityLabel, items } = await loadPlan(id);
  const cats = await listVendorCategories();
  const requests = await listVendorRequests(event.id);
  const selected = cats.find((c) => c.slug === sp.category);
  const sent = cats.find((c) => c.slug === sp.sent);
  const suggested = new Set(items.filter((i) => i.rule.vendorCategory && !i.done).map((i) => i.rule.vendorCategory!));
  const a = event.answers;

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-5xl px-4 pb-10 pt-6 sm:px-8">
        <Link href={`/plan/${event.id}`} className="label inline-flex items-center gap-2 underline-offset-4 hover:underline"><Back width={16} height={16} /> Back to {event.name}</Link>

        {sent && (
          <div className="card slide-in mt-6 bg-accent p-6" role="status">
            <p className="display text-5xl sm:text-7xl">Request received.</p>
            <p className="mt-3 max-w-xl text-lg">Your {sent.label.toLowerCase()} request is in. We&rsquo;ll match you with vendors and be in touch by email.</p>
          </div>
        )}

        {selected ? (
          <section className="mt-8">
            <h1 className="display text-[clamp(2.6rem,10vw,6rem)]">Get quotes: {selected.label}</h1>
            <div className="mt-8">
              <QuoteForm eventId={event.id} category={selected.slug} categoryLabel={selected.label}
                summary={[["Where", `${a.startLocation}, ${cityLabel}`], ["When", `${formatDate(event.date)}`], ["Attendance", String(a.attendance)], ["Category", selected.label]]}
                defaults={{ name: a.organizerName, email: a.organizerEmail, phone: a.organizerPhone }} />
            </div>
            <Link href={`/plan/${event.id}/vendors`} className="mt-6 inline-block underline">Choose a different category</Link>
          </section>
        ) : (
          <section className="mt-8">
            <h1 className="display text-[clamp(2.6rem,10vw,6rem)]">Need something?<br />Ask for a quote.</h1>
            <p className="mt-4 max-w-xl text-lg text-mute">Pick a category. Your event details are already filled in.</p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {cats.map((c) => (
                <li key={c.slug}>
                  <Link href={`/plan/${event.id}/vendors?category=${c.slug}`} className={`tile flex min-h-20 items-center justify-between gap-2 p-4 ${suggested.has(c.slug) ? "bg-accent" : "bg-paper"}`}>
                    <span className="display-wide text-xl">{c.label}</span>
                    {suggested.has(c.slug) && <span className="chip chip-critical">Needed</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {requests.length > 0 && (
          <section className="mt-14" aria-labelledby="your-req">
            <h2 id="your-req" className="display text-3xl">Your requests</h2>
            <ul className="mt-4 divide-y-2 divide-ink border-2 border-ink">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-4">
                  <span><span className="font-bold">{r.categoryLabel}</span>{r.quantity && <span className="text-mute"> · {r.quantity}</span>}</span>
                  <span className="chip chip-required"><Check width={12} height={12} />{STATUS[r.status] ?? r.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
