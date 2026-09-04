import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { assertWritable, visiblePeopleFilter } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { istDateString, istDateToUtcMidnight } from "@/lib/ist";
import { currentEngagementId } from "@/lib/engagement";
import { serializeWorkLog } from "@/lib/serialize";
import { createWorkLog, listWorkLogs } from "@/lib/validation/work-log";

/**
 * List work logs within the actor's scope.
 *
 * The scope filter is applied in the database query, not to the results after
 * fetching, so there is no window in which out-of-scope rows exist in memory.
 */
export const GET = guarded({ action: "read", resource: { kind: "self" } }, async ({ actor, req }) => {
  const url = new URL(req.url);
  const query = listWorkLogs.parse(Object.fromEntries(url.searchParams));

  const visible = await visiblePeopleFilter(actor);

  // A caller may narrow to one person, but only within what they may already
  // see: the narrowing intersects the scope filter, it does not replace it.
  if (query.personId) {
    const permitted =
      "personId" in visible && typeof visible.personId === "object"
        ? visible.personId.in.includes(query.personId)
        : false;
    if (!permitted) {
      return NextResponse.json(
        { error: "forbidden", message: "You do not have access to that person's records." },
        { status: 403 },
      );
    }
  }

  const logs = await prisma.workLog.findMany({
    where: {
      ...(query.personId ? { personId: query.personId } : visible),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            workDate: {
              ...(query.from ? { gte: istDateToUtcMidnight(query.from) } : {}),
              ...(query.to ? { lte: istDateToUtcMidnight(query.to) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({ workLogs: logs.map(serializeWorkLog) });
});

/**
 * Create a draft for today, or update the one that already exists.
 *
 * Idempotent by IST day: a double tap on a phone with a flaky connection must
 * not produce two logs, and the unique index on (person, work_date) makes that
 * a database guarantee rather than a hopeful check. An already-submitted day
 * is refused rather than silently reopened.
 */
export const POST = guarded(
  {
    action: "create",
    resource: ({ actor }) => ({ kind: "work_log_draft", ownerId: actor.id }),
  },
  async ({ actor, grant, req }) => {
    const body = await readJson(req);
    const input = createWorkLog.parse(body);

    // The server decides the date. A phone with a wrong clock or a traveller's
    // timezone must not be able to file work against the wrong day.
    const { workDate: requestedDate, ...content } = input;
    const workDate = requestedDate ?? istDateString();
    assertWritable(grant, content);

    const engagementId = await currentEngagementId(prisma, actor.id);

    const existing = await prisma.workLog.findUnique({
      where: { personId_workDate: { personId: actor.id, workDate: istDateToUtcMidnight(workDate) } },
    });

    if (existing?.status === "SUBMITTED") {
      throw new RequestError(
        409,
        "already_submitted",
        "You have already submitted work for that day. Ask for a correction instead.",
      );
    }

    const log = await prisma.workLog.upsert({
      where: { personId_workDate: { personId: actor.id, workDate: istDateToUtcMidnight(workDate) } },
      create: {
        personId: actor.id,
        engagementId,
        workDate: istDateToUtcMidnight(workDate),
        summary: content.summary,
        workCompleted: content.workCompleted ?? null,
        blockers: content.blockers ?? null,
        nextStep: content.nextStep ?? null,
        links: content.links ?? [],
      },
      update: {
        summary: content.summary,
        workCompleted: content.workCompleted ?? null,
        blockers: content.blockers ?? null,
        nextStep: content.nextStep ?? null,
        ...(content.links ? { links: content.links } : {}),
      },
    });

    return NextResponse.json({ workLog: serializeWorkLog(log) }, { status: existing ? 200 : 201 });
  },
);
