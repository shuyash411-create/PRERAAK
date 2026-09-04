import { NextResponse } from "next/server";
import { guarded, RequestError } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { utcMidnightToIstDate, formatIstDate } from "@/lib/ist";
import { serializeWorkLog } from "@/lib/serialize";

type Params = { id: string };

/**
 * Submit a work log. One way.
 *
 * After this the record is read-only to its author, permanently. There is no
 * unsubmit route and no delete route; a mistake is fixed by asking for a
 * correction, which preserves what was originally written.
 */
export const POST = guarded<Params>(
  { action: "submit", resource: ({ params }) => ({ kind: "work_log", id: params.id }) },
  async ({ actor, params }) => {
    const submitted = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: two taps arriving together must not
      // both pass the status check.
      const current = await tx.workLog.findUnique({ where: { id: params.id } });
      if (!current) throw new RequestError(404, "not_found", "That work log no longer exists.");
      if (current.status === "SUBMITTED") {
        throw new RequestError(409, "already_submitted", "That work log is already submitted.");
      }

      const log = await tx.workLog.update({
        where: { id: params.id },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });

      await recordEvent(tx, {
        personId: actor.id,
        eventType: "WORK_LOG_SUBMITTED",
        description: `Work log for ${formatIstDate(utcMidnightToIstDate(log.workDate))} submitted.`,
        actorId: actor.id,
        metadata: { workLogId: log.id, workDate: utcMidnightToIstDate(log.workDate) },
      });

      return log;
    });

    return NextResponse.json({ workLog: serializeWorkLog(submitted) });
  },
);
