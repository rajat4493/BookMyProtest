import Link from "next/link";
import { Footer, Header } from "@/components/chrome";
import { DetailsForm } from "@/components/details-form";
import { Back } from "@/components/icons";
import { loadOwnedEvent } from "@/lib/access";
import { RECONFIRM_ADVICE, applicationSubmittedAt } from "@/lib/event-changes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit plan details" };

export default async function Details({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await loadOwnedEvent(id);
  const applied = !!(await applicationSubmittedAt(event.id));
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:px-8">
        <Link href={`/plan/${event.id}`} className="label inline-flex items-center gap-2 underline-offset-4 hover:underline"><Back width={16} height={16} /> Back to {event.name}</Link>
        <h1 className="display mt-6 text-[clamp(2.3rem,9vw,4.5rem)]">Edit your plan.</h1>
        <p className="mt-3 max-w-xl text-mute">Saving rechecks your plan against the current rules. {RECONFIRM_ADVICE.replace("You have changed something that may matter to the authority you applied to. ", "If you have already applied: ")}</p>
        <DetailsForm eventId={event.id} initial={event.answers} applied={applied} />
      </main>
      <Footer />
    </>
  );
}
