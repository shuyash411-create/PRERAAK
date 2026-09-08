# PRERAAK People OS

Internal people management for PRERAAK. Not a product — a small tool for ~10
people today, ~20 within a year, never more than 50.

**Stage 1 (foundation) is built.** Stage 2 (mentor views, digests, leave) and
Stage 3 (documents, PDFs, certificates) are not started.

## The three invariants

Everything here is shaped by three rules. Read them before changing anything.

**1. One person, one permanent identity.** A person gets `PRR-000001` on
creation and keeps it forever. Their relationship with PRERAAK is a stack of
engagements on top of one immortal `people` row. An intern who becomes an
employee does **not** get a new person row — the internship engagement is
closed and an employment engagement is opened, and every earlier work log stays
queryable under the same person. Nobody is ever deleted; `status` moves to
`ARCHIVED`.

**2. Contribution over attendance.** There is no clock-in, no clock-out, no
session tracking, no login-frequency metric, no "online now". PRERAAK people
work mornings, nights, 2 AM and weekends. **A work log submitted at 01:30 is
completely normal and is never highlighted, coloured or flagged.** The display
helpers deliberately do not offer a clock-time formatter.

**3. Immutability.** A `DRAFT` is freely editable by its author. Once
`SUBMITTED` it is read-only to everyone, permanently — no edit button, no
delete route, no admin override. Changes go through a `correction_request`,
and approving one snapshots the previous value in the same transaction that
applies the new one. `timeline_events` is insert-only, enforced by a database
trigger as well as by the absence of any code path that could mutate it.

## Stack

Next.js 15 (App Router) · TypeScript · PostgreSQL · Prisma 6 · Tailwind 4 ·
Auth.js v5 magic link · Resend · Vitest. Everything runs on free tiers.

## Local setup

Requires Node 22+ and PostgreSQL 16.

```bash
# 1. Database
sudo -u postgres psql -c "CREATE ROLE preraak LOGIN PASSWORD 'preraak' CREATEDB;"
sudo -u postgres createdb -O preraak preraak_dev
sudo -u postgres createdb -O preraak preraak_test

# 2. Environment
cp .env.example .env.local
#    Set DATABASE_URL to postgresql://preraak:preraak@127.0.0.1:5432/preraak_dev
#    Generate AUTH_SECRET with: npx auth secret
#    Leave RESEND_API_KEY empty — sign-in links print to the server console.

npm install
npm run db:migrate

# 3. Development data (refuses to run against anything non-local)
SEED_CONFIRM=DEV npm run seed

npm run dev
```

Sign in at `http://localhost:3000/login` as `aditi@dev.local` (admin),
`rohan@dev.local` (mentor) or `meera@dev.local` (intern). With no Resend key
the magic link is printed to the terminal running `npm run dev` **and** shown
on the "check your email" page, so a hosted preview with no console is still
usable.

That panel is not a way around authentication — the link is the same
single-use, expiring token Auth.js would have emailed, issued only for an
address that already belongs to a person. It is gated on `NODE_ENV` not being
production **and** `RESEND_API_KEY` being empty, checked both when the link is
stored and when it is read, and `tests/dev-signin-link.test.ts` proves the gate
closes. A correctly configured deployment fails both conditions.

## Claude Code

`.claude/launch.json` tells the Claude Code **Desktop** app how to start this
project: `npm run dev` on port 3000. Open the repo in the Desktop app's Code
tab and the Browser pane (Cmd+Shift+B / Ctrl+Shift+B, or the Views menu) runs
and displays it. Preview is a Desktop feature — cloud sessions on the web have
no Browser pane.

Starting the server locally still needs a database and a `.env.local`; follow
[Local setup](#local-setup) first, or the preview will boot and then error on
every page.

`.claude/hooks/session-start.sh` covers the same ground automatically for cloud
sessions: dependencies, Prisma client, PostgreSQL, role and databases,
migrations, a development `.env.local`, and seed data.

The seeding is load-bearing rather than convenient. PRERAAK is invite-only by
construction, so an empty database is a locked door with nobody inside and the
preview would have no way in at all.

The hook is idempotent, non-interactive, never overwrites an existing
`.env.local`, and exits immediately outside a remote container so local
machines keep their own database and credentials.

## Tests

```bash
npm run test:db     # apply migrations to preraak_test
npm test            # 75 tests
npm run typecheck
npm run lint
```

The suite invokes the **real exported route handlers** against a **real
Postgres** — no mocked database, no simulated authorization. The 12 scenarios
from the brief are covered in `tests/authz.test.ts` and `tests/structure.test.ts`.

Two of them are enforced structurally rather than by sampling, because they are
the ones that rot silently as routes get added:

- Every `src/app/api/**/route.ts` is enumerated and must answer **401** with no
  session, and every exported handler must have come from `guarded()`.
- No route exports `DELETE`; no source file contains a Prisma call that could
  update or delete a timeline event; `lib/timeline.ts` exports exactly one
  function; and the database trigger is asserted to reject a raw `UPDATE`.

The schema is also scanned to prove it collects none of the sensitive fields
the brief excludes, records nothing resembling attendance, and that no file
outside `lib/ist.ts` derives a date with `toISOString().slice(0, 10)`.

## Authorization

`src/lib/authz.ts` is the only place an access decision is made, and
`src/lib/guarded.ts` is the only way a route handler is built. There is no
route where the check is skipped or left to a React component — hiding a button
is not authorization.

Three scopes, no roles table and no permission matrix. At this headcount a
boolean plus a mentor lookup is the correct engineering choice.

| Scope | Who | What |
|---|---|---|
| `SELF` | the person | read own records; write them while `DRAFT` |
| `MENTOR` | `engagement.mentor_id` | read their mentees' records (read-only in Stage 1) |
| `ADMIN` | `people.is_admin` | full read and write |

A grant names the exact fields it may write. Every `PATCH` intersects the body
against that list, so a field is never writable by accident — that is what
makes "a mentor cannot edit a summary" and "an author cannot edit a submitted
log" structural rather than incidental.

Authority is read **fresh from Postgres on every request**, never trusted from
the JWT, so revoking admin or archiving a person takes effect on their next
request rather than their next login.

Sign-in is **invite-only by construction**: the Auth.js adapter's `createUser`
throws, so a magic link for an unknown address cannot bring an account into
being. The login form never reveals whether an address is registered.

## What is stubbed

`GET /api/documents/:id/url` runs its full authorization check and then returns
**503 `document_storage_not_configured`**. The authorization is real and tested;
object storage, uploads, PDF generation, templates and certificates are Stage 3.

## Timezone

Every timestamp is stored in UTC. Every date a human sees or files work against
is an IST calendar date, via `src/lib/ist.ts` and nowhere else. A submission at
01:30 IST belongs to that IST date — `new Date().toISOString().slice(0, 10)`
would file it against the previous day, and a test forbids that pattern
appearing anywhere outside the IST module.

## Not built, deliberately

Goals and OKRs · performance review cycles · analytics dashboards · a
generalised approval engine · org chart · audit log browser · impersonation ·
multi-tenant UI · task or project management · attendance · notification
preferences · command palette · roles and permissions tables · reporting suite.

`organization_id` exists as a nullable column on `people`, `engagements` and
`documents`. It is unused and unexposed — a cheap future hook, not a feature.

## Data minimisation

Collected: name, preferred name, email, phone, college, course, graduation
year. **Not collected:** Aadhaar, PAN, bank details, address, date of birth,
gender, marital status, salary, emergency contact. Under the DPDP Act 2023
every extra sensitive field is an obligation for no operational benefit at this
scale. A test fails if any of them appear in the schema.
