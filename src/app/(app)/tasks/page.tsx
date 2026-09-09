import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatIstDate, utcMidnightToIstDate } from "@/lib/ist";
import { dueState } from "@/lib/task-progress";
import { EmptyState, StatusPill } from "@/components/ui";

/** The tasks given to the signed-in person, soonest deadline first. */
export default async function TasksPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const assignments = await prisma.taskAssignment.findMany({
    where: { personId: actor.id },
    include: {
      task: { include: { team: { select: { name: true } } } },
    },
    orderBy: [{ status: "asc" }, { task: { dueDate: "asc" } }],
  });

  const open = assignments.filter((a) => a.status !== "SUBMITTED");
  const done = assignments.filter((a) => a.status === "SUBMITTED");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">My tasks</h1>
        <p className="mt-1 text-sm text-ink-500">
          {open.length === 0
            ? "Nothing outstanding."
            : `${open.length} still to hand in.`}
        </p>
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="When someone assigns you a piece of work with a deadline, it appears here. Your daily work log is separate, under My work."
        />
      ) : (
        <>
          <section className="space-y-3">
            {open.map((a) => {
              const due = dueState(utcMidnightToIstDate(a.task.dueDate), false);
              return (
                <Link
                  key={a.id}
                  href={`/tasks/${a.task.id}`}
                  className="block rounded-lg border border-cream-300 bg-cream-50 p-4 hover:bg-cream-100"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">{a.task.title}</p>
                      <p className="mt-0.5 text-sm text-ink-500">
                        {formatIstDate(utcMidnightToIstDate(a.task.dueDate))}
                        {a.task.team ? ` · ${a.task.team.name}` : ""}
                      </p>
                    </div>
                    <span
                      className={`text-sm ${due.overdue ? "font-medium text-clay-600" : "text-ink-500"}`}
                    >
                      {due.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </section>

          {done.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-ink-900">Handed in</h2>
              <ul className="divide-y divide-cream-300 rounded-lg border border-cream-300 bg-cream-50">
                {done.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/tasks/${a.task.id}`}
                      className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-cream-100"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-900">{a.task.title}</p>
                        <p className="mt-0.5 text-sm text-ink-500">
                          {formatIstDate(utcMidnightToIstDate(a.task.dueDate))}
                        </p>
                      </div>
                      <StatusPill status="SUBMITTED" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
