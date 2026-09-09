import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { istDateString, utcMidnightToIstDate } from "@/lib/ist";
import { Card } from "@/components/ui";
import { OnboardingForm } from "./onboarding-form";

/**
 * First run for an invited person.
 *
 * They were created by an admin — that is why they could sign in at all — but
 * nobody has typed their details yet. They do that here. Team, designation and
 * start date are requested rather than set: an admin confirms them, and that
 * confirmation is what opens the engagement and unlocks work logging.
 */
export default async function OnboardingPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const [person, submission, teams, engagementCount] = await Promise.all([
    prisma.person.findUniqueOrThrow({
      where: { id: actor.id },
      select: {
        fullName: true, preferredName: true, phone: true,
        college: true, course: true, graduationYear: true,
      },
    }),
    prisma.onboardingSubmission.findUnique({ where: { personId: actor.id } }),
    prisma.team.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.engagement.count({ where: { personId: actor.id } }),
  ]);

  // Already set up — nothing to do here.
  if (engagementCount > 0) redirect("/my-work");

  if (submission?.status === "PENDING") {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-2xl font-semibold text-ink-900">Thanks, {person.preferredName ?? person.fullName.split(" ")[0]}</h1>
        <Card>
          <p className="font-medium text-ink-900">Your details are with an admin.</p>
          <p className="mt-2 text-sm text-ink-500">
            Once they confirm your team and designation, your engagement opens and you can start
            logging work. You will not need to do anything else.
          </p>
          <dl className="mt-4 space-y-2 border-t border-cream-300 pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Designation requested</dt>
              <dd className="text-ink-900">{submission.requestedDesignation}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Starting</dt>
              <dd className="text-ink-900">{utcMidnightToIstDate(submission.proposedStartDate)}</dd>
            </div>
          </dl>
        </Card>
        <p className="text-sm text-ink-500">
          Something wrong? Ask an admin to decline it and you can fill it in again.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">
          Welcome, {person.fullName.split(" ")[0]}
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Tell us a little about yourself. An admin confirms your team and designation, and then you
          are set up.
        </p>
      </div>

      <OnboardingForm
        teams={teams}
        today={istDateString()}
        defaultValues={{
          preferredName: person.preferredName ?? "",
          phone: person.phone ?? "",
          college: person.college ?? "",
          course: person.course ?? "",
          graduationYear: person.graduationYear ? String(person.graduationYear) : "",
          requestedTeamId: submission?.requestedTeamId ?? "",
          requestedDesignation: submission?.requestedDesignation ?? "",
          requestedType: submission?.requestedType ?? "INTERNSHIP",
          proposedStartDate: submission
            ? utcMidnightToIstDate(submission.proposedStartDate)
            : istDateString(),
        }}
      />
    </div>
  );
}
