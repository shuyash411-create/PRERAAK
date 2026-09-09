/**
 * Authentication for scheduled jobs.
 *
 * Cron routes have no signed-in person to resolve — Vercel's cron
 * infrastructure calls them directly, with no session at all — so they
 * cannot go through `guarded()`, which requires an `Actor`. Vercel attaches
 * `Authorization: Bearer $CRON_SECRET` automatically to cron-triggered
 * requests once `CRON_SECRET` is set as a project environment variable; this
 * checks that header instead of a session, the same security property
 * `guarded()` gives every other route, for a caller that isn't a person.
 *
 * An unset `CRON_SECRET` authorizes nothing — a misconfigured deployment
 * fails closed, not open.
 */
export function verifyCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
