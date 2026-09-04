import { NextResponse } from "next/server";
import { guarded, RequestError } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";

type Params = { id: string };

/**
 * Archive a person.
 *
 * There is no delete route, here or anywhere. A person's record and every work
 * log, report and event attached to it are kept; archiving only ends their
 * access. This is a POST rather than a DELETE precisely so that no part of
 * this API suggests removal is possible.
 */
export const POST = guarded<Params>(
  { action: "update", resource: ({ params }) => ({ kind: "person", id: params.id }) },
  async ({ actor, params }) => {
    if (params.id === actor.id) {
      throw new RequestError(
        409,
        "cannot_archive_self",
        "You cannot archive your own account.",
      );
    }

    const person = await prisma.$transaction(async (tx) => {
      const current = await tx.person.findUnique({ where: { id: params.id } });
      if (!current) throw new RequestError(404, "not_found", "No such person.");
      if (current.status === "ARCHIVED") {
        throw new RequestError(409, "already_archived", "That person is already archived.");
      }

      const archived = await tx.person.update({
        where: { id: params.id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });

      await recordEvent(tx, {
        personId: archived.id,
        eventType: "PERSON_ARCHIVED",
        description: `${archived.fullName} was archived. All records are retained.`,
        actorId: actor.id,
        metadata: { personId: archived.personId },
      });

      return archived;
    });

    return NextResponse.json({ person });
  },
);
