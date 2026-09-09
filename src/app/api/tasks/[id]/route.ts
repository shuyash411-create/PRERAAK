import { NextResponse } from "next/server";
import { guarded, RequestError } from "@/lib/guarded";
import { visiblePeopleFilter } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { utcMidnightToIstDate } from "@/lib/ist";

type Params = { id: string };

export const GET = guarded<Params>(
  { action: "read", resource: ({ params }) => ({ kind: "task", id: params.id }) },
  async ({ actor, params }) => {
    const visible = await visiblePeopleFilter(actor);
    const visibleIds = "personId" in visible && typeof visible.personId === "object"
      ? visible.personId.in
      : [actor.id];

    const task = await prisma.task.findUnique({
      where: { id: params.id },
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true, preferredName: true } },
        assignments: {
          where: actor.isAdmin ? {} : { personId: { in: visibleIds } },
          include: {
            person: { select: { id: true, personId: true, fullName: true, preferredName: true } },
          },
        },
      },
    });
    if (!task) throw new RequestError(404, "not_found", "That task no longer exists.");

    return NextResponse.json({
      task: { ...task, dueDate: utcMidnightToIstDate(task.dueDate) },
    });
  },
);
