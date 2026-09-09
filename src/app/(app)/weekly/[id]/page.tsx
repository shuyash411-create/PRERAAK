import { notFound, redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatIstDate, utcMidnightToIstDate } from "@/lib/ist";
import { BackLink, Card, StatusPill } from "@/components/ui";
import { ReviewForm } from "@/components/review-form";

/**
 * One weekly report, read-only.
 *
 * Mirrors `/my-work/[id]`. There is no correction-request flow for weekly
 * reports yet — that gap predates this page and is unrelated to mentor
 * review, so it's left as it was rather than built speculatively here.
 */
export default async function WeeklyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) redirect("/login");

  let scope: "SELF" | "MENTOR" | "ADMIN";
  try {
    ({ scope } = await authorize(actor, "read", { kind: "weekly_report", id }));
  } catch (error) {
    if (error instanceof AuthzError) notFound();
    throw error;
  }

  const report = await prisma.weeklyReport.findUnique({
    where: { id },
    include: { person: { select: { fullName: true, preferredName: true, personId: true } } },
  });
  if (!report) notFound();

  const isOwner = scope === "SELF";

  return (
    <div className="space-y-6">
      <BackLink href="/weekly">← Back to weekly reports</BackLink>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            Week of {formatIstDate(utcMidnightToIstDate(report.weekStart))}
          </h1>
          {!isOwner ? (
            <p className="mt-1 text-sm text-ink-500">
              {report.person.preferredName ?? report.person.fullName} · {report.person.personId}
            </p>
          ) : null}
        </div>
        <StatusPill status={report.status} />
      </div>

      <Card className="space-y-4">
        <Detail label="What was completed" value={report.workCompleted} />
        {report.deliverables ? <Detail label="Deliverables" value={report.deliverables} /> : null}
        {report.challenges ? <Detail label="Challenges" value={report.challenges} /> : null}
        {report.learning ? <Detail label="What was learned" value={report.learning} /> : null}
        {report.nextWeekPlan ? <Detail label="Plan for next week" value={report.nextWeekPlan} /> : null}
      </Card>

      {!isOwner && report.status === "SUBMITTED" ? (
        <ReviewForm
          targetType="WEEKLY_REPORT"
          targetId={report.id}
          revalidateTarget={`/weekly/${report.id}`}
          existingComment={report.mentorComment}
        />
      ) : report.mentorComment ? (
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Mentor comment</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{report.mentorComment}</p>
        </Card>
      ) : null}

      {isOwner && report.status === "SUBMITTED" ? (
        <p className="text-sm text-ink-500">
          Submitted reports cannot be edited. If something needs changing, ask an admin.
        </p>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-ink-900">{value}</p>
    </div>
  );
}
