import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatIstDate, istDateString, istDateToUtcMidnight, utcMidnightToIstDate } from "@/lib/ist";
import { Card, EmptyState, StatusPill } from "@/components/ui";
import { TodayForm } from "./today-form";

/**
 * The screen that decides whether this system gets used.
 *
 * Today's date is resolved on the server, today's draft is loaded ready to
 * edit, and only the summary is required. Everything else on this page is
 * subordinate to getting a person from "opened the app" to "submitted" in
 * under a minute on a phone.
 */
export default async function MyWorkPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const today = istDateString();

  const [todayLog, recent, engagement] = await Promise.all([
    prisma.workLog.findUnique({
      where: {
        personId_workDate: { personId: actor.id, workDate: istDateToUtcMidnight(today) },
      },
    }),
    prisma.workLog.findMany({
      where: { personId: actor.id, workDate: { lt: istDateToUtcMidnight(today) } },
      orderBy: { workDate: "desc" },
      take: 20,
    }),
    prisma.engagement.findFirst({
      where: { personId: actor.id, status: { in: ["ACTIVE", "UPCOMING"] } },
      orderBy: { startDate: "desc" },
      select: { id: true, designation: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Today&rsquo;s work</h1>
        <p className="mt-1 text-sm text-ink-500">{formatIstDate(today)}</p>
      </div>

      {!engagement ? (
        <EmptyState
          title="No active engagement yet"
          description="You need an open internship or employment engagement before you can log work. Ask an admin to set one up."
        />
      ) : todayLog?.status === "SUBMITTED" ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-ink-900">Submitted for today. Thank you.</p>
              <p className="mt-1 text-sm text-ink-500">
                Submitted work cannot be edited. If something needs changing, open it and ask for a
                correction.
              </p>
            </div>
            <StatusPill status="SUBMITTED" />
          </div>
          <p className="mt-4 text-sm">
            <Link
              href={`/my-work/${todayLog.id}`}
              className="text-forest-700 underline underline-offset-2"
            >
              View today&rsquo;s entry
            </Link>
          </p>
        </Card>
      ) : (
        <TodayForm
          defaultValues={{
            summary: todayLog?.summary ?? "",
            workCompleted: todayLog?.workCompleted ?? "",
            blockers: todayLog?.blockers ?? "",
            nextStep: todayLog?.nextStep ?? "",
          }}
          hasDraft={Boolean(todayLog)}
        />
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Earlier entries</h2>

        {recent.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="Your past work logs will appear here once you have submitted a few. Today's is above."
          />
        ) : (
          <ul className="divide-y divide-cream-300 rounded-lg border border-cream-300 bg-cream-50">
            {recent.map((log) => (
              <li key={log.id}>
                <Link
                  href={`/my-work/${log.id}`}
                  className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-cream-100"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      {formatIstDate(utcMidnightToIstDate(log.workDate))}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-ink-500">{log.summary}</p>
                  </div>
                  <StatusPill status={log.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
