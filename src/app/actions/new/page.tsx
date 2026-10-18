import Link from "next/link";
import { notFound } from "next/navigation";
import { resendVerificationAction } from "@/app/actions";
import { Footer, Header } from "@/components/chrome";
import { CampaignForm } from "@/components/hill";
import { getUser } from "@/lib/auth";
import { hitWhereItHurtsEnabled } from "@/lib/flags";
import { query } from "@/lib/db";
import { isEmailVerified } from "@/lib/verification";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create a digital action" };

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ issue?: string; error?: string }> }) {
  if (!hitWhereItHurtsEnabled()) notFound();
  const sp = await searchParams;
  const user = await getUser();
  const verified = await isEmailVerified(user?.id);
  const issues = await query<{ slug: string; title: string }>("SELECT slug, title FROM issues WHERE status='PUBLISHED' AND moderation_status='OK' ORDER BY title");
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:px-8">
        <h1 className="display text-[clamp(2.3rem,9vw,4.5rem)]">Create a digital action.</h1>
        <p className="mt-3 max-w-xl text-lg text-mute">A peaceful, voluntary campaign about a documented issue, asking for one specific change. You are responsible for your claims; BookMyProtest does not endorse or guarantee your campaign. Save a draft first; publishing needs a complete page and a confirmed email.</p>
        <div className="panel mt-4 p-4 text-sm" role="note" data-testid="rules-note"><p className="font-semibold">Not allowed here</p><p className="mt-1 text-mute">Threats, harassment or doxxing; naming or targeting private individuals or employees; fake reviews; spam or floods of messages; automated participation; obstructing a business or its staff; estimates of financial damage. Campaigns that do this are removed.</p></div>
        {sp.error && <p role="alert" className="card mt-4 p-4 font-semibold">{sp.error}</p>}
        {!user ? <p className="card mt-6 p-4">Sign in to create a campaign. <Link className="underline" href={`/signup?next=${encodeURIComponent(`/actions/new?issue=${sp.issue ?? ""}`)}`}>Create an account</Link> or <Link className="underline" href={`/login?next=${encodeURIComponent(`/actions/new?issue=${sp.issue ?? ""}`)}`}>sign in</Link>.</p> : (
          <>
            {!verified && <div className="card mt-6 p-4" data-testid="verify-needed"><p className="font-semibold">Confirm your email to publish.</p><p className="mt-1 text-sm text-mute">You can save a draft now.</p><form action={resendVerificationAction} className="mt-3"><input type="hidden" name="next" value="/actions/new" /><button className="btn btn-sm">Email me a confirmation link</button></form></div>}
            {issues.length === 0 ? <p className="card mt-6 p-4">No published issue exists yet. A campaign must be about a documented issue. <Link className="underline" href="/issues/suggest">Suggest an issue</Link>.</p> : <CampaignForm issueSlug={sp.issue ?? ""} issues={issues} />}
          </>)}
      </main>
      <Footer />
    </>
  );
}
