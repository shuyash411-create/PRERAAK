import { CorrectionStatus, type CorrectionTarget } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { RequestError } from "@/lib/guarded";
import { CORRECTABLE_FIELDS } from "@/lib/validation/correction";

/**
 * The only way a submitted record changes.
 *
 * Approval runs as one transaction: the target's current values are
 * snapshotted into `previousValue` first, then the proposal is applied, then
 * the timeline records both. Nothing is ever overwritten without its previous
 * value being written down in the same commit — if the snapshot fails, the
 * change does not happen.
 */

type Decision = "APPROVE" | "REJECT";

export async function decideCorrection(params: {
  correctionId: string;
  decision: Decision;
  adminId: string;
  note?: string;
}): Promise<{ status: CorrectionStatus }> {
  const { correctionId, decision, adminId, note } = params;

  return prisma.$transaction(async (tx) => {
    const correction = await tx.correctionRequest.findUnique({ where: { id: correctionId } });
    if (!correction) throw new RequestError(404, "not_found", "That correction no longer exists.");

    // A decided correction is itself a historical record. Re-deciding it would
    // overwrite who decided what and when.
    if (correction.status !== "PENDING") {
      throw new RequestError(
        409,
        "already_decided",
        `That correction was already ${correction.status.toLowerCase()}.`,
      );
    }

    if (decision === "REJECT") {
      await tx.correctionRequest.update({
        where: { id: correctionId },
        data: { status: "REJECTED", decidedById: adminId, decidedAt: new Date() },
      });

      await recordEvent(tx, {
        personId: correction.requestedById,
        eventType: "CORRECTION_REJECTED",
        description: `Correction to ${label(correction.targetType)} was rejected.`,
        actorId: adminId,
        metadata: { correctionId, targetType: correction.targetType, targetId: correction.targetId, note },
      });

      return { status: CorrectionStatus.REJECTED };
    }

    const proposed = correction.proposedValue as Record<string, unknown>;
    const allowed = CORRECTABLE_FIELDS[correction.targetType] as readonly string[];

    // Re-checked at apply time, not only at request time: a row that has sat in
    // the queue must not be able to reach a field the rules no longer permit.
    const disallowed = Object.keys(proposed).filter((key) => !allowed.includes(key));
    if (disallowed.length > 0) {
      throw new RequestError(
        409,
        "uncorrectable_field",
        `A correction cannot change: ${disallowed.join(", ")}.`,
      );
    }

    const previousValue = await snapshot(tx, correction.targetType, correction.targetId, Object.keys(proposed));

    if (correction.targetType === "WORK_LOG") {
      await tx.workLog.update({ where: { id: correction.targetId }, data: proposed });
    } else if (correction.targetType === "WEEKLY_REPORT") {
      await tx.weeklyReport.update({ where: { id: correction.targetId }, data: proposed });
    } else {
      await tx.taskAssignment.update({ where: { id: correction.targetId }, data: proposed });
    }

    await tx.correctionRequest.update({
      where: { id: correctionId },
      data: {
        status: "APPROVED",
        previousValue: previousValue as never,
        decidedById: adminId,
        decidedAt: new Date(),
      },
    });

    await recordEvent(tx, {
      personId: correction.requestedById,
      eventType: "CORRECTION_APPROVED",
      description: `Correction to ${label(correction.targetType)} was approved.`,
      actorId: adminId,
      metadata: {
        correctionId,
        targetType: correction.targetType,
        targetId: correction.targetId,
        previousValue,
        newValue: proposed,
        note,
      },
    });

    return { status: CorrectionStatus.APPROVED };
  });
}

/** The target's current values for exactly the fields about to change. */
async function snapshot(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  targetType: CorrectionTarget,
  targetId: string,
  fields: string[],
): Promise<Record<string, unknown>> {
  const record =
    targetType === "WORK_LOG"
      ? await tx.workLog.findUnique({ where: { id: targetId } })
      : targetType === "WEEKLY_REPORT"
        ? await tx.weeklyReport.findUnique({ where: { id: targetId } })
        : await tx.taskAssignment.findUnique({ where: { id: targetId } });

  if (!record) throw new RequestError(404, "not_found", "The record being corrected no longer exists.");

  const source = record as unknown as Record<string, unknown>;
  return Object.fromEntries(fields.map((field) => [field, source[field] ?? null]));
}

function label(target: CorrectionTarget): string {
  if (target === "WORK_LOG") return "a work log";
  if (target === "WEEKLY_REPORT") return "a weekly report";
  return "a task submission";
}
