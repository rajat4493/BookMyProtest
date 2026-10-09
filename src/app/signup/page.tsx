import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Footer, Header } from "@/components/chrome";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Save your plan" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && /^\/(?!\/)[\w\-/?=&.%]*$/.test(sp.next) ? sp.next : "/account";
  if (await getUser()) redirect(next);
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-md px-4 pb-10 pt-8 sm:px-8">
        <h1 className="display text-[clamp(2.5rem,11.5vw,4.5rem)]">Save your plan.</h1>
        <p className="mt-4 text-lg text-mute">Create an account to keep your plans safe and come back from any device. Plans you started in this browser are added automatically.</p>
        <div className="mt-8"><AuthForm mode="signup" next={next} /></div>
        <p className="mt-6 text-mute"><>Already have an account? <Link className="underline" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></></p>
      </main>
      <Footer />
    </>
  );
}
