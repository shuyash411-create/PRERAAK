"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError, assertWritable } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { istDateToUtcMidnight } from "@/lib/ist";
import { recordEvent } from "@/lib/timeline";
import { submitOnboarding } from "@/lib/validation/onboarding";

export type ActionResult = { ok: true } | { ok: false; message: string };

function friendly(error: unknown): ActionResult {
  if (error instanceof AuthzError) return { ok: false, message: error.message };
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: { message: string }[] }).issues;
    return { ok: false, message: issues[0]?.message ?? "Check the form and try again." };
  }
  console.error("[preraak] onboarding action failed:", error);
  return { ok: false, message: "Something went wrong at our end. Try again in a moment." };
}

/**
 * Save the actor's own onboarding details.
 *
 * Goes through the same `authorize` call as the API route: a server action is
 * a route by another name, and skipping the check here would be the same hole.
 */
export async function saveOnboarding(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    const grant = await authorize(actor, "create", {
      kind: "onboarding",
      personId: actor?.id ?? "",
    });
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const raw = {
      preferredName: formData.get("preferredName") || undefined,
      phone: formData.get("phone") || undefined,
      college: formData.get("college") || undefined,
      course: formData.get("course") || undefined,
      graduationYear: formData.get("graduationYear") || undefined,
      requestedTeamId: formData.get("requestedTeamId") || null,
      requestedDesignation: formData.get("requestedDesignation"),
      requestedType: formData.get("requestedType") || "INTERNSHIP",
      proposedStartDate: formData.get("proposedStartDate"),
    };
    assertWritable(grant, Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)));
    const input = submitOnboarding.parse(raw);

    await prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id: actor.id },
        data: {
          preferredName: input.preferredName ?? null,
          phone: input.phone ?? null,
          college: input.college ?? null,
          course: input.course ?? null,
          graduationYear: input.graduationYear ?? null,
        },
      });

      const data = {
        requestedTeamId: input.requestedTeamId ?? null,
        requestedDesignation: input.requestedDesignation,
        requestedType: input.requestedType,
        proposedStartDate: istDateToUtcMidnight(input.proposedStartDate),
        status: "PENDING" as const,
      };

      const existing = await tx.onboardingSubmission.findUnique({
        where: { personId: actor.id },
        select: { id: true },
      });

      await tx.onboardingSubmission.upsert({
        where: { personId: actor.id },
        create: { personId: actor.id, ...data },
        update: data,
      });

      if (!existing) {
        await recordEvent(tx, {
          personId: actor.id,
          eventType: "ONBOARDING_SUBMITTED",
          description: "Onboarding details submitted, waiting for confirmation.",
          actorId: actor.id,
          metadata: { requestedDesignation: input.requestedDesignation },
        });
      }
    });

    revalidatePath("/onboarding");
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}
