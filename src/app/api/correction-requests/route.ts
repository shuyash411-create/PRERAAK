import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { createCorrection } from "@/lib/validation/correction";

/**
 * Corrections raised by the actor. Admins see the whole queue, since deciding
 * them is an admin job.
 */
export const GET = guarded({ action: "read", resource: { kind: "self" } }, async ({ actor }) => {
  const corrections = await prisma.correctionRequest.findMany({
    where: actor.isAdmin ? {} : { requestedById: actor.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      requestedBy: { select: { id: true, personId: true, fullName: true, preferredName: true } },
    },
    take: 200,
  });

  return NextResponse.json({ correctionRequests: corrections });
});

/**
 * Ask for a submitted record to be corrected.
 *
 * This is the only route through which submitted content changes, and it does
 * not change anything by itself — it records a proposal for an admin to decide.
 */
export const POST = guarded(
  {
    action: "create",
    // The body names the target, so it is resolved and authorized before the
    // handler runs: a person can only request corrections to their own work.
    resource: async ({ req }) => {
      const body = await req.clone().json().catch(() => ({}));
      const parsed = createCorrection.safeParse(body);
      if (!parsed.success) {
        // Let the handler's own parse produce the detailed 400. Authorizing
        // against a target that cannot be identified must still be a denial.
        return { kind: "self" } as const;
      }
      return {
        kind: "correction_new",
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
      } as const;
    },
  },
  async ({ actor, req }) => {
    const input = createCorrection.parse(await readJson(req));

    const correction = await prisma.$transaction(async (tx) => {
      const created = await tx.correctionRequest.create({
        data: {
          targetType: input.targetType,
          targetId: input.targetId,
          requestedById: actor.id,
          reason: input.reason,
          proposedValue: input.proposedValue as never,
        },
      });

      await recordEvent(tx, {
        personId: actor.id,
        eventType: "CORRECTION_REQUESTED",
        description: `Correction requested for ${
          input.targetType === "WORK_LOG" ? "a work log" : "a weekly report"
        }.`,
        actorId: actor.id,
        metadata: {
          correctionId: created.id,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
        },
      });

      return created;
    });

    return NextResponse.json({ correctionRequest: correction }, { status: 201 });
  },
);
