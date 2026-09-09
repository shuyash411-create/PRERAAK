"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth";
import { assertWritable, authorize, AuthzError, type Resource } from "@/lib/authz";
import { applyReview } from "@/lib/review";
import { reviewInput } from "@/lib/validation/review";
import type { CorrectionTarget } from "@prisma/client";

export type ActionResult = { ok: true } | { ok: false; message: string };

function friendly(error: unknown): ActionResult {
  if (error instanceof AuthzError) return { ok: false, message: error.message };
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: { message: string }[] }).issues;
    return { ok: false, message: issues[0]?.message ?? "Check the form and try again." };
  }
  console.error("[preraak] review action failed:", error);
  return { ok: false, message: "Something went wrong at our end. Try again in a moment." };
}

const RESOURCE_KIND: Record<CorrectionTarget, Resource["kind"]> = {
  WORK_LOG: "work_log",
  WEEKLY_REPORT: "weekly_report",
  TASK_ASSIGNMENT: "task_assignment",
};

/**
 * Leave (or revise) a comment on somebody else's submitted work.
 *
 * One generic action rather than three near-identical ones: all three target
 * kinds share the same shape, and the task-assignment case in particular is
 * shown on a page keyed by the *task*'s id, not the assignment's — so the
 * caller already has to tell this action what to revalidate, which is enough
 * to also let it say which kind of record it's reviewing.
 */
export async function reviewRecord(formData: FormData): Promise<ActionResult> {
  try {
    const targetType = String(formData.get("targetType") ?? "") as CorrectionTarget;
    const targetId = String(formData.get("targetId") ?? "");
    const revalidateTarget = String(formData.get("revalidateTarget") ?? "");

    const kind = RESOURCE_KIND[targetType];
    if (!kind) return { ok: false, message: "That is not something that can be reviewed." };

    const actor = await currentActor();
    const grant = await authorize(actor, "review", { kind, id: targetId } as Resource);
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const body = { mentorComment: String(formData.get("mentorComment") ?? "") };
    assertWritable(grant, body);
    const input = reviewInput.parse(body);

    await applyReview({ targetType, targetId, mentorComment: input.mentorComment, actorId: actor.id });

    if (revalidateTarget) revalidatePath(revalidateTarget);
    revalidatePath("/my-people");

    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}
