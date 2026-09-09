import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { formatIstDate, utcMidnightToIstDate } from "@/lib/ist";
import { assignTask } from "@/lib/validation/task";

type Params = { id: string };

/**
 * Add or remove assignees.
 *
 * Removing somebody who has already submitted is refused: their submission is
 * a record of work they did, and unassigning them would orphan it.
 */
export const POST = guarded<Params>(
  { action: "update", resource: ({ params }) => ({ kind: "task", id: params.id }) },
  async ({ actor, params, req }) => {
    const input = assignTask.parse(await readJson(req));

    const task = await prisma.task.findUnique({
      where: { id: params.id },
      include: { assignments: true },
    });
    if (!task) throw new RequestError(404, "not_found", "That task no longer exists.");

    await prisma.$transaction(async (tx) => {
      for (const personId of input.remove ?? []) {
        const assignment = task.assignments.find((a) => a.personId === personId);
        if (!assignment) continue;
        if (assignment.status === "SUBMITTED") {
          throw new RequestError(
            409,
            "already_submitted",
            "That person has already submitted; their work stays on the task.",
          );
        }
        await tx.taskAssignment.delete({ where: { id: assignment.id } });
      }

      for (const personId of input.add ?? []) {
        if (task.assignments.some((a) => a.personId === personId)) continue;

        const person = await tx.person.findUnique({
          where: { id: personId },
          select: { id: true, status: true },
        });
        if (!person || person.status === "ARCHIVED") {
          throw new RequestError(400, "unknown_assignee", "That person could not be found.");
        }

        await tx.taskAssignment.create({
          data: { taskId: task.id, personId, assignedById: actor.id },
        });

        await recordEvent(tx, {
          personId,
          eventType: "TASK_ASSIGNED",
          description: `Assigned "${task.title}", due ${formatIstDate(utcMidnightToIstDate(task.dueDate))}.`,
          actorId: actor.id,
          metadata: { taskId: task.id },
        });
      }
    });

    const updated = await prisma.task.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        assignments: {
          include: { person: { select: { id: true, personId: true, fullName: true } } },
        },
      },
    });

    return NextResponse.json({
      task: { ...updated, dueDate: utcMidnightToIstDate(updated.dueDate) },
    });
  },
);
