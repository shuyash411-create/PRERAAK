"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { istDateString, istDateToUtcMidnight, istWeekBounds, addIstDays } from "@/lib/ist";
import { currentEngagementId } from "@/lib/engagement";
import { recordEvent } from "@/lib/timeline";
import { formatIstDate, utcMidnightToIstDate } from "@/lib/ist";
import { createWorkLog } from "@/lib/validation/work-log";
import { createWeeklyReport } from "@/lib/validation/weekly-report";
import { createCorrection } from "@/lib/validation/correction";

/**
 * Server actions for the submission screens.
 *
 * These go through the same `authorize` call as the API routes. A server
 * action is a route by another name, and skipping the check here would be the
 * same hole as skipping it there.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

function friendly(error: unknown): ActionResult {
  if (error instanceof AuthzError) return { ok: false, message: error.message };
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: { message: string }[] }).issues;
    return { ok: false, message: issues[0]?.message ?? "Check the form and try again." };
  }
  console.error("[preraak] server action failed:", error);
  return { ok: false, message: "Something went wrong at our end. Try again in a moment." };
}

/** Save today's work as a draft, or update the existing draft. */
export async function saveWorkLog(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    await authorize(actor, "create", { kind: "work_log_draft", ownerId: actor?.id ?? "" });
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const input = createWorkLog.parse({
      summary: formData.get("summary"),
      workCompleted: formData.get("workCompleted") || null,
      blockers: formData.get("blockers") || null,
      nextStep: formData.get("nextStep") || null,
    });

    const workDate = istDateString();
    const engagementId = await currentEngagementId(prisma, actor.id);
    const key = {
      personId_workDate: { personId: actor.id, workDate: istDateToUtcMidnight(workDate) },
    };

    const existing = await prisma.workLog.findUnique({ where: key });
    if (existing?.status === "SUBMITTED") {
      return { ok: false, message: "You have already submitted work for today." };
    }

    await prisma.workLog.upsert({
      where: key,
      create: {
        personId: actor.id,
        engagementId,
        workDate: istDateToUtcMidnight(workDate),
        summary: input.summary,
        workCompleted: input.workCompleted ?? null,
        blockers: input.blockers ?? null,
        nextStep: input.nextStep ?? null,
      },
      update: {
        summary: input.summary,
        workCompleted: input.workCompleted ?? null,
        blockers: input.blockers ?? null,
        nextStep: input.nextStep ?? null,
      },
    });

    revalidatePath("/my-work");
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}

/** Save and submit in one step. Submitting is one way. */
export async function submitWorkLog(formData: FormData): Promise<ActionResult> {
  const saved = await saveWorkLog(formData);
  if (!saved.ok) return saved;

  try {
    const actor = await currentActor();
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const workDate = istDateToUtcMidnight(istDateString());
    const draft = await prisma.workLog.findUnique({
      where: { personId_workDate: { personId: actor.id, workDate } },
    });
    if (!draft) return { ok: false, message: "Nothing to submit yet." };

    await authorize(actor, "submit", { kind: "work_log", id: draft.id });

    await prisma.$transaction(async (tx) => {
      const log = await tx.workLog.update({
        where: { id: draft.id },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });

      await recordEvent(tx, {
        personId: actor.id,
        eventType: "WORK_LOG_SUBMITTED",
        description: `Work log for ${formatIstDate(utcMidnightToIstDate(log.workDate))} submitted.`,
        actorId: actor.id,
        metadata: { workLogId: log.id, workDate: utcMidnightToIstDate(log.workDate) },
      });
    });

    revalidatePath("/my-work");
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}

/** Create or update this week's report draft. */
export async function saveWeeklyReport(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    await authorize(actor, "create", { kind: "weekly_report_draft", ownerId: actor?.id ?? "" });
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const input = createWeeklyReport.parse({
      workCompleted: formData.get("workCompleted"),
      deliverables: formData.get("deliverables") || null,
      challenges: formData.get("challenges") || null,
      learning: formData.get("learning") || null,
      nextWeekPlan: formData.get("nextWeekPlan") || null,
    });

    const { weekStart } = istWeekBounds();
    const engagementId = await currentEngagementId(prisma, actor.id);
    const key = {
      personId_weekStart: { personId: actor.id, weekStart: istDateToUtcMidnight(weekStart) },
    };

    const existing = await prisma.weeklyReport.findUnique({ where: key });
    if (existing?.status === "SUBMITTED") {
      return { ok: false, message: "You have already submitted this week's report." };
    }

    const content = {
      workCompleted: input.workCompleted,
      deliverables: input.deliverables ?? null,
      challenges: input.challenges ?? null,
      learning: input.learning ?? null,
      nextWeekPlan: input.nextWeekPlan ?? null,
    };

    await prisma.weeklyReport.upsert({
      where: key,
      create: {
        personId: actor.id,
        engagementId,
        weekStart: istDateToUtcMidnight(weekStart),
        weekEnd: istDateToUtcMidnight(addIstDays(weekStart, 6)),
        ...content,
      },
      update: content,
    });

    revalidatePath("/weekly");
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}

export async function submitWeeklyReport(formData: FormData): Promise<ActionResult> {
  const saved = await saveWeeklyReport(formData);
  if (!saved.ok) return saved;

  try {
    const actor = await currentActor();
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const { weekStart } = istWeekBounds();
    const draft = await prisma.weeklyReport.findUnique({
      where: {
        personId_weekStart: { personId: actor.id, weekStart: istDateToUtcMidnight(weekStart) },
      },
    });
    if (!draft) return { ok: false, message: "Nothing to submit yet." };

    await authorize(actor, "submit", { kind: "weekly_report", id: draft.id });

    await prisma.$transaction(async (tx) => {
      const report = await tx.weeklyReport.update({
        where: { id: draft.id },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });

      await recordEvent(tx, {
        personId: actor.id,
        eventType: "WEEKLY_REPORT_SUBMITTED",
        description: `Weekly report for the week of ${formatIstDate(
          utcMidnightToIstDate(report.weekStart),
        )} submitted.`,
        actorId: actor.id,
        metadata: { weeklyReportId: report.id, weekStart: utcMidnightToIstDate(report.weekStart) },
      });
    });

    revalidatePath("/weekly");
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}

/** Ask an admin to correct a submitted record. */
export async function requestCorrection(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const targetId = String(formData.get("targetId") ?? "");
    const input = createCorrection.parse({
      targetType: "WORK_LOG",
      targetId,
      reason: formData.get("reason"),
      proposedValue: { summary: formData.get("summary") },
    });

    await authorize(actor, "create", {
      kind: "correction_new",
      targetType: "WORK_LOG",
      targetId,
    });

    await prisma.$transaction(async (tx) => {
      const created = await tx.correctionRequest.create({
        data: {
          targetType: "WORK_LOG",
          targetId,
          requestedById: actor.id,
          reason: input.reason,
          proposedValue: input.proposedValue as never,
        },
      });

      await recordEvent(tx, {
        personId: actor.id,
        eventType: "CORRECTION_REQUESTED",
        description: "Correction requested for a work log.",
        actorId: actor.id,
        metadata: { correctionId: created.id, targetId, reason: input.reason },
      });
    });

    revalidatePath(`/my-work/${targetId}`);
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}
