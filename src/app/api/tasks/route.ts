import { NextResponse } from "next/server";
import { guarded } from "@/lib/guarded";
import { visiblePeopleFilter } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { utcMidnightToIstDate } from "@/lib/ist";
import { listTasks } from "@/lib/validation/task";

/**
 * Tasks in the actor's scope.
 *
 * Filtered at the query, not after fetching: a person sees tasks they are on,
 * a mentor sees tasks their mentees are on, an admin sees everything.
 */
export const GET = guarded({ action: "read", resource: { kind: "self" } }, async ({ actor, req }) => {
  const query = listTasks.parse(Object.fromEntries(new URL(req.url).searchParams));

  const visible = await visiblePeopleFilter(actor);
  const visibleIds = "personId" in visible && typeof visible.personId === "object"
    ? visible.personId.in
    : [actor.id];

  const scopeFilter =
    actor.isAdmin && query.mine !== "true"
      ? {}
      : { assignments: { some: { personId: { in: query.mine === "true" ? [actor.id] : visibleIds } } } };

  const tasks = await prisma.task.findMany({
    where: {
      ...scopeFilter,
      ...(query.status ? { status: query.status } : {}),
      ...(query.teamId ? { teamId: query.teamId } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      team: { select: { id: true, name: true } },
      assignments: {
        // A person must not learn who else is on a task unless they may see
        // those people anyway.
        where: actor.isAdmin ? {} : { personId: { in: visibleIds } },
        include: {
          person: { select: { id: true, personId: true, fullName: true, preferredName: true } },
        },
      },
    },
  });

  return NextResponse.json({
    tasks: tasks.map((task) => ({
      ...task,
      dueDate: utcMidnightToIstDate(task.dueDate),
    })),
  });
});
