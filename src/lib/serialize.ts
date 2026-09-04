import type { WeeklyReport, WorkLog } from "@prisma/client";
import { utcMidnightToIstDate } from "@/lib/ist";

/**
 * Wire shapes.
 *
 * Date columns go out as `YYYY-MM-DD` IST calendar dates so a client never has
 * to reason about offsets. Timestamps go out as ISO instants — the client
 * renders them as dates, never as clock times (section 1.2).
 */
export function serializeWorkLog(log: WorkLog) {
  return {
    id: log.id,
    personId: log.personId,
    engagementId: log.engagementId,
    workDate: utcMidnightToIstDate(log.workDate),
    summary: log.summary,
    workCompleted: log.workCompleted,
    blockers: log.blockers,
    nextStep: log.nextStep,
    links: log.links,
    status: log.status,
    submittedAt: log.submittedAt?.toISOString() ?? null,
    reviewedById: log.reviewedById,
    reviewedAt: log.reviewedAt?.toISOString() ?? null,
    mentorComment: log.mentorComment,
    createdAt: log.createdAt.toISOString(),
  };
}

export function serializeWeeklyReport(report: WeeklyReport) {
  return {
    id: report.id,
    personId: report.personId,
    engagementId: report.engagementId,
    weekStart: utcMidnightToIstDate(report.weekStart),
    weekEnd: utcMidnightToIstDate(report.weekEnd),
    workCompleted: report.workCompleted,
    deliverables: report.deliverables,
    challenges: report.challenges,
    learning: report.learning,
    nextWeekPlan: report.nextWeekPlan,
    status: report.status,
    submittedAt: report.submittedAt?.toISOString() ?? null,
    reviewedById: report.reviewedById,
    reviewedAt: report.reviewedAt?.toISOString() ?? null,
    mentorComment: report.mentorComment,
    createdAt: report.createdAt.toISOString(),
  };
}
