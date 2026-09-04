"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { allocatePersonId } from "@/lib/person-id";
import { recordEvent } from "@/lib/timeline";
import { formatIstDate, istDateString, istDateToUtcMidnight } from "@/lib/ist";
import { closeEngagement, createEngagement, createPerson } from "@/lib/validation/person";
import { decideCorrection as applyDecision } from "@/lib/corrections";

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
  console.error("[preraak] admin action failed:", error);
  return { ok: false, message: "Something went wrong at our end. Try again in a moment." };
}

/** Create a person and allocate their permanent id. */
export async function createPersonAction(formData: FormData): Promise<ActionResult> {
  let newId: string | null = null;

  try {
    const actor = await currentActor();
    await authorize(actor, "create", { kind: "admin" });
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const input = createPerson.parse({
      fullName: formData.get("fullName"),
      preferredName: formData.get("preferredName") || undefined,
      email: formData.get("email"),
      phone: formData.get("phone") || undefined,
      college: formData.get("college") || undefined,
      course: formData.get("course") || undefined,
      graduationYear: formData.get("graduationYear") || undefined,
      isAdmin: formData.get("isAdmin") === "on",
    });

    const clash = await prisma.person.findUnique({ where: { email: input.email } });
    if (clash) {
      return {
        ok: false,
        message: `${input.email} already belongs to ${clash.personId}. A person is created once and keeps that record.`,
      };
    }

    const person = await prisma.$transaction(async (tx) => {
      const created = await tx.person.create({
        data: {
          personId: await allocatePersonId(tx),
          fullName: input.fullName,
          preferredName: input.preferredName ?? null,
          email: input.email,
          phone: input.phone ?? null,
          college: input.college ?? null,
          course: input.course ?? null,
          graduationYear: input.graduationYear ?? null,
          isAdmin: input.isAdmin,
        },
      });

      await recordEvent(tx, {
        personId: created.id,
        eventType: "PERSON_CREATED",
        description: `${created.fullName} was added as ${created.personId}.`,
        actorId: actor.id,
        metadata: { personId: created.personId, isAdmin: created.isAdmin },
      });

      return created;
    });

    newId = person.id;
  } catch (error) {
    return friendly(error);
  }

  // redirect() throws, so it must sit outside the try.
  revalidatePath("/admin/people");
  redirect(`/admin/people/${newId}`);
}

/** Open an engagement for a person. */
export async function createEngagementAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    await authorize(actor, "create", { kind: "admin" });
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const input = createEngagement.parse({
      personId: formData.get("personId"),
      type: formData.get("type"),
      designation: formData.get("designation"),
      department: formData.get("department") || undefined,
      mentorId: formData.get("mentorId") || null,
      startDate: formData.get("startDate"),
      workMode: formData.get("workMode") || undefined,
    });

    if (input.mentorId === input.personId) {
      return { ok: false, message: "A person cannot be their own mentor." };
    }

    const open = await prisma.engagement.findFirst({
      where: { personId: input.personId, status: { in: ["ACTIVE", "UPCOMING"] } },
    });
    if (open) {
      return { ok: false, message: "Close the current engagement before opening a new one." };
    }

    const status = input.startDate <= istDateString() ? "ACTIVE" : "UPCOMING";

    await prisma.$transaction(async (tx) => {
      const created = await tx.engagement.create({
        data: {
          personId: input.personId,
          type: input.type,
          designation: input.designation,
          department: input.department ?? null,
          mentorId: input.mentorId ?? null,
          startDate: istDateToUtcMidnight(input.startDate),
          status,
          workMode: input.workMode ?? null,
        },
      });

      await recordEvent(tx, {
        personId: input.personId,
        eventType: "ENGAGEMENT_CREATED",
        description: `${input.type === "INTERNSHIP" ? "Internship" : "Employment"} as ${
          input.designation
        } began on ${formatIstDate(input.startDate)}.`,
        actorId: actor.id,
        metadata: { engagementId: created.id, type: input.type, startDate: input.startDate },
      });
    });

    revalidatePath(`/admin/people/${input.personId}`);
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}

/** Close an engagement. The row is kept; an end date and final status are set. */
export async function closeEngagementAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    const engagementId = String(formData.get("engagementId") ?? "");
    await authorize(actor, "update", { kind: "engagement", id: engagementId });
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const input = closeEngagement.parse({
      endDate: formData.get("endDate"),
      status: formData.get("status") || "COMPLETED",
    });

    const personId = await prisma.$transaction(async (tx) => {
      const current = await tx.engagement.findUniqueOrThrow({ where: { id: engagementId } });
      if (current.status === "COMPLETED" || current.status === "TERMINATED") {
        throw new AuthzError(403, "already_closed", "That engagement is already closed.");
      }

      const closed = await tx.engagement.update({
        where: { id: engagementId },
        data: { endDate: istDateToUtcMidnight(input.endDate), status: input.status },
      });

      await recordEvent(tx, {
        personId: closed.personId,
        eventType: "ENGAGEMENT_CLOSED",
        description: `${closed.designation} ended on ${formatIstDate(
          input.endDate,
        )} (${input.status.toLowerCase()}).`,
        actorId: actor.id,
        metadata: { engagementId, endDate: input.endDate, status: input.status },
      });

      return closed.personId;
    });

    revalidatePath(`/admin/people/${personId}`);
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}

/** Approve or reject a pending correction. */
export async function decideCorrectionAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    const correctionId = String(formData.get("correctionId") ?? "");
    await authorize(actor, "decide", { kind: "correction", id: correctionId });
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const decision = formData.get("decision") === "APPROVE" ? "APPROVE" : "REJECT";
    await applyDecision({ correctionId, decision, adminId: actor.id });

    revalidatePath("/admin/people");
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}
