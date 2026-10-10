/**
 * Outgoing email. Every message is recorded in `email_outbox` first; a provider adapter then tries to deliver it.
 * Configure RESEND_API_KEY and MAIL_FROM to deliver through Resend (https://resend.com). With none configured, messages stay PENDING
 * (development and tests read them from the outbox). Sending never throws into the user's flow.
 */
import { query } from "./db";

export const appUrl = () => (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const mailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

export async function sendMail(m: { to: string; kind: string; subject: string; body: string }): Promise<"SENT" | "PENDING" | "FAILED"> {
  const row = (await query<{ id: string }>("INSERT INTO email_outbox (to_email, kind, subject, body) VALUES ($1,$2,$3,$4) RETURNING id", [m.to, m.kind, m.subject, m.body]))[0];
  if (!mailConfigured()) return "PENDING";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [m.to], subject: m.subject, text: m.body }),
    });
    if (!res.ok) throw new Error(`provider answered ${res.status}`);
    await query("UPDATE email_outbox SET status='SENT', sent_at=now() WHERE id=$1", [row.id]);
    return "SENT";
  } catch (e) {
    await query("UPDATE email_outbox SET status='FAILED', error=$2 WHERE id=$1", [row.id, String((e as Error).message).slice(0, 300)]);
    return "FAILED";
  }
}
