import { config } from "dotenv";

/**
 * Tests run against a throwaway local database, never a deployed one.
 *
 * `.env.test` is loaded with `override: true` deliberately. dotenv leaves
 * already-set variables alone by default, so an ambient DATABASE_URL — one
 * exported by a shell profile, a session hook, or a developer who ran
 * `export DATABASE_URL=...` an hour ago — would otherwise win and point the
 * suite at a development database. Since every test truncates every table,
 * the test database has to be the one that wins.
 */
config({ path: ".env.test", override: true, quiet: true });

const env = process.env as Record<string, string | undefined>;

env.NODE_ENV ??= "test";
// .env.test is gitignored; these defaults make a fresh clone runnable.
env.DATABASE_URL ??= "postgresql://preraak:preraak@127.0.0.1:5432/preraak_test";
env.AUTH_SECRET ??= "test-secret-not-for-production-use-only";
env.AUTH_URL ??= "http://localhost:3000";
env.EMAIL_FROM ??= "PRERAAK People OS <test@example.com>";

const url = env.DATABASE_URL as string;
const isLocal = /@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url);
const looksLikeTestDb = /_test(\b|$)/.test(url);

// Belt to the override's braces: whatever ended up winning, refuse anything
// that is not an obviously local, obviously disposable test database.
if (!isLocal || !looksLikeTestDb) {
  throw new Error(
    `Refusing to run tests against ${url.replace(/:[^:@/]*@/, ":***@")}. ` +
      "Tests truncate all tables and require a local database whose name ends in _test. " +
      "Check .env.test, or unset DATABASE_URL in your shell.",
  );
}
