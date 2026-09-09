import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatIstDate, utcMidnightToIstDate } from "@/lib/ist";
import { Card, EmptyState, PageHeader, StatusPill } from "@/components/ui";

/**
 * A mentor's own people.
 *
 * Always in the nav, even for someone who mentors nobody — the empty state
 * says so, rather than the link disappearing, matching how Tasks behaves for
 * a person with none. Admins mentor nobody by definition in the seed data,
 * but an admin who is also somebody's mentor sees exactly the same page
 * anyone else would; this is not an admin-only screen.
 */
export default async function MyPeoplePage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const mentees = await prisma.person.findMany({
    where: { engagements: { some: { mentorId: actor.id } } },
    orderBy: { fullName: "asc" },
    include: {
      engagements: {
        where: { mentorId: actor.id },
        orderBy: { startDate: "desc" },
        take: 1,
        select: { designation: true, team: { select: { name: true } } },
      },
      workLogs: {
        where: { status: "SUBMITTED" },
        orderBy: { workDate: "desc" },
        take: 1,
        select: { id: true, workDate: true },
      },
      _count: {
        select: {
          workLogs: { where: { status: "SUBMITTED", reviewedAt: null } },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="My people"
        subtitle={
          mentees.length === 0
            ? undefined
            : `${mentees.length} ${mentees.length === 1 ? "person" : "people"}`
        }
      />

      {mentees.length === 0 ? (
        <EmptyState
          title="Nobody assigned to you yet"
          description="When an admin sets you as somebody's mentor, they'll show up here with their latest submission and anything waiting for your comment."
        />
      ) : (
        <ul className="space-y-3">
          {mentees.map((person) => {
            const engagement = person.engagements[0];
            const lastLog = person.workLogs[0];
            const unreviewed = person._count.workLogs;

            return (
              <li key={person.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">
                      {person.preferredName ?? person.fullName}
                      <span className="ml-2 font-normal text-ink-400">{person.personId}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {engagement?.designation ?? "No engagement"}
                      {engagement?.team ? ` · ${engagement.team.name}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-ink-500">
                      {lastLog
                        ? `Last submitted ${formatIstDate(utcMidnightToIstDate(lastLog.workDate))}`
                        : "Nothing submitted yet"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {unreviewed > 0 ? (
                      <StatusPill status="PENDING" />
                    ) : null}
                    <span className="text-sm text-ink-500">
                      {unreviewed > 0
                        ? `${unreviewed} to review`
                        : "All caught up"}
                    </span>
                    {lastLog ? (
                      <Link
                        href={`/my-work/${lastLog.id}`}
                        className="text-sm text-forest-700 underline underline-offset-2"
                      >
                        Open latest log
                      </Link>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
