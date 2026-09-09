# Deploying PRERAAK People OS

Vercel (app hosting + cron) and Neon (Postgres), both free tier. This is a
one-time setup; every deploy after the first is just a `git push` to the
branch Vercel is watching.

These steps have not been run from inside this session — the sandbox this
was built in cannot reach `vercel.com`, `api.vercel.com` or `neon.tech`.
Follow them yourself, and if a step doesn't match what you see in either
dashboard, stop and say where it diverged rather than pushing through.

## 1. Create the Neon project

1. [neon.tech](https://neon.tech) → New Project. Any region close to your
   users is fine; the free tier is enough for this headcount.
2. On the project's **Connection Details** panel, copy two connection
   strings:
   - the **pooled** one (the host includes `-pooler`) — this becomes
     `DATABASE_URL`.
   - the **direct** one (no `-pooler`) — this becomes `DIRECT_URL`.
   Both include a database name and `?sslmode=require`; keep that suffix.

## 2. Create the Vercel project

1. [vercel.com](https://vercel.com) → Add New → Project → import this GitHub
   repository.
2. Before the first deploy, open **Settings → Build & Development Settings**
   and override the **Build Command** to:
   ```
   npx prisma migrate deploy && npm run build
   ```
   This applies any pending migration before every build, including this
   first one, so a schema change never needs a separate manual step again.
   (`npm run build` alone stays `prisma generate && next build` — this
   override only adds the migration step in front of it on Vercel.)

## 3. Set environment variables

In the Vercel project's **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the **pooled** Neon connection string from step 1 |
| `DIRECT_URL` | the **direct** Neon connection string from step 1 |
| `AUTH_SECRET` | a fresh secret — `npx auth secret` or `openssl rand -base64 32`. **Do not reuse the one from `.env.local`.** |
| `AUTH_URL` | the production URL, e.g. `https://people.preraak.in` or the `*.vercel.app` domain |
| `RESEND_API_KEY` | your Resend API key |
| `EMAIL_FROM` | the verified sender address, e.g. `PRERAAK People OS <people@preraak.in>` |
| `CRON_SECRET` | a fresh secret — `openssl rand -hex 32`. Vercel Cron attaches this automatically as a bearer token; it's what the two cron routes check instead of a user session. |

**Never set** `SEED_CONFIRM` or `SEED_ALLOW_REMOTE` in this project. Those
exist only to let `prisma/seed.ts` run against a local database on purpose —
leaving them unset is what keeps the dev seed script from ever being run
against production by accident.

## 4. Deploy

Trigger the deploy (push to the watched branch, or use the Vercel dashboard's
Deploy button). Watch the build log — the `prisma migrate deploy` step from
step 2 should report the migrations it applied.

## 5. Create the first admin

The app is invite-only by construction: nobody can sign in until a `Person`
row exists, and a brand-new database has none. Run this once, from your own
machine, against the **pooled** production `DATABASE_URL`:

```bash
ADMIN_NAME="Your Name" ADMIN_EMAIL="you@preraak.in" \
  DATABASE_URL="<neon pooled url>" \
  npm run bootstrap-admin
```

It refuses if the `people` table isn't empty, so it can only ever create the
very first row — it can't mint a second admin, and running it again is a
no-op refusal.

## 6. Sign in and invite everyone else

Go to `/login`, sign in with the address you just bootstrapped, and use the
app itself (Admin → People → Add a person) to add everyone else. Each
sign-in sends a magic link via Resend — there's no separate invite email
template, the sign-in link *is* the invite for a first-time login.

## A note on cron limits

`vercel.json` schedules two weekly jobs (the Friday reminder and the weekly
digest) — well under any reasonable daily cap. Vercel's Hobby-tier limits on
number of cron jobs and minimum interval have changed before and may change
again; check the current [Vercel pricing page](https://vercel.com/pricing)
before relying on this if you're on a free plan, since that isn't something
this session can verify.
