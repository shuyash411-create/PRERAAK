import { BackLink } from "@/components/ui";
import { readDevSignInLink } from "@/lib/dev-signin-link";

// Reads per-request state, so it cannot be prerendered.
export const dynamic = "force-dynamic";

export default function CheckEmailPage() {
  // Null unless this is a development server with no Resend key configured.
  const devLink = readDevSignInLink();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-semibold text-ink-900">Check your email</h1>
      <p className="mt-3 text-sm text-ink-700">
        If that address belongs to a PRERAAK account, a sign-in link is on its way. The link works
        once and expires in 24 hours.
      </p>

      {devLink ? (
        <div className="mt-6 rounded-lg border border-cream-300 bg-cream-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-clay-600">
            Development mode
          </p>
          <p className="mt-2 text-sm text-ink-700">
            No email service is configured, so nothing was actually sent. The link generated for{" "}
            <strong className="text-ink-900">{devLink.email}</strong> is below. It behaves exactly
            like an emailed one — single use, and it expires.
          </p>
          <a
            href={devLink.url}
            className="mt-3 inline-block break-all text-sm text-forest-700 underline underline-offset-2"
          >
            Sign in as {devLink.email}
          </a>
          <p className="mt-3 text-xs text-ink-400">
            This section never appears once RESEND_API_KEY is set, and never in production.
          </p>
        </div>
      ) : null}

      <p className="mt-6 text-sm">
        <BackLink href="/login">Use a different address</BackLink>
      </p>
    </main>
  );
}
