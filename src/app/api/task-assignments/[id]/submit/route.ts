import { NextResponse } from "next/server";
import { guarded, RequestError } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { formatIstDate, utcMidnightToIstDate } from "@/lib/ist";

type Params = { id: string };

/**
 * Hand in a task. One way.
 *
 * Afterwards the submission is read-only to its author and to admins alike.
 * There is no unsubmit route and no delete route; a mistake is fixed by a
 * correction request, which preserves what was originally written.
 */
export const POST = guarded<Params>(
  { action: "submit", resource: ({ params }) => ({ kind: "task_assignment", id: params.id }) },
  async ({ actor, params }) => {
    const submitted = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: two taps arriving together must not
      // both pass the status check.
      const current = await tx.taskAssignment.findUnique({
        where: { id: params.id },
        include: { task: { select: { title: true, dueDate: true } } },
      });
      if (!current) throw new RequestError(404, "not_found", "That assignment no longer exists.");
      if (current.status === "SUBMITTED") {
        throw new RequestError(409, "already_submitted", "That task is already submitted.");
      }
      if (!current.submissionNote?.trim()) {
        throw new RequestError(400, "nothing_to_submit", "Write a short note before submitting.");
      }

      const assignment = await tx.taskAssignment.update({
        where: { id: params.id },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });

      await recordEvent(tx, {
        personId: actor.id,
        eventType: "TASK_SUBMITTED",
        description: `Submitted "${current.task.title}", due ${formatIstDate(utcMidnightToIstDate(current.task.dueDate))}.`,
        actorId: actor.id,
        metadata: { taskId: assignment.taskId, assignmentId: assignment.id },
      });

      return assignment;
    });

    return NextResponse.json({ assignment: submitted });
  },
);
