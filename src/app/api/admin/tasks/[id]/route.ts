import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { assertWritable } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { istDateToUtcMidnight, utcMidnightToIstDate } from "@/lib/ist";
import { updateTask } from "@/lib/validation/task";

type Params = { id: string };

/** Edit a task. Never touches anybody's submission. */
export const PATCH = guarded<Params>(
  { action: "update", resource: ({ params }) => ({ kind: "task", id: params.id }) },
  async ({ grant, params, req }) => {
    const body = await readJson(req);
    assertWritable(grant, body);
    const input = updateTask.parse(body);

    const existing = await prisma.task.findUnique({ where: { id: params.id } });
    if (!existing) throw new RequestError(404, "not_found", "That task no longer exists.");

    const task = await prisma.task.update({
      where: { id: params.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        ...(input.dueDate !== undefined ? { dueDate: istDateToUtcMidnight(input.dueDate) } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    return NextResponse.json({
      task: { ...task, dueDate: utcMidnightToIstDate(task.dueDate) },
    });
  },
);
