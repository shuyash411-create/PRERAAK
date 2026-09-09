import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatIstDate, utcMidnightToIstDate } from "@/lib/ist";
import { lastActivityState } from "@/lib/last-activity";
import { EmptyState, PageHeader } from "@/components/ui";

/**
 * Everyone active, and what they last logged.
 *
 * Read-only, admin-only, one screen — the fastest of the three things built
 * this round because there is nothing to write. "What is this person working
 * on right now" is answered entirely by their own most recent work log; there
 * is no separate "current task" field to fall out of sync with it.
 */
export default async function CapacityPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  try {
    await authorize(actor, "read", { kind: "admin" });
  } catch (error) {
    if (error instanceof AuthzError) redirect("/my-work");
    throw error;
  }

  const people = await prisma.person.findMany({
    where: { status: "ACTIVE" },
    orderBy: { fullName: "asc" },
    include: {
      engagements: {
        where: { status: "ACTIVE" },
        take: 1,
        select: {
          designation: true,
          team: { select: { name: true } },
          mentor: { select: { fullName: true, preferredName: true } },
        },
      },
      workLogs: {
        orderBy: { workDate: "desc" },
        take: 1,
        select: { workDate: true, summary: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Capacity"
        subtitle={`${people.length} active ${people.length === 1 ? "person" : "people"}`}
      />

      {people.length === 0 ? (
        <EmptyState
          title="Nobody active"
          description="Active people and their most recent work log will appear here."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-cream-300">
          <table className="w-full min-w-[48rem] border-collapse bg-cream-50 text-left text-sm">
            <thead className="border-b border-cream-300 text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Team</th>
                <th scope="col" className="px-4 py-3 font-medium">Designation</th>
                <th scope="col" className="px-4 py-3 font-medium">Mentor</th>
                <th scope="col" className="px-4 py-3 font-medium">Last log</th>
                <th scope="col" className="px-4 py-3 font-medium">Working on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-300">
              {people.map((person) => {
                const engagement = person.engagements[0];
                const lastLog = person.workLogs[0];
                const activity = lastActivityState(
                  lastLog ? utcMidnightToIstDate(lastLog.workDate) : null,
                );

                return (
                  <tr key={person.id} className="hover:bg-cream-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900">
                        {person.preferredName ?? person.fullName}
                      </p>
                      <p className="text-xs text-ink-400">{person.personId}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {engagement?.team?.name ?? <span className="text-ink-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {engagement?.designation ?? <span className="text-ink-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {engagement?.mentor
                        ? engagement.mentor.preferredName ?? engagement.mentor.fullName
                        : <span className="text-ink-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={activity.stale ? "font-medium text-clay-600" : "text-ink-700"}>
                        {activity.label}
                      </span>
                      {lastLog ? (
                        <p className="text-xs text-ink-400">
                          {formatIstDate(utcMidnightToIstDate(lastLog.workDate))}
                        </p>
                      ) : null}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-ink-700">
                      {lastLog?.summary ?? <span className="text-ink-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
