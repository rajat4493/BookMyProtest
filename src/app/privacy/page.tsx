import { LegalDraft } from "@/components/legal-draft";
// LEGAL REVIEW REQUIRED BEFORE PUBLIC LAUNCH. Placeholder structure only.
export const metadata = { title: "Privacy (draft)" };
export default function Privacy() {
  return <LegalDraft title="Privacy." intro="What BookMyProtest collects, and what it deliberately does not. Draft for legal review."
    sections={[
      { h: "Browsing", body: ["You can browse and read public protest pages without an account."] },
      { h: "Accounts", body: ["An account is needed to save plans, publish a page, or follow / mark interest / mark planning to attend. We store your email and a password hash. To publish a page, or for your support to be counted, you confirm your email by following a one-time link; we store only a hash of that link and when it was used."] },
      { h: "Reports and abuse prevention", body: ["If you report a page we store the reason, your optional note, and either your account or a hashed network address so one person cannot file the same report repeatedly. Organizers are never shown who reported them. To limit abuse we also keep short-lived counters of sign-in, sign-up, report and similar attempts per account or network address."] },
      { h: "Supporters", body: ["When you follow, mark interest or planning to attend, your choice is tied to your account so you can undo it and so it is not counted twice. Organizers and the public see totals only. There is no list of supporters, and no export."] },
      { h: "What we do not collect", body: ["We do not ask for government ID numbers, religion, caste, political-party membership or political views, and we do not build profiles of political belief. Analytics events carry only city, state, subject area, event date, organizer type, visibility, reported permission status and support type."] },
      { h: "What organizers publish", body: ["A public page shows only what the organizer chooses to publish. Personal phone numbers, email addresses, home addresses, identity documents, internal notes and correspondence with authorities are never shown on public pages."] },
      { h: "Retention and your rights", body: ["Retention periods and data-subject rights will be set out here after legal review."] },
    ]} />;
}
