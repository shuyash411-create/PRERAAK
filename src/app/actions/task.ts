"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth";
import { assertWritable, authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { formatIstDate, utcMidnightToIstDate } from "@/lib/ist";
import { updateSubmission } from "@/lib/validation/task";

export type ActionResult = { ok: true } | { ok: false; message: string };

function friendly(error: unknown): ActionResult {
  if (error instanceof AuthzError) return { ok: false, message: error.message };
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: { message: string }[] }).issues;
    return { ok: false, message: issues[0]?.message ?? "Check the form and try again." };
  }
  if (error && typeof error === "object" && "message" in error && "status" in error) {
    return { ok: false, message: String((error as { message: string }).message) };
  }
  console.error("[preraak] task action failed:", error);
  return { ok: false, message: "Something went wrong at our end. Try again in a moment." };
}

/** Save a draft submission without handing it in. */
export async function saveSubmission(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    const assignmentId = String(formData.get("assignmentId") ?? "");
    const grant = await authorize(actor, "update", {
      kind: "task_assignment",
      id: assignmentId,
    });
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const body = { submissionNote: String(formData.get("submissionNote") ?? "") };
    assertWritable(grant, body);
    const input = updateSubmission.parse(body);

    await prisma.taskAssignment.update({
      where: { id: assignmentId },
      data: { submissionNote: input.submissionNote ?? null, status: "IN_PROGRESS" },
    });

    revalidatePath("/tasks");
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}

/** Save and hand in. One way — afterwards only a correction can change it. */
export async function submitAssignment(formData: FormData): Promise<ActionResult> {
  const saved = await saveSubmission(formData);
  if (!saved.ok) return saved;

  try {
    const actor = await currentActor();
    const assignmentId = String(formData.get("assignmentId") ?? "");
    await authorize(actor, "submit", { kind: "task_assignment", id: assignmentId });
    if (!actor) throw new AuthzError(401, "unauthenticated");

    await prisma.$transaction(async (tx) => {
      const current = await tx.taskAssignment.findUnique({
        where: { id: assignmentId },
        include: { task: { select: { title: true, dueDate: true } } },
      });
      if (!current) throw new AuthzError(403, "not_found", "That assignment no longer exists.");
      if (current.status === "SUBMITTED") {
        throw new AuthzError(403, "already_submitted", "That task is already submitted.");
      }
      if (!current.submissionNote?.trim()) {
        throw new AuthzError(403, "nothing_to_submit", "Write a short note before submitting.");
      }

      await tx.taskAssignment.update({
        where: { id: assignmentId },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });

      await recordEvent(tx, {
        personId: actor.id,
        eventType: "TASK_SUBMITTED",
        description: `Submitted "${current.task.title}", due ${formatIstDate(utcMidnightToIstDate(current.task.dueDate))}.`,
        actorId: actor.id,
        metadata: { taskId: current.taskId, assignmentId },
      });
    });

    revalidatePath("/tasks");
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}
