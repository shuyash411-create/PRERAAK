import { Resend } from "resend";
import { devSignInLinkEnabled, rememberDevSignInLink } from "@/lib/dev-signin-link";

/**
 * Outbound email.
 *
 * With no RESEND_API_KEY every email is written to the server log instead of
 * being sent, so development needs no verified sending domain. That fallback
 * is refused in production: silently logging mail where anyone with log
 * access could read it would be worse than failing loudly.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY and EMAIL_FROM are required in production.");
    }
    console.info(`\n[dev] Email to ${params.to} — ${params.subject}\n${params.text}\n`);
    return;
  }

  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });

  if (error) throw new Error(`Could not send email: ${error.message}`);
}

/**
 * The one sign-in email, kept as its own function because — unlike any other
 * email this system sends — a person is watching for it: the link is also
 * held in memory so the check-email page can show it in a hosted preview
 * with no console to read. That memory write is gated by the same
 * dev-and-no-key condition `sendEmail` falls back on internally.
 */
export async function sendSignInLink(to: string, url: string): Promise<void> {
  if (devSignInLinkEnabled()) {
    console.info(`\n[dev] Sign-in link for ${to}:\n${url}\n`);
    rememberDevSignInLink(to, url);
    return;
  }

  await sendEmail({
    to,
    subject: "Your PRERAAK sign-in link",
    text: [
      "Sign in to PRERAAK People OS:",
      "",
      url,
      "",
      "This link works once and expires in 24 hours.",
      "If you did not ask to sign in, ignore this email.",
    ].join("\n"),
  });
}
