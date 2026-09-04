import { Resend } from "resend";

/**
 * Outbound email.
 *
 * With no RESEND_API_KEY the link is written to the server log instead of
 * being sent, so a developer can sign in without a verified sending domain.
 * That fallback is refused in production: silently logging sign-in links where
 * anyone with log access could use them would be worse than failing loudly.
 */
export async function sendSignInLink(to: string, url: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY and EMAIL_FROM are required in production.");
    }
    console.info(`\n[dev] Sign-in link for ${to}:\n${url}\n`);
    return;
  }

  const { error } = await new Resend(apiKey).emails.send({
    from,
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

  if (error) throw new Error(`Could not send sign-in email: ${error.message}`);
}
