import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/authz";

/**
 * Does this person still need to complete onboarding?
 *
 * True when they have no engagement at all and nothing waiting with an admin.
 * Admins are always false: they clear the queue, and sending an admin to the
 * onboarding form would lock everybody out behind a form nobody can approve.
 */
export async function needsOnboarding(actor: Actor): Promise<boolean> {
  if (actor.isAdmin) return false;

  const [engagements, submission] = await Promise.all([
    prisma.engagement.count({ where: { personId: actor.id } }),
    prisma.onboardingSubmission.findUnique({
      where: { personId: actor.id },
      select: { status: true },
    }),
  ]);

  if (engagements > 0) return false;
  return submission?.status !== "PENDING";
}
