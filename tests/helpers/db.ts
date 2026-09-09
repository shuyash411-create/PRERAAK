import { PrismaClient } from "@prisma/client";

export const db = new PrismaClient();

/**
 * Empty every table between tests.
 *
 * TRUNCATE is used rather than DELETE because the append-only trigger on
 * timeline_events rejects row-level DELETE — which is exactly the behaviour
 * under test. TRUNCATE fires only statement-level triggers and requires table
 * ownership, so it is available to the test harness and unreachable from
 * application code, which connects through Prisma and never issues it.
 */
export async function resetDatabase(): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      task_assignments,
      tasks,
      onboarding_submissions,
      timeline_events,
      correction_requests,
      documents,
      work_logs,
      weekly_reports,
      engagements,
      teams,
      verification_tokens,
      people
    RESTART IDENTITY CASCADE
  `);
  await db.$executeRawUnsafe("ALTER SEQUENCE person_id_seq RESTART WITH 1");
}
