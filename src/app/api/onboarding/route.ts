import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/guarded";
import { assertWritable } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { istDateToUtcMidnight, utcMidnightToIstDate } from "@/lib/ist";
import { submitOnboarding } from "@/lib/validation/onboarding";

/** The actor's own onboarding submission, plus the teams they can pick from. */
export const GET = guarded(
  { action: "read", resource: ({ actor }) => ({ kind: "onboarding", personId: actor.id }) },
  async ({ actor }) => {
    const [submission, teams, person, engagementCount] = await Promise.all([
      prisma.onboardingSubmission.findUnique({
        where: { personId: actor.id },
        include: { requestedTeam: { select: { id: true, name: true } } },
      }),
      prisma.team.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.person.findUniqueOrThrow({
        where: { id: actor.id },
        select: {
          fullName: true, preferredName: true, phone: true,
          college: true, course: true, graduationYear: true,
        },
      }),
      prisma.engagement.count({ where: { personId: actor.id } }),
    ]);

    return NextResponse.json({
      person,
      teams,
      hasEngagement: engagementCount > 0,
      submission: submission
        ? {
            ...submission,
            proposedStartDate: utcMidnightToIstDate(submission.proposedStartDate),
          }
        : null,
    });
  },
);

/**
 * Create or replace the actor's own onboarding submission.
 *
 * Personal details are written to the person straight away — they are the
 * person's own to maintain. Team, designation and start date are only
 * *requested*: they become an engagement when an admin confirms.
 */
export const POST = guarded(
  { action: "create", resource: ({ actor }) => ({ kind: "onboarding", personId: actor.id }) },
  async ({ actor, grant, req }) => {
    const body = await readJson(req);
    assertWritable(grant, body);
    const input = submitOnboarding.parse(body);

    const submission = await prisma.$transaction(async (tx) => {
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

      return tx.onboardingSubmission.upsert({
        where: { personId: actor.id },
        create: { personId: actor.id, ...data },
        update: data,
      });
    });

    return NextResponse.json({
      submission: {
        ...submission,
        proposedStartDate: utcMidnightToIstDate(submission.proposedStartDate),
      },
    });
  },
);
