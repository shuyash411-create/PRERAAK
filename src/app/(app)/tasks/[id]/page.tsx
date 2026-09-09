import { notFound, redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatIstDate, utcMidnightToIstDate } from "@/lib/ist";
import { dueState } from "@/lib/task-progress";
import { BackLink, Card, StatusPill } from "@/components/ui";
import { SubmissionForm } from "./submission-form";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) redirect("/login");

  try {
    await authorize(actor, "read", { kind: "task", id });
  } catch (error) {
    if (error instanceof AuthzError) notFound();
    throw error;
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      team: { select: { name: true } },
      createdBy: { select: { fullName: true, preferredName: true } },
      assignments: {
        include: {
          person: { select: { id: true, fullName: true, preferredName: true, personId: true } },
        },
      },
    },
  });
  if (!task) notFound();

  const dueDate = utcMidnightToIstDate(task.dueDate);
  const mine = task.assignments.find((a) => a.personId === actor.id) ?? null;
  const due = dueState(dueDate, mine?.status === "SUBMITTED");

  return (
    <div className="space-y-6">
      <BackLink href="/tasks">← Back to tasks</BackLink>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">{task.title}</h1>
          <p className="mt-1 text-sm text-ink-500">
            Due {formatIstDate(dueDate)}
            {task.team ? ` · ${task.team.name}` : ""}
            {task.priority !== "NORMAL" ? ` · ${task.priority.toLowerCase()} priority` : ""}
          </p>
        </div>
        <span className={`text-sm ${due.overdue ? "font-medium text-clay-600" : "text-ink-500"}`}>
          {due.label}
        </span>
      </div>

      {task.description ? (
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">What is needed</p>
          <p className="mt-1 whitespace-pre-wrap text-ink-900">{task.description}</p>
        </Card>
      ) : null}

      {mine ? (
        mine.status === "SUBMITTED" ? (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink-900">You handed this in.</p>
                <p className="mt-1 text-sm text-ink-500">
                  Submitted work cannot be edited. Ask an admin for a correction if something needs
                  changing — the original is kept either way.
                </p>
              </div>
              <StatusPill status="SUBMITTED" />
            </div>
            <div className="mt-4 border-t border-cream-300 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Your note</p>
              <p className="mt-1 whitespace-pre-wrap text-ink-900">{mine.submissionNote}</p>
            </div>
          </Card>
        ) : (
          <SubmissionForm
            assignmentId={mine.id}
            defaultNote={mine.submissionNote ?? ""}
          />
        )
      ) : null}

      {task.assignments.length > 1 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-ink-700">Also on this task</h2>
          <ul className="flex flex-wrap gap-2">
            {task.assignments
              .filter((a) => a.personId !== actor.id)
              .map((a) => (
                <li key={a.id} className="rounded-full border border-cream-300 bg-cream-50 px-3 py-1 text-sm text-ink-700">
                  {a.person.preferredName ?? a.person.fullName}
                  {a.status === "SUBMITTED" ? " · submitted" : ""}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
