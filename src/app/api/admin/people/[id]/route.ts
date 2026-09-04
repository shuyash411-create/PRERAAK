import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { assertWritable } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { utcMidnightToIstDate } from "@/lib/ist";
import { updatePerson } from "@/lib/validation/person";

type Params = { id: string };

/** One person: their record, their whole engagement stack, and their history. */
export const GET = guarded<Params>(
  { action: "read", resource: { kind: "admin" } },
  async ({ params }) => {
    const person = await prisma.person.findUnique({
      where: { id: params.id },
      include: {
        engagements: {
          orderBy: { startDate: "desc" },
          include: {
            mentor: { select: { id: true, personId: true, fullName: true, preferredName: true } },
          },
        },
        timeline: {
          orderBy: { occurredAt: "desc" },
          take: 100,
          include: { actor: { select: { id: true, fullName: true, preferredName: true } } },
        },
      },
    });

    if (!person) throw new RequestError(404, "not_found", "No such person.");

    return NextResponse.json({
      person: {
        ...person,
        engagements: person.engagements.map((engagement) => ({
          ...engagement,
          startDate: utcMidnightToIstDate(engagement.startDate),
          endDate: engagement.endDate ? utcMidnightToIstDate(engagement.endDate) : null,
        })),
      },
    });
  },
);

/**
 * Update a person's details.
 *
 * `status` is deliberately absent from the writable list: archiving is its own
 * route, so it always records a timeline event and can never happen as a
 * side effect of a profile edit.
 */
export const PATCH = guarded<Params>(
  { action: "update", resource: ({ params }) => ({ kind: "person", id: params.id }) },
  async ({ actor, grant, params, req }) => {
    const body = await readJson(req);
    assertWritable(grant, body);
    const input = updatePerson.parse(body);

    if (input.email) {
      const clash = await prisma.person.findUnique({ where: { email: input.email } });
      if (clash && clash.id !== params.id) {
        throw new RequestError(409, "email_taken", "Another person already uses that email address.");
      }
    }

    const person = await prisma.$transaction(async (tx) => {
      const updated = await tx.person.update({ where: { id: params.id }, data: input });

      await recordEvent(tx, {
        personId: updated.id,
        eventType: "PERSON_UPDATED",
        description: `${updated.fullName}'s details were updated.`,
        actorId: actor.id,
        metadata: { changed: Object.keys(input) },
      });

      return updated;
    });

    return NextResponse.json({ person });
  },
);
