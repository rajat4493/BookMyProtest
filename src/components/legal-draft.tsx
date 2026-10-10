import { Footer, Header } from "@/components/chrome";

/** LEGAL REVIEW REQUIRED BEFORE PUBLIC LAUNCH. Draft placeholder pages: structure and positioning only, not legal text. */
export function LegalDraft({ title, intro, sections }: { title: string; intro: string; sections: { h: string; body: string[] }[] }) {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:px-8">
        <p className="card p-4 text-sm" role="note" data-testid="legal-draft-banner"><strong>Draft.</strong> Legal review is required before public launch. This page describes how BookMyProtest is meant to work and is not yet final legal terms.</p>
        <h1 className="display mt-6 text-[clamp(2.3rem,8vw,4.5rem)]">{title}</h1>
        <p className="mt-3 text-lg text-mute">{intro}</p>
        {sections.map((s) => (
          <section key={s.h} className="mt-8"><h2 className="heading text-xl">{s.h}</h2>{s.body.map((b, i) => <p key={i} className="mt-2">{b}</p>)}</section>
        ))}
      </main>
      <Footer />
    </>
  );
}
