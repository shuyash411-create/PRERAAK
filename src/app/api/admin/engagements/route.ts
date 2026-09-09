import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { formatIstDate, istDateString, istDateToUtcMidnight } from "@/lib/ist";
import { createEngagement } from "@/lib/validation/person";

/**
 * Open an engagement.
 *
 * An intern becoming an employee gets a second engagement on the same person,
 * never a second person record. Their PRR- id, their work logs and their
 * history all stay where they are; only the engagement stack grows.
 */
export const POST = guarded({ action: "create", resource: { kind: "admin" } }, async ({ actor, req }) => {
  const input = createEngagement.parse(await readJson(req));

  const person = await prisma.person.findUnique({ where: { id: input.personId } });
  if (!person) throw new RequestError(404, "not_found", "No such person.");

  if (input.mentorId) {
    if (input.mentorId === input.personId) {
      throw new RequestError(400, "self_mentor", "A person cannot be their own mentor.");
    }
    const mentor = await prisma.person.findUnique({ where: { id: input.mentorId } });
    if (!mentor) throw new RequestError(404, "mentor_not_found", "No such mentor.");
  }

  const open = await prisma.engagement.findFirst({
    where: { personId: input.personId, status: { in: ["ACTIVE", "UPCOMING"] } },
  });
  if (open) {
    throw new RequestError(
      409,
      "engagement_already_open",
      "Close the current engagement before opening a new one.",
    );
  }

  // An engagement starting today or earlier is already running.
  const status = input.startDate <= istDateString() ? "ACTIVE" : "UPCOMING";

  const engagement = await prisma.$transaction(async (tx) => {
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
      metadata: {
        engagementId: created.id,
        type: input.type,
        designation: input.designation,
        startDate: input.startDate,
      },
    });

    return created;
  });

  return NextResponse.json({ engagement }, { status: 201 });
});
