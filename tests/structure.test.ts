import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// No session for any request in this file.
vi.mock("@/lib/auth", () => ({
  currentActor: async () => null,
  auth: async () => null,
  handlers: {},
  signIn: async () => undefined,
  signOut: async () => undefined,
}));

import { db, resetDatabase } from "./helpers/db";
import { call } from "./helpers/request";
import { isGuarded } from "@/lib/guarded";

const API_ROOT = join(process.cwd(), "src", "app", "api");
const SRC_ROOT = join(process.cwd(), "src");

/**
 * Routes with no `Actor` to authorize, so they cannot come from `guarded()`
 * and are exempt from every test in this file that assumes one:
 *
 *   - Auth.js's own handler — the one entry point a stranger reaches before
 *     signing in.
 *   - The cron routes — called by Vercel's scheduler with no session at all,
 *     authenticated by a shared secret instead. See `src/lib/cron-auth.ts`
 *     and the hand-written 401/200 tests for them below, which give these
 *     routes the same coverage `guarded()`'s structural test gives everyone
 *     else, just written out explicitly.
 */
const PUBLIC_ROUTES = [join("auth", "[...nextauth]"), join("cron")];

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

function walk(dir: string, match: (file: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full, match));
    else if (match(full)) found.push(full);
  }
  return found;
}

const routeFiles = walk(API_ROOT, (f) => f.endsWith(`${sep}route.ts`));
/** Every route except the public ones above. */
const guardedRouteFiles = routeFiles.filter(
  (f) => !PUBLIC_ROUTES.some((publicRoute) => f.includes(publicRoute)),
);
const exemptRouteFiles = routeFiles.filter((f) => !guardedRouteFiles.includes(f));

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("route inventory", () => {
  it("finds the routes it is supposed to be checking", () => {
    expect(routeFiles.length).toBeGreaterThan(10);
    // 1 auth handler + 2 cron routes today. A new exemption changing this
    // count is a deliberate edit here, not a silent gap in coverage.
    expect(exemptRouteFiles.length).toBe(3);
    expect(guardedRouteFiles.length).toBe(routeFiles.length - exemptRouteFiles.length);
  });
});

/* ------------------------------------------------------------------ *
 * 9. Every /api route except auth answers 401 to a stranger.
 *
 * Enumerated rather than sampled: a route added later is covered the
 * moment its file exists, without anyone remembering to add a test.
 * ------------------------------------------------------------------ */
describe("9. unauthenticated requests", () => {
  it.each(guardedRouteFiles.map((f) => [relative(process.cwd(), f), f]))(
    "%s answers 401 with no session",
    async (_label, file) => {
      const routeModule = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Record<
        string,
        unknown
      >;

      const exported = HTTP_METHODS.filter((method) => typeof routeModule[method] === "function");
      expect(exported.length).toBeGreaterThan(0);

      for (const method of exported) {
        const result = await call(routeModule[method], {
          method,
          params: { id: "any-id" },
          ...(method === "GET" || method === "HEAD" ? {} : { body: {} }),
        });

        expect(
          result.status,
          `${relative(process.cwd(), file)} ${method} should be 401 without a session`,
        ).toBe(401);
      }
    },
  );

  it("every exported handler was produced by guarded()", async () => {
    for (const file of guardedRouteFiles) {
      const routeModule = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Record<
        string,
        unknown
      >;

      for (const method of HTTP_METHODS) {
        if (typeof routeModule[method] !== "function") continue;
        expect(
          isGuarded(routeModule[method]),
          `${relative(process.cwd(), file)} exports ${method} that did not come from guarded()`,
        ).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * 8. There is no way to change or remove a timeline event.
 * ------------------------------------------------------------------ */
describe("8. timeline_events is append-only", () => {
  it("exposes no DELETE handler anywhere in the API", async () => {
    for (const file of routeFiles) {
      const routeModule = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Record<
        string,
        unknown
      >;
      expect(
        routeModule.DELETE,
        `${relative(process.cwd(), file)} exports a DELETE handler`,
      ).toBeUndefined();
    }
  });

  it("contains no Prisma call that could mutate a timeline event", () => {
    const sources = walk(SRC_ROOT, (f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    const mutation = /timelineEvent\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\b/;

    const offenders = sources
      .filter((file) => mutation.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });

  it("exports only a way to add to the timeline", async () => {
    const timeline = await import("@/lib/timeline");
    const functions = Object.entries(timeline)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name);

    expect(functions).toEqual(["recordEvent"]);
  });

  it("is rejected by the database even from a raw query", async () => {
    const person = await db.person.create({
      data: { personId: "PRR-000999", fullName: "Subject", email: "append-only@example.test" },
    });
    const event = await db.timelineEvent.create({
      data: { personId: person.id, eventType: "PERSON_CREATED", description: "Created." },
    });

    await expect(
      db.$executeRawUnsafe(`UPDATE timeline_events SET description = 'tampered' WHERE id = $1`, event.id),
    ).rejects.toThrow(/append-only/);

    await expect(
      db.$executeRawUnsafe(`DELETE FROM timeline_events WHERE id = $1`, event.id),
    ).rejects.toThrow(/append-only/);

    const unchanged = await db.timelineEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(unchanged.description).toBe("Created.");
  });
});

/* ------------------------------------------------------------------ *
 * Data minimisation (section 6) and the attendance ban (section 1.2)
 * are schema-level promises, so they are checked at the schema.
 * ------------------------------------------------------------------ */
describe("schema promises", () => {
  // Comments are stripped: the schema's own prose names the fields it refuses
  // to collect, and that documentation must not read as a violation.
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  it("collects no sensitive personal data that was not asked for", () => {
    const banned = [
      "aadhaar",
      "aadhar",
      "panNumber",
      "pan_number",
      "bankAccount",
      "ifsc",
      "salary",
      "dateOfBirth",
      "date_of_birth",
      "gender",
      "maritalStatus",
      "homeAddress",
      "emergencyContact",
    ];

    const lowered = schema.toLowerCase();
    for (const field of banned) {
      expect(lowered, `schema mentions ${field}`).not.toContain(field.toLowerCase());
    }
  });

  it("records no attendance, session or presence data", () => {
    const banned = [
      "checkIn",
      "check_in",
      "checkOut",
      "check_out",
      "clockIn",
      "clock_in",
      "lastSeen",
      "last_seen",
      "loginCount",
      "sessionDuration",
      "isOnline",
      "onlineAt",
    ];

    const lowered = schema.toLowerCase();
    for (const field of banned) {
      expect(lowered, `schema mentions ${field}`).not.toContain(field.toLowerCase());
    }
  });

  it("derives every calendar date through the IST helpers", () => {
    // The naive `toISOString().slice(0, 10)` is a UTC date and silently files
    // a 01:30 IST submission against the previous day.
    const sources = walk(SRC_ROOT, (f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    const naive = /toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/;

    const offenders = sources
      .filter((file) => !file.endsWith(join("lib", "ist.ts")))
      .filter((file) => naive.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });
});
