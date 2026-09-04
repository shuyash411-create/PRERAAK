import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { formatIstDate, istDateToUtcMidnight, utcMidnightToIstDate } from "@/lib/ist";
import { closeEngagement } from "@/lib/validation/person";

type Params = { id: string };

/**
 * Close an engagement.
 *
 * The row is not deleted and its content is not rewritten: an end date and a
 * final status are set, and everything filed against it stays filed against
 * it. Opening the next engagement is a separate, deliberate act.
 */
export const POST = guarded<Params>(
  { action: "update", resource: ({ params }) => ({ kind: "engagement", id: params.id }) },
  async ({ actor, params, req }) => {
    const input = closeEngagement.parse(await readJson(req));

    const engagement = await prisma.$transaction(async (tx) => {
      const current = await tx.engagement.findUnique({ where: { id: params.id } });
      if (!current) throw new RequestError(404, "not_found", "No such engagement.");

      if (current.status === "COMPLETED" || current.status === "TERMINATED") {
        throw new RequestError(409, "already_closed", "That engagement is already closed.");
      }

      if (input.endDate < utcMidnightToIstDate(current.startDate)) {
        throw new RequestError(400, "end_before_start", "An engagement cannot end before it starts.");
      }

      const closed = await tx.engagement.update({
        where: { id: params.id },
        data: { endDate: istDateToUtcMidnight(input.endDate), status: input.status },
      });

      await recordEvent(tx, {
        personId: closed.personId,
        eventType: "ENGAGEMENT_CLOSED",
        description: `${closed.designation} ended on ${formatIstDate(input.endDate)} (${input.status.toLowerCase()}).`,
        actorId: actor.id,
        metadata: {
          engagementId: closed.id,
          endDate: input.endDate,
          status: input.status,
        },
      });

      return closed;
    });

    return NextResponse.json({ engagement });
  },
);
