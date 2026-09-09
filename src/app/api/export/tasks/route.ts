import { guarded } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { csvResponse, toCsv, yesNo, type Column } from "@/lib/csv";
import { exportFilename, exportablePersonIds, rangeAsUtc, recordExport, resolveRange } from "@/lib/export";
import { istDateString, istDaysBetween, utcMidnightToIstDate } from "@/lib/ist";

type Row = {
  title: string; team: string; dueDate: string; priority: string; taskStatus: string;
  personId: string; name: string; assignmentStatus: string;
  submittedOn: string; late: string; note: string;
};

const columns: Column<Row>[] = [
  { header: "Task", value: (r) => r.title },
  { header: "Team", value: (r) => r.team },
  { header: "Due date", value: (r) => r.dueDate },
  { header: "Priority", value: (r) => r.priority },
  { header: "Task status", value: (r) => r.taskStatus },
  { header: "PRERAAK ID", value: (r) => r.personId },
  { header: "Assigned to", value: (r) => r.name },
  { header: "Assignment status", value: (r) => r.assignmentStatus },
  { header: "Submitted on", value: (r) => r.submittedOn },
  { header: "Past deadline", value: (r) => r.late },
  { header: "Submission note", value: (r) => r.note },
];

/**
 * One row per person per task.
 *
 * "Past deadline" compares the IST date a task was handed in against the IST
 * date it was due. It is a statement about a deadline, never about the hour
 * somebody chose to work.
 */
export const GET = guarded(
  { action: "export", resource: { kind: "export", dataset: "tasks" } },
  async ({ actor, req }) => {
    // Look a quarter ahead as well as back: an export of task follow-through
    // that hides every upcoming deadline is not much use.
    const range = resolveRange(new URL(req.url).searchParams, { forwardDays: 90 });
    const ids = await exportablePersonIds(actor);
    const today = istDateString();

    const assignments = await prisma.taskAssignment.findMany({
      where: { personId: { in: ids }, task: { dueDate: rangeAsUtc(range) } },
      orderBy: [{ task: { dueDate: "desc" } }, { personId: "asc" }],
      include: {
        task: { include: { team: { select: { name: true } } } },
        person: { select: { personId: true, fullName: true, preferredName: true } },
      },
    });

    const rows: Row[] = assignments.map((a) => {
      const due = utcMidnightToIstDate(a.task.dueDate);
      // The IST calendar date it was handed in on. Derived through the IST
      // helpers like every other date in the app -- a submission at 01:30 IST
      // belongs to that IST day, not the previous UTC one.
      const submittedOn = a.submittedAt ? istDateString(a.submittedAt) : "";
      const late =
        a.status === "SUBMITTED"
          ? submittedOn > due
          : istDaysBetween(today, due) < 0;

      return {
        title: a.task.title,
        team: a.task.team?.name ?? "",
        dueDate: due,
        priority: a.task.priority,
        taskStatus: a.task.status,
        personId: a.person.personId,
        name: a.person.preferredName ?? a.person.fullName,
        assignmentStatus: a.status,
        submittedOn,
        late: yesNo(late),
        note: a.submissionNote ?? "",
      };
    });

    await recordExport({ actor, dataset: "tasks", rowCount: rows.length, range });
    return csvResponse(toCsv(rows, columns), exportFilename("tasks"));
  },
);
