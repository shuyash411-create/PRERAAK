/**
 * DEVELOPMENT ONLY — the most recent magic-link sign-in URL.
 *
 * With no Resend key configured, `sendSignInLink` prints the sign-in URL to
 * the server console. That works at a terminal and is useless in a hosted
 * preview, where nobody can see the console. This module holds the last link
 * in memory so the "check your email" page can show it instead.
 *
 * This is not a way around authentication. The link is the same single-use
 * token Auth.js would have emailed: it still expires, it is still consumed on
 * first use, and it is still only issued for an address that already belongs
 * to a person. Nothing here mints a session or skips a check.
 *
 * It is nonetheless gated hard, and on both sides — nothing is stored unless
 * the gate is open, and nothing is returned unless it is open again at read
 * time. Both conditions must hold:
 *
 *   - NODE_ENV is not production, and
 *   - RESEND_API_KEY is empty.
 *
 * A correctly configured deployment fails both: `sendSignInLink` refuses to
 * start in production without a Resend key, so a production server always has
 * one, and this store is therefore always closed there.
 */

const TTL_MS = 10 * 60 * 1000;

type DevLink = { url: string; email: string; storedAt: number } | null;

// The dev server recompiles modules on edit; keep the link across reloads.
const globalForDevLink = globalThis as unknown as { preraakDevSignInLink?: DevLink };

/** Whether sign-in links may be shown in the interface at all. */
export function devSignInLinkEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY;
}

export function rememberDevSignInLink(email: string, url: string): void {
  if (!devSignInLinkEnabled()) return;
  globalForDevLink.preraakDevSignInLink = { url, email, storedAt: Date.now() };
}

/** The last link, if the gate is open and it has not gone stale. */
export function readDevSignInLink(): { url: string; email: string } | null {
  if (!devSignInLinkEnabled()) return null;

  const stored = globalForDevLink.preraakDevSignInLink;
  if (!stored) return null;

  if (Date.now() - stored.storedAt > TTL_MS) {
    globalForDevLink.preraakDevSignInLink = null;
    return null;
  }

  return { url: stored.url, email: stored.email };
}

/** Test seam. */
export function clearDevSignInLink(): void {
  globalForDevLink.preraakDevSignInLink = null;
}
