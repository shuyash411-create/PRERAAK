import { redirect } from "next/navigation";
import { signIn, auth } from "@/lib/auth";
import { buttonClass, Field, inputClass } from "@/components/ui";

/**
 * Sign in.
 *
 * The response never says whether an address is registered. PRERAAK is
 * invite-only, and a login form that distinguishes "no such person" from
 * "check your email" is a way to enumerate who works here.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/my-work");

  const { error } = await searchParams;

  async function requestLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email) redirect("/login?error=missing_email");

    // Auth.js redirects to the verify page whether or not the person exists.
    await signIn("resend", { email, redirectTo: "/my-work" });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8">
        <p className="text-sm font-medium tracking-wide text-forest-700">PRERAAK</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink-900">People OS</h1>
        <p className="mt-2 text-sm text-ink-500">
          Sign in with your PRERAAK email. We will send you a link — there is no password to
          remember.
        </p>
      </div>

      <form action={requestLink} className="space-y-4">
        <Field label="Email address" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            autoFocus
            placeholder="you@preraak.in"
            className={inputClass}
          />
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-clay-600">
            {error === "missing_email"
              ? "Enter your email address to continue."
              : "That did not work. Try again, or ask an admin to check your account."}
          </p>
        ) : null}

        <button type="submit" className={`${buttonClass} w-full`}>
          Email me a sign-in link
        </button>
      </form>

      <p className="mt-6 text-xs text-ink-400">
        Accounts are created by an admin. If you do not have one yet, ask your mentor.
      </p>
    </main>
  );
}
