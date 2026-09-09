import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatIstDate, istDateString, utcMidnightToIstDate } from "@/lib/ist";
import { dueState } from "@/lib/task-progress";
import { EmptyState, PageHeader, StatusPill } from "@/components/ui";
import { TaskComposer } from "./task-composer";

/** Every task, with how far each one has got. Desktop-first. */
export default async function AdminTasksPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  try {
    await authorize(actor, "read", { kind: "admin" });
  } catch (error) {
    if (error instanceof AuthzError) redirect("/my-work");
    throw error;
  }

  const [tasks, teams, people] = await Promise.all([
    prisma.task.findMany({
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      include: {
        team: { select: { name: true } },
        assignments: {
          include: { person: { select: { id: true, fullName: true, preferredName: true } } },
        },
      },
      take: 200,
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

  const today = istDateString();

  return (
    <div className="space-y-6">
      <PageHeader title="Tasks" subtitle={`${tasks.length} in total`} />

      <TaskComposer
        teams={teams}
        people={people.map((p) => ({
          id: p.id,
          label: `${p.preferredName ?? p.fullName} (${p.personId})`,
        }))}
        today={today}
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Create one above, give it a deadline, and assign it to whoever is doing the work."
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const dueDate = utcMidnightToIstDate(task.dueDate);
            const submitted = task.assignments.filter((a) => a.status === "SUBMITTED").length;
            const total = task.assignments.length;
            const allIn = total > 0 && submitted === total;
            const due = dueState(dueDate, allIn, today);

            return (
              <div key={task.id} className="rounded-lg border border-cream-300 bg-cream-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{task.title}</p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      Due {formatIstDate(dueDate)}
                      {task.team ? ` · ${task.team.name}` : ""}
                      {task.priority !== "NORMAL" ? ` · ${task.priority.toLowerCase()}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm ${due.overdue ? "font-medium text-clay-600" : "text-ink-500"}`}
                    >
                      {due.label}
                    </span>
                    <StatusPill status={task.status} />
                  </div>
                </div>

                <p className="mt-3 text-sm text-ink-700">
                  {submitted} of {total} handed in
                </p>

                <ul className="mt-2 flex flex-wrap gap-2">
                  {task.assignments.map((a) => (
                    <li
                      key={a.id}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        a.status === "SUBMITTED"
                          ? "border-forest-200 bg-forest-100 text-forest-800"
                          : "border-cream-300 bg-cream-100 text-ink-700"
                      }`}
                    >
                      {a.person.preferredName ?? a.person.fullName}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
