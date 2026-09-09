import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { utcMidnightToIstDate } from "@/lib/ist";
import { EmptyState, PageHeader } from "@/components/ui";
import { OnboardingQueue } from "./onboarding-queue";

/** People who have filled in their details and are waiting to be set up. */
export default async function AdminOnboardingPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  try {
    await authorize(actor, "read", { kind: "admin" });
  } catch (error) {
    if (error instanceof AuthzError) redirect("/my-work");
    throw error;
  }

  const [submissions, teams, mentors] = await Promise.all([
    prisma.onboardingSubmission.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        person: {
          select: {
            id: true, personId: true, fullName: true, preferredName: true, email: true,
            phone: true, college: true, course: true, graduationYear: true,
          },
        },
        requestedTeam: { select: { id: true, name: true } },
      },
    }),
    prisma.team.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.person.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, preferredName: true, personId: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding"
        subtitle="Confirming a submission is what opens the engagement and lets the person start logging work."
      />

      {submissions.length === 0 ? (
        <EmptyState
          title="Nobody waiting"
          description="When someone you have invited fills in their details, they appear here for you to confirm."
        />
      ) : (
        <OnboardingQueue
          teams={teams}
          mentors={mentors.map((m) => ({
            id: m.id,
            label: `${m.preferredName ?? m.fullName} (${m.personId})`,
          }))}
          submissions={submissions.map((s) => ({
            id: s.id,
            personName: s.person.preferredName ?? s.person.fullName,
            personId: s.person.personId,
            email: s.person.email,
            college: s.person.college,
            course: s.person.course,
            graduationYear: s.person.graduationYear,
            requestedTeamId: s.requestedTeamId,
            requestedTeamName: s.requestedTeam?.name ?? null,
            requestedDesignation: s.requestedDesignation,
            requestedType: s.requestedType,
            proposedStartDate: utcMidnightToIstDate(s.proposedStartDate),
          }))}
        />
      )}
    </div>
  );
}
