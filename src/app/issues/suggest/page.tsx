import { notFound } from "next/navigation";
import { suggestIssueAction } from "@/app/actions-hill";
import { Footer, Header } from "@/components/chrome";
import { resendVerificationAction } from "@/app/actions";
import { getUser } from "@/lib/auth";
import { ISSUE_CATEGORIES } from "@/lib/engine/issues";
import { findYourHillEnabled } from "@/lib/flags";
import { isEmailVerified } from "@/lib/verification";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suggest an issue" };

export default async function Suggest({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  if (!findYourHillEnabled()) notFound();
  const sp = await searchParams;
  const user = await getUser();
  const verified = await isEmailVerified(user?.id);
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-2xl px-4 pb-10 pt-6 sm:px-8">
        <h1 className="display text-[clamp(2.3rem,8vw,4.5rem)]">Suggest an issue.</h1>
        <p className="mt-3 text-lg text-mute">Tell us about an issue that has reliable public information. A person reviews every suggestion, checks the sources and writes a neutral page. Nothing is published automatically, and a suggestion is not an endorsement.</p>
        {sp.sent && <p role="status" className="panel mt-6 p-4" data-testid="suggest-sent">Thank you. Your suggestion is in the review queue.</p>}
        {sp.error && <p role="alert" className="card mt-6 p-4 font-semibold">{sp.error}</p>}
        {!user ? <p className="card mt-6 p-4">Sign in to suggest an issue. <a className="underline" href="/login?next=/issues/suggest">Sign in</a> or <a className="underline" href="/signup?next=/issues/suggest">create an account</a>.</p>
          : !verified ? <div className="card mt-6 p-4"><p className="font-semibold">Confirm your email first.</p><form action={resendVerificationAction} className="mt-3"><input type="hidden" name="next" value="/issues/suggest" /><button className="btn btn-sm">Email me a confirmation link</button></form></div>
          : (
            <form action={suggestIssueAction} className="mt-6 space-y-4" aria-label="Suggest an issue">
              <div><label htmlFor="title" className="label mb-1 block">What is the issue? (a neutral description)</label><input id="title" name="title" required minLength={8} maxLength={140} className="field" /></div>
              <div><label htmlFor="description" className="label mb-1 block">What do the public facts say?</label><textarea id="description" name="description" required minLength={20} maxLength={1500} rows={5} className="field" /></div>
              <div><label htmlFor="sourceUrl" className="label mb-1 block">A source (https link)</label><input id="sourceUrl" name="sourceUrl" type="url" inputMode="url" className="field" /></div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><label htmlFor="city" className="label mb-1 block">City</label><input id="city" name="city" maxLength={80} className="field" /></div>
                <div><label htmlFor="state" className="label mb-1 block">State</label><input id="state" name="state" maxLength={80} className="field" /></div>
                <div><label htmlFor="category" className="label mb-1 block">Topic</label><select id="category" name="category" className="field" defaultValue="OTHER">{Object.entries(ISSUE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <p className="text-sm text-mute">Do not include anyone&rsquo;s private details or accusations against individuals.</p>
              <button className="btn" data-testid="send-suggestion">Send for review</button>
            </form>)}
      </main>
      <Footer />
    </>
  );
}
