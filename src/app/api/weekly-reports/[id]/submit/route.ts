import { NextResponse } from "next/server";
import { guarded, RequestError } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { formatIstDate, utcMidnightToIstDate } from "@/lib/ist";
import { serializeWeeklyReport } from "@/lib/serialize";

type Params = { id: string };

/** Submit a weekly report. One way, same as a work log. */
export const POST = guarded<Params>(
  { action: "submit", resource: ({ params }) => ({ kind: "weekly_report", id: params.id }) },
  async ({ actor, params }) => {
    const submitted = await prisma.$transaction(async (tx) => {
      const current = await tx.weeklyReport.findUnique({ where: { id: params.id } });
      if (!current) throw new RequestError(404, "not_found", "That report no longer exists.");
      if (current.status === "SUBMITTED") {
        throw new RequestError(409, "already_submitted", "That report is already submitted.");
      }

      const report = await tx.weeklyReport.update({
        where: { id: params.id },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });

      await recordEvent(tx, {
        personId: actor.id,
        eventType: "WEEKLY_REPORT_SUBMITTED",
        description: `Weekly report for the week of ${formatIstDate(utcMidnightToIstDate(report.weekStart))} submitted.`,
        actorId: actor.id,
        metadata: { weeklyReportId: report.id, weekStart: utcMidnightToIstDate(report.weekStart) },
      });

      return report;
    });

    return NextResponse.json({ weeklyReport: serializeWeeklyReport(submitted) });
  },
);
