/** Shown on every public protest page. Professional, not alarming. */
export function TransparencyFooter() {
  return (
    <aside className="panel p-5 text-sm text-mute" aria-labelledby="transparency-h" data-testid="transparency">
      <h2 id="transparency-h" className="label text-ink">About this listing</h2>
      <ul className="mt-2 list-inside list-disc space-y-1">
        <li>BookMyProtest does not organize, authorize, endorse or guarantee this event.</li>
        <li>Details may be supplied by the organizer.</li>
        <li>Check current official information where relevant.</li>
      </ul>
    </aside>
  );
}
