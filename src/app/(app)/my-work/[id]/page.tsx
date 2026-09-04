import { notFound, redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatIstDate, utcMidnightToIstDate } from "@/lib/ist";
import { BackLink, Card, StatusPill } from "@/components/ui";
import { CorrectionForm } from "./correction-form";

export default async function WorkLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) redirect("/login");

  // Same check as the API route: the page is not the enforcement point, but it
  // must not render what the route would refuse either.
  try {
    await authorize(actor, "read", { kind: "work_log", id });
  } catch (error) {
    if (error instanceof AuthzError) notFound();
    throw error;
  }

  const log = await prisma.workLog.findUnique({
    where: { id },
    include: { person: { select: { fullName: true, preferredName: true, personId: true } } },
  });
  if (!log) notFound();

  const isOwner = log.personId === actor.id;
  const pendingCorrection = await prisma.correctionRequest.findFirst({
    where: { targetType: "WORK_LOG", targetId: id, status: "PENDING" },
  });

  return (
    <div className="space-y-6">
      <BackLink href="/my-work">← Back to my work</BackLink>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {formatIstDate(utcMidnightToIstDate(log.workDate))}
          </h1>
          {!isOwner ? (
            <p className="mt-1 text-sm text-ink-500">
              {log.person.preferredName ?? log.person.fullName} · {log.person.personId}
            </p>
          ) : null}
        </div>
        <StatusPill status={log.status} />
      </div>

      <Card className="space-y-4">
        <Detail label="Summary" value={log.summary} />
        {log.workCompleted ? <Detail label="What was completed" value={log.workCompleted} /> : null}
        {log.blockers ? <Detail label="Blockers" value={log.blockers} /> : null}
        {log.nextStep ? <Detail label="Next step" value={log.nextStep} /> : null}
        {log.links.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Links</p>
            <ul className="mt-1 space-y-1">
              {log.links.map((link) => (
                <li key={link}>
                  <a
                    href={link}
                    className="text-sm text-forest-700 underline underline-offset-2"
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {log.mentorComment ? (
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Mentor comment</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{log.mentorComment}</p>
        </Card>
      ) : null}

      {isOwner && log.status === "SUBMITTED" ? (
        pendingCorrection ? (
          <Card>
            <p className="text-sm font-medium text-ink-900">A correction is waiting for review.</p>
            <p className="mt-1 text-sm text-ink-500">
              An admin will approve or decline it. The original entry stays as it is until then.
            </p>
          </Card>
        ) : (
          <CorrectionForm targetId={log.id} currentSummary={log.summary} />
        )
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
