import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-24">
      <h1 className="display text-5xl">Not found.</h1>
      <p className="mt-4 text-lg text-mute">This page doesn&rsquo;t exist, or the plan isn&rsquo;t yours to see.</p>
      <Link href="/" className="btn mt-6">Home</Link>
    </main>
  );
}
