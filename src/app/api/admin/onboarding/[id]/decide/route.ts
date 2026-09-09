import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { formatIstDate, istDateString, istDateToUtcMidnight, utcMidnightToIstDate } from "@/lib/ist";
import { decideOnboarding } from "@/lib/validation/onboarding";

type Params = { id: string };

/**
 * Confirm or reject an onboarding submission.
 *
 * Confirming is what actually opens the engagement, in one transaction with
 * the decision and the timeline entry: the person typed it, the admin decided
 * it, and the record says which values were accepted. An admin may correct
 * team, designation, type or start date at this point — that is the whole
 * purpose of the step.
 */
export const POST = guarded<Params>(
  {
    action: "decide",
    resource: async ({ params }) => {
      const submission = await prisma.onboardingSubmission.findUnique({
        where: { id: params.id },
        select: { personId: true },
      });
      return { kind: "onboarding", personId: submission?.personId ?? "" };
    },
  },
  async ({ actor, params, req }) => {
    const input = decideOnboarding.parse(await readJson(req));

    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.onboardingSubmission.findUnique({
        where: { id: params.id },
        include: { person: { select: { fullName: true } } },
      });
      if (!submission) throw new RequestError(404, "not_found", "No such onboarding submission.");

      if (submission.status !== "PENDING") {
        throw new RequestError(
          409,
          "already_decided",
          `That submission was already ${submission.status.toLowerCase()}.`,
        );
      }

      if (input.decision === "REJECT") {
        const rejected = await tx.onboardingSubmission.update({
          where: { id: params.id },
          data: { status: "REJECTED", decidedById: actor.id, decidedAt: new Date() },
        });

        await recordEvent(tx, {
          personId: submission.personId,
          eventType: "ONBOARDING_REJECTED",
          description: `Onboarding details from ${submission.person.fullName} were declined.`,
          actorId: actor.id,
          metadata: { submissionId: params.id, note: input.note },
        });

        return { status: rejected.status, engagementId: null as string | null };
      }

      // One open engagement at a time — same rule as creating one directly.
      const open = await tx.engagement.findFirst({
        where: { personId: submission.personId, status: { in: ["ACTIVE", "UPCOMING"] } },
      });
      if (open) {
        throw new RequestError(
          409,
          "engagement_already_open",
          "That person already has an open engagement. Close it before confirming.",
        );
      }

      const teamId = input.teamId !== undefined ? input.teamId : submission.requestedTeamId;
      const designation = input.designation ?? submission.requestedDesignation;
      const type = input.type ?? submission.requestedType;
      const startDate = input.startDate ?? utcMidnightToIstDate(submission.proposedStartDate);

      if (input.mentorId && input.mentorId === submission.personId) {
        throw new RequestError(400, "self_mentor", "A person cannot be their own mentor.");
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
        where: { id: params.id },
        data: { status: "CONFIRMED", decidedById: actor.id, decidedAt: new Date() },
      });

      await recordEvent(tx, {
        personId: submission.personId,
        eventType: "ONBOARDING_CONFIRMED",
        description: `Onboarding confirmed as ${designation}, starting ${formatIstDate(startDate)}.`,
        actorId: actor.id,
        metadata: {
          submissionId: params.id,
          engagementId: engagement.id,
          requested: {
            teamId: submission.requestedTeamId,
            designation: submission.requestedDesignation,
            type: submission.requestedType,
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

      return { status: "CONFIRMED" as const, engagementId: engagement.id };
    });

    return NextResponse.json(result);
  },
);
