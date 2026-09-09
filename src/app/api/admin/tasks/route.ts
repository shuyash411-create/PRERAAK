import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { formatIstDate, istDateToUtcMidnight } from "@/lib/ist";
import { createTask } from "@/lib/validation/task";

/**
 * Create a task and give it to people.
 *
 * Assignment is an admin act; submitting against it is not. The two are kept
 * apart deliberately — work is authored by the person who did it.
 */
export const POST = guarded({ action: "create", resource: { kind: "admin" } }, async ({ actor, req }) => {
  const input = createTask.parse(await readJson(req));

  const assignees = await prisma.person.findMany({
    where: { id: { in: input.assigneeIds }, status: { not: "ARCHIVED" } },
    select: { id: true, fullName: true, preferredName: true },
  });
  if (assignees.length !== input.assigneeIds.length) {
    throw new RequestError(400, "unknown_assignee", "One of those people could not be found.");
  }

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        teamId: input.teamId ?? null,
        dueDate: istDateToUtcMidnight(input.dueDate),
        priority: input.priority,
        createdById: actor.id,
        assignments: {
          create: assignees.map((person) => ({
            personId: person.id,
            assignedById: actor.id,
          })),
        },
      },
      include: { assignments: true },
    });

    for (const person of assignees) {
      await recordEvent(tx, {
        personId: person.id,
        eventType: "TASK_ASSIGNED",
        description: `Assigned "${created.title}", due ${formatIstDate(input.dueDate)}.`,
        actorId: actor.id,
        metadata: { taskId: created.id, dueDate: input.dueDate },
      });
    }

    return created;
  });

  return NextResponse.json(
    { task: { ...task, dueDate: input.dueDate } },
    { status: 201 },
  );
});
