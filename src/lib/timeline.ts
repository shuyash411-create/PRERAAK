import type { Db } from "@/lib/prisma";

/**
 * Append-only history.
 *
 * This module exports exactly one function, and it inserts. There is
 * deliberately no update, no delete, and no upsert here — not because they are
 * guarded, but because they do not exist to import. A database trigger rejects
 * both operations independently, and a test greps the tree for any Prisma call
 * that would attempt one.
 */

export const TIMELINE_EVENT_TYPES = [
  "PERSON_CREATED",
  "PERSON_UPDATED",
  "PERSON_ARCHIVED",
  "ENGAGEMENT_CREATED",
  "ENGAGEMENT_CLOSED",
  "WORK_LOG_SUBMITTED",
  "WEEKLY_REPORT_SUBMITTED",
  "CORRECTION_REQUESTED",
  "CORRECTION_APPROVED",
  "CORRECTION_REJECTED",
  "ONBOARDING_SUBMITTED",
  "ONBOARDING_CONFIRMED",
  "ONBOARDING_REJECTED",
  "TASK_ASSIGNED",
  "TASK_SUBMITTED",
  "WORK_LOG_REVIEWED",
  "WEEKLY_REPORT_REVIEWED",
  "TASK_REVIEWED",
  "DATA_EXPORTED",
  "DOCUMENT_ISSUED",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export type TimelineEntry = {
  /** The person the event is about. */
  personId: string;
  eventType: TimelineEventType;
  description: string;
  /** The person who caused it. Null for system-generated events. */
  actorId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Record something that happened. Pass the transaction client when the event
 * accompanies a write, so history and the change it describes commit together.
 */
export async function recordEvent(db: Db, entry: TimelineEntry): Promise<void> {
  await db.timelineEvent.create({
    data: {
      personId: entry.personId,
      eventType: entry.eventType,
      description: entry.description,
      actorId: entry.actorId ?? null,
      metadata: (entry.metadata ?? undefined) as never,
    },
  });
}
