"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-24">
      <h1 className="display text-6xl">Something broke.</h1>
      <p className="mt-4 text-lg text-mute">That one&rsquo;s on us. Your plan is safe. Try again.</p>
      <button className="btn mt-6" onClick={reset}>Try again</button>
    </main>
  );
}
