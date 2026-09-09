import type { CorrectionTarget } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { RequestError } from "@/lib/guarded";

/**
 * A mentor or admin leaving a comment on somebody else's submitted work.
 *
 * Unlike a work log's own content, this is not write-once: nothing calls
 * review an irreversible act, and there is no correction path for
 * `mentorComment`, so freezing it after one write would make a typo
 * permanent. Every write — first or revised — appends its own timeline event
 * carrying both the previous and new text, so the full history survives even
 * though the live field is just current state.
 *
 * Reuses `CorrectionTarget` for the three record kinds rather than inventing
 * a parallel enum: work logs, weekly reports and task assignments are exactly
 * the three kinds of thing this system lets somebody comment on, correction
 * or review alike.
 */

const TARGET_EVENT: Record<CorrectionTarget, "WORK_LOG_REVIEWED" | "WEEKLY_REPORT_REVIEWED" | "TASK_REVIEWED"> = {
  WORK_LOG: "WORK_LOG_REVIEWED",
  WEEKLY_REPORT: "WEEKLY_REPORT_REVIEWED",
  TASK_ASSIGNMENT: "TASK_REVIEWED",
};

const TARGET_LABEL: Record<CorrectionTarget, string> = {
  WORK_LOG: "a work log",
  WEEKLY_REPORT: "a weekly report",
  TASK_ASSIGNMENT: "a task submission",
};

export async function applyReview(params: {
  targetType: CorrectionTarget;
  targetId: string;
  mentorComment: string;
  actorId: string;
}): Promise<{ personId: string; mentorComment: string }> {
  const { targetType, targetId, mentorComment, actorId } = params;

  return prisma.$transaction(async (tx) => {
    const current =
      targetType === "WORK_LOG"
        ? await tx.workLog.findUnique({
            where: { id: targetId },
            select: { personId: true, mentorComment: true },
          })
        : targetType === "WEEKLY_REPORT"
          ? await tx.weeklyReport.findUnique({
              where: { id: targetId },
              select: { personId: true, mentorComment: true },
            })
          : await tx.taskAssignment.findUnique({
              where: { id: targetId },
              select: { personId: true, mentorComment: true },
            });

    if (!current) throw new RequestError(404, "not_found", "That record no longer exists.");

    const data = { mentorComment, reviewedById: actorId, reviewedAt: new Date() };

    if (targetType === "WORK_LOG") {
      await tx.workLog.update({ where: { id: targetId }, data });
    } else if (targetType === "WEEKLY_REPORT") {
      await tx.weeklyReport.update({ where: { id: targetId }, data });
    } else {
      await tx.taskAssignment.update({ where: { id: targetId }, data });
    }

    await recordEvent(tx, {
      personId: current.personId,
      eventType: TARGET_EVENT[targetType],
      description: `A mentor commented on ${TARGET_LABEL[targetType]}.`,
      actorId,
      metadata: {
        targetType,
        targetId,
        previousComment: current.mentorComment,
        newComment: mentorComment,
      },
    });

    return { personId: current.personId, mentorComment };
  });
}
