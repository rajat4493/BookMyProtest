import Link from "next/link";
import { confirmEmailAction } from "@/app/actions";
import { Footer, Header } from "@/components/chrome";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your email", robots: { index: false } };

const RESULT: Record<string, { title: string; body: string }> = {
  VERIFIED: { title: "Email confirmed", body: "Thank you. You can now publish a public page and your support will be counted." },
  ALREADY_USED: { title: "That link was already used", body: "If your email is confirmed you do not need to do anything. Otherwise ask for a new link from your account." },
  EXPIRED: { title: "That link has expired", body: "Ask for a new confirmation link from your account." },
  INVALID: { title: "That link does not work", body: "It may be incomplete or replaced by a newer one. Ask for a new confirmation link from your account." },
};

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string; result?: string }> }) {
  const sp = await searchParams;
  const done = sp.result ? RESULT[sp.result] ?? RESULT.INVALID : null;
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-xl px-4 pb-16 pt-10 sm:px-8">
        {done ? (
          <>
            <h1 className="display text-[clamp(2.2rem,8vw,4rem)]" data-testid="verify-result" data-result={sp.result}>{done.title}</h1>
            <p className="mt-3 text-lg text-mute">{done.body}</p>
            <p className="mt-6"><Link className="btn" href="/account">Go to my plans</Link></p>
          </>
        ) : (
          <>
            <h1 className="display text-[clamp(2.2rem,8vw,4rem)]">Confirm your email</h1>
            <p className="mt-3 text-lg text-mute">Press the button to confirm this address. (This extra step stops email scanners from using up your link.)</p>
            <form action={confirmEmailAction} className="mt-6"><input type="hidden" name="token" value={sp.token ?? ""} /><button className="btn">Confirm email</button></form>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
