import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { assertWritable } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { serializeWeeklyReport } from "@/lib/serialize";
import { updateWeeklyReport } from "@/lib/validation/weekly-report";

type Params = { id: string };

export const GET = guarded<Params>(
  { action: "read", resource: ({ params }) => ({ kind: "weekly_report", id: params.id }) },
  async ({ params }) => {
    const report = await prisma.weeklyReport.findUnique({
      where: { id: params.id },
      include: {
        person: { select: { id: true, personId: true, fullName: true, preferredName: true } },
      },
    });
    if (!report) throw new RequestError(404, "not_found", "That weekly report no longer exists.");

    return NextResponse.json({
      weeklyReport: { ...serializeWeeklyReport(report), person: report.person },
    });
  },
);

/** Edit a draft. A submitted report is refused by `authorize` before arriving. */
export const PATCH = guarded<Params>(
  { action: "update", resource: ({ params }) => ({ kind: "weekly_report", id: params.id }) },
  async ({ grant, params, req }) => {
    const body = await readJson(req);
    assertWritable(grant, body);
    const input = updateWeeklyReport.parse(body);

    const report = await prisma.weeklyReport.update({
      where: { id: params.id },
      data: {
        ...(input.workCompleted !== undefined ? { workCompleted: input.workCompleted } : {}),
        ...(input.deliverables !== undefined ? { deliverables: input.deliverables } : {}),
        ...(input.challenges !== undefined ? { challenges: input.challenges } : {}),
        ...(input.learning !== undefined ? { learning: input.learning } : {}),
        ...(input.nextWeekPlan !== undefined ? { nextWeekPlan: input.nextWeekPlan } : {}),
      },
    });

    return NextResponse.json({ weeklyReport: serializeWeeklyReport(report) });
  },
);
