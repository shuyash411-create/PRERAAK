import { NextResponse } from "next/server";
import { guarded } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { istDateString, utcMidnightToIstDate } from "@/lib/ist";

/**
 * The signed-in person, their engagement stack, and today's IST date.
 *
 * The client never computes today's date itself: a phone with a wrong clock or
 * a foreign timezone would otherwise file work against the wrong day.
 */
export const GET = guarded({ action: "read", resource: { kind: "self" } }, async ({ actor }) => {
  const person = await prisma.person.findUnique({
    where: { id: actor.id },
    select: {
      id: true,
      personId: true,
      fullName: true,
      preferredName: true,
      email: true,
      status: true,
      isAdmin: true,
      engagements: {
        orderBy: { startDate: "desc" },
        select: {
          id: true,
          type: true,
          designation: true,
          team: { select: { id: true, name: true, slug: true } },
          status: true,
          workMode: true,
          startDate: true,
          endDate: true,
          mentor: { select: { id: true, personId: true, fullName: true, preferredName: true } },
        },
      },
    },
  });

  if (!person) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const onboarding = await prisma.onboardingSubmission.findUnique({
    where: { personId: actor.id },
    select: { status: true },
  });

  const engagements = person.engagements.map((engagement) => ({
    ...engagement,
    startDate: utcMidnightToIstDate(engagement.startDate),
    endDate: engagement.endDate ? utcMidnightToIstDate(engagement.endDate) : null,
  }));

  // The engagement work is filed against: the active one, else the most recent.
  const currentEngagement = engagements.find((e) => e.status === "ACTIVE") ?? engagements[0] ?? null;

  return NextResponse.json({
    person: {
      id: person.id,
      personId: person.personId,
      fullName: person.fullName,
      preferredName: person.preferredName,
      email: person.email,
      status: person.status,
      isAdmin: person.isAdmin,
    },
    engagements,
    currentEngagement,
    // Somebody invited but not yet set up: no engagement, and nothing pending
    // with an admin. Admins are never sent to onboarding — they are the people
    // who clear the queue.
    needsOnboarding:
      !person.isAdmin && person.engagements.length === 0 && onboarding?.status !== "PENDING",
    onboardingStatus: onboarding?.status ?? null,
    today: istDateString(),
  });
});
