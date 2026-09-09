import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatIstDate, istDateToUtcMidnight, istWeekBounds, utcMidnightToIstDate } from "@/lib/ist";
import { Card, EmptyState, StatusPill } from "@/components/ui";
import { WeeklyForm } from "./weekly-form";

export default async function WeeklyPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const { weekStart, weekEnd } = istWeekBounds();

  const [thisWeek, earlier, engagement] = await Promise.all([
    prisma.weeklyReport.findUnique({
      where: {
        personId_weekStart: { personId: actor.id, weekStart: istDateToUtcMidnight(weekStart) },
      },
    }),
    prisma.weeklyReport.findMany({
      where: { personId: actor.id, weekStart: { lt: istDateToUtcMidnight(weekStart) } },
      orderBy: { weekStart: "desc" },
      take: 12,
    }),
    prisma.engagement.findFirst({
      where: { personId: actor.id, status: { in: ["ACTIVE", "UPCOMING"] } },
      select: { id: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Weekly report</h1>
        <p className="mt-1 text-sm text-ink-500">
          {formatIstDate(weekStart)} to {formatIstDate(weekEnd)}
        </p>
      </div>

      {!engagement ? (
        <EmptyState
          title="No active engagement yet"
          description="Weekly reports open up once an admin has set up your engagement."
        />
      ) : thisWeek?.status === "SUBMITTED" ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-ink-900">This week&rsquo;s report is in. Thank you.</p>
              <p className="mt-1 text-sm text-ink-500">
                Submitted reports cannot be edited. Ask an admin for a correction if something needs
                changing.
              </p>
            </div>
            <StatusPill status="SUBMITTED" />
          </div>
        </Card>
      ) : (
        <WeeklyForm
          defaultValues={{
            workCompleted: thisWeek?.workCompleted ?? "",
            deliverables: thisWeek?.deliverables ?? "",
            challenges: thisWeek?.challenges ?? "",
            learning: thisWeek?.learning ?? "",
            nextWeekPlan: thisWeek?.nextWeekPlan ?? "",
          }}
        />
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Earlier weeks</h2>
        {earlier.length === 0 ? (
          <EmptyState
            title="No earlier reports"
            description="Weekly reports you submit will be listed here."
          />
        ) : (
          <ul className="divide-y divide-cream-300 rounded-lg border border-cream-300 bg-cream-50">
            {earlier.map((report) => (
              <li key={report.id}>
                <Link
                  href={`/weekly/${report.id}`}
                  className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-cream-100"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      Week of {formatIstDate(utcMidnightToIstDate(report.weekStart))}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-ink-500">{report.workCompleted}</p>
                  </div>
                  <StatusPill status={report.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
