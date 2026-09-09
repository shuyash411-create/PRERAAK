"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { allocatePersonId } from "@/lib/person-id";
import { recordEvent } from "@/lib/timeline";
import { formatIstDate, istDateString, istDateToUtcMidnight, utcMidnightToIstDate } from "@/lib/ist";
import { closeEngagement, createEngagement, createPerson } from "@/lib/validation/person";
import { decideOnboarding } from "@/lib/validation/onboarding";
import { createTask } from "@/lib/validation/task";
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
      teamId: formData.get("teamId") || null,
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
          teamId: input.teamId ?? null,
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

/**
 * Confirm or decline somebody's onboarding.
 *
 * Confirming opens the engagement in the same transaction as the decision and
 * the timeline entries, so the record always says what was requested and what
 * was actually accepted.
 */
export async function decideOnboardingAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    const submissionId = String(formData.get("submissionId") ?? "");

    const target = await prisma.onboardingSubmission.findUnique({
      where: { id: submissionId },
      select: { personId: true },
    });
    await authorize(actor, "decide", { kind: "onboarding", personId: target?.personId ?? "" });
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const input = decideOnboarding.parse({
      decision: formData.get("decision"),
      teamId: formData.get("teamId") || null,
      designation: formData.get("designation") || undefined,
      type: formData.get("type") || undefined,
      startDate: formData.get("startDate") || undefined,
      mentorId: formData.get("mentorId") || null,
    });

    await prisma.$transaction(async (tx) => {
      const submission = await tx.onboardingSubmission.findUnique({
        where: { id: submissionId },
        include: { person: { select: { fullName: true } } },
      });
      if (!submission) throw new AuthzError(403, "not_found", "No such onboarding submission.");
      if (submission.status !== "PENDING") {
        throw new AuthzError(
          403,
          "already_decided",
          `That submission was already ${submission.status.toLowerCase()}.`,
        );
      }

      if (input.decision === "REJECT") {
        await tx.onboardingSubmission.update({
          where: { id: submissionId },
          data: { status: "REJECTED", decidedById: actor.id, decidedAt: new Date() },
        });
        await recordEvent(tx, {
          personId: submission.personId,
          eventType: "ONBOARDING_REJECTED",
          description: `Onboarding details from ${submission.person.fullName} were declined.`,
          actorId: actor.id,
          metadata: { submissionId },
        });
        return;
      }

      const open = await tx.engagement.findFirst({
        where: { personId: submission.personId, status: { in: ["ACTIVE", "UPCOMING"] } },
      });
      if (open) {
        throw new AuthzError(
          403,
          "engagement_already_open",
          "That person already has an open engagement.",
        );
      }

      const teamId = input.teamId !== undefined ? input.teamId : submission.requestedTeamId;
      const designation = input.designation ?? submission.requestedDesignation;
      const type = input.type ?? submission.requestedType;
      const startDate = input.startDate ?? utcMidnightToIstDate(submission.proposedStartDate);

      if (input.mentorId && input.mentorId === submission.personId) {
        throw new AuthzError(403, "self_mentor", "A person cannot be their own mentor.");
      }

      const engagement = await tx.engagement.create({
        data: {
          personId: submission.personId,
          type,
          designation,
          teamId: teamId ?? null,
          mentorId: input.mentorId ?? null,
          startDate: istDateToUtcMidnight(startDate),
          status: startDate <= istDateString() ? "ACTIVE" : "UPCOMING",
        },
      });

      await tx.onboardingSubmission.update({
        where: { id: submissionId },
        data: { status: "CONFIRMED", decidedById: actor.id, decidedAt: new Date() },
      });

      await recordEvent(tx, {
        personId: submission.personId,
        eventType: "ONBOARDING_CONFIRMED",
        description: `Onboarding confirmed as ${designation}, starting ${formatIstDate(startDate)}.`,
        actorId: actor.id,
        metadata: {
          submissionId,
          engagementId: engagement.id,
          requested: {
            teamId: submission.requestedTeamId,
            designation: submission.requestedDesignation,
            startDate: utcMidnightToIstDate(submission.proposedStartDate),
          },
          confirmed: { teamId, designation, type, startDate },
        },
      });

      await recordEvent(tx, {
        personId: submission.personId,
        eventType: "ENGAGEMENT_CREATED",
        description: `${type === "INTERNSHIP" ? "Internship" : "Employment"} as ${designation} began on ${formatIstDate(startDate)}.`,
        actorId: actor.id,
        metadata: { engagementId: engagement.id, type, designation, startDate },
      });
    });

    revalidatePath("/admin/onboarding");
    revalidatePath("/admin/people");
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}

/** Create a task and give it to people. Admin only. */
export async function createTaskAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    await authorize(actor, "create", { kind: "admin" });
    if (!actor) throw new AuthzError(401, "unauthenticated");

    const input = createTask.parse({
      title: formData.get("title"),
      description: formData.get("description") || null,
      teamId: formData.get("teamId") || null,
      dueDate: formData.get("dueDate"),
      priority: formData.get("priority") || "NORMAL",
      assigneeIds: formData.getAll("assigneeIds").map(String).filter(Boolean),
    });

    const assignees = await prisma.person.findMany({
      where: { id: { in: input.assigneeIds }, status: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (assignees.length !== input.assigneeIds.length) {
      return { ok: false, message: "One of those people could not be found." };
    }

    await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          teamId: input.teamId ?? null,
          dueDate: istDateToUtcMidnight(input.dueDate),
          priority: input.priority,
          createdById: actor.id,
          assignments: {
            create: assignees.map((a) => ({ personId: a.id, assignedById: actor.id })),
          },
        },
      });

      for (const a of assignees) {
        await recordEvent(tx, {
          personId: a.id,
          eventType: "TASK_ASSIGNED",
          description: `Assigned "${input.title}", due ${formatIstDate(input.dueDate)}.`,
          actorId: actor.id,
          metadata: { taskId: task.id, dueDate: input.dueDate },
        });
      }
    });

    revalidatePath("/admin/tasks");
    revalidatePath("/tasks");
    return { ok: true };
  } catch (error) {
    return friendly(error);
  }
}
