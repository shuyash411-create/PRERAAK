import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { visiblePeopleFilter } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { addIstDays, istDateToUtcMidnight, istWeekBounds } from "@/lib/ist";
import { currentEngagementId } from "@/lib/engagement";
import { serializeWeeklyReport } from "@/lib/serialize";
import { createWeeklyReport, listWeeklyReports } from "@/lib/validation/weekly-report";

export const GET = guarded({ action: "read", resource: { kind: "self" } }, async ({ actor, req }) => {
  const url = new URL(req.url);
  const query = listWeeklyReports.parse(Object.fromEntries(url.searchParams));
  const visible = await visiblePeopleFilter(actor);

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

  const reports = await prisma.weeklyReport.findMany({
    where: {
      ...(query.personId ? { personId: query.personId } : visible),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: { weekStart: "desc" },
    take: 100,
  });

  return NextResponse.json({ weeklyReports: reports.map(serializeWeeklyReport) });
});

/**
 * Create or update this week's draft. Weeks run Monday to Sunday in IST and
 * are derived server-side, so a report filed at 01:30 on Monday belongs to the
 * new week rather than the one that just ended.
 */
export const POST = guarded(
  {
    action: "create",
    resource: ({ actor }) => ({ kind: "weekly_report_draft", ownerId: actor.id }),
  },
  async ({ actor, req }) => {
    const input = createWeeklyReport.parse(await readJson(req));

    const weekStart = input.weekStart ?? istWeekBounds().weekStart;
    const weekEnd = addIstDays(weekStart, 6);

    const engagementId = await currentEngagementId(prisma, actor.id);
    const key = { personId_weekStart: { personId: actor.id, weekStart: istDateToUtcMidnight(weekStart) } };

    const existing = await prisma.weeklyReport.findUnique({ where: key });
    if (existing?.status === "SUBMITTED") {
      throw new RequestError(
        409,
        "already_submitted",
        "You have already submitted a report for that week. Ask for a correction instead.",
      );
    }

    const report = await prisma.weeklyReport.upsert({
      where: key,
      create: {
        personId: actor.id,
        engagementId,
        weekStart: istDateToUtcMidnight(weekStart),
        weekEnd: istDateToUtcMidnight(weekEnd),
        workCompleted: input.workCompleted,
        deliverables: input.deliverables ?? null,
        challenges: input.challenges ?? null,
        learning: input.learning ?? null,
        nextWeekPlan: input.nextWeekPlan ?? null,
      },
      update: {
        workCompleted: input.workCompleted,
        deliverables: input.deliverables ?? null,
        challenges: input.challenges ?? null,
        learning: input.learning ?? null,
        nextWeekPlan: input.nextWeekPlan ?? null,
      },
    });

    return NextResponse.json(
      { weeklyReport: serializeWeeklyReport(report) },
      { status: existing ? 200 : 201 },
    );
  },
);
