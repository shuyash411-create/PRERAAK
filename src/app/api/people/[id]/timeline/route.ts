import { NextResponse } from "next/server";
import { guarded } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";

type Params = { id: string };

/**
 * A person's history.
 *
 * Read-only, and read-only in a structural sense: this file exports GET and
 * nothing else, and there is no PATCH, PUT or DELETE handler for timeline
 * events anywhere in the application. A database trigger rejects both
 * operations independently.
 */
export const GET = guarded<Params>(
  { action: "read", resource: ({ params }) => ({ kind: "timeline", personId: params.id }) },
  async ({ params }) => {
    const events = await prisma.timelineEvent.findMany({
      where: { personId: params.id },
      orderBy: { occurredAt: "desc" },
      include: {
        actor: { select: { id: true, personId: true, fullName: true, preferredName: true } },
      },
      take: 500,
    });

    return NextResponse.json({
      timeline: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        description: event.description,
        actor: event.actor,
        metadata: event.metadata,
        occurredAt: event.occurredAt.toISOString(),
      })),
    });
  },
);
