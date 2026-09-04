import { config } from "dotenv";

// Tests run against a throwaway local database, never a deployed one.
// .env.test is gitignored; these defaults make a fresh clone runnable.
config({ path: ".env.test", quiet: true });

// NODE_ENV is typed read-only by @types/node; assign through the index signature.
(process.env as Record<string, string | undefined>).NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://preraak:preraak@127.0.0.1:5432/preraak_test";
process.env.AUTH_SECRET ??= "test-secret-not-for-production-use-only";
process.env.AUTH_URL ??= "http://localhost:3000";
process.env.EMAIL_FROM ??= "PRERAAK People OS <test@example.com>";

const url = process.env.DATABASE_URL;
const isLocal = /@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url);
const looksLikeTestDb = /preraak_test|_test\b|\btest\b/.test(url);

// Tests truncate every table. Refuse to point at anything that is not an
// obviously local, obviously disposable database.
if (!isLocal || !looksLikeTestDb) {
  throw new Error(
    `Refusing to run tests against ${url.replace(/:[^:@/]*@/, ":***@")}. ` +
      "Tests truncate all tables and require a local *_test database.",
  );
}
