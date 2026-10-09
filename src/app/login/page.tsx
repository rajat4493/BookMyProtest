import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Footer, Header } from "@/components/chrome";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && /^\/(?!\/)[\w\-/?=&.%]*$/.test(sp.next) ? sp.next : "/account";
  if (await getUser()) redirect(next);
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-md px-4 pb-10 pt-8 sm:px-8">
        <h1 className="display text-[clamp(2.5rem,11.5vw,4.5rem)]">Welcome back.</h1>
        <p className="mt-4 text-lg text-mute">Sign in to see your plans.</p>
        <div className="mt-8"><AuthForm mode="login" next={next} /></div>
        <p className="mt-6 text-mute"><>New here? <Link className="underline" href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></></p>
      </main>
      <Footer />
    </>
  );
}
