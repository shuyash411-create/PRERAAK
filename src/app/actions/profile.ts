"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth";
import { assertWritable, authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { updatePerson } from "@/lib/validation/person";

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Update your own details.
 *
 * The grant decides what may be written: `PERSON_SELF_FIELDS` covers contact
 * and study details and deliberately excludes email, admin status and PRERAAK
 * id. `assertWritable` rejects anything outside it, so a crafted form post
 * cannot reach a field this screen does not show.
 */
export async function updateOwnProfile(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    const grant = await authorize(actor, "update", { kind: "person", id: actor?.id ?? "" });
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const body: Record<string, unknown> = {
      preferredName: formData.get("preferredName") || undefined,
      phone: formData.get("phone") || undefined,
      college: formData.get("college") || undefined,
      course: formData.get("course") || undefined,
      graduationYear: formData.get("graduationYear") || undefined,
    };
    for (const key of Object.keys(body)) {
      if (body[key] === undefined) delete body[key];
    }

    assertWritable(grant, body);
    const input = updatePerson.parse(body);

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

      await recordEvent(tx, {
        personId: actor.id,
        eventType: "PERSON_UPDATED",
        description: "Updated their own details.",
        actorId: actor.id,
        metadata: { changed: Object.keys(body) },
      });
    });

    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, message: error.message };
    if (error && typeof error === "object" && "issues" in error) {
      const issues = (error as { issues: { message: string }[] }).issues;
      return { ok: false, message: issues[0]?.message ?? "Check the form and try again." };
    }
    console.error("[preraak] profile update failed:", error);
    return { ok: false, message: "Something went wrong at our end. Try again in a moment." };
  }
}
