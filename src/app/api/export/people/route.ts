import { guarded } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { csvResponse, toCsv, yesNo, type Column } from "@/lib/csv";
import { exportFilename, exportablePersonIds, rangeAsUtc, recordExport, resolveRange } from "@/lib/export";
import { istDateString, istDaysBetween, utcMidnightToIstDate } from "@/lib/ist";

type Row = {
  personId: string; fullName: string; preferredName: string | null; email: string;
  phone: string | null; college: string | null; course: string | null;
  graduationYear: number | null; status: string; isAdmin: boolean;
  team: string; designation: string; engagementType: string; engagementStatus: string;
  mentor: string; startDate: string; endDate: string;
  workLogs: number; weeklyReports: number; lastSubmission: string;
  tasksAssigned: number; tasksSubmitted: number; tasksOverdue: number;
};

const columns: Column<Row>[] = [
  { header: "PRERAAK ID", value: (r) => r.personId },
  { header: "Full name", value: (r) => r.fullName },
  { header: "Preferred name", value: (r) => r.preferredName },
  { header: "Email", value: (r) => r.email },
  { header: "Phone", value: (r) => r.phone },
  { header: "College", value: (r) => r.college },
  { header: "Course", value: (r) => r.course },
  { header: "Graduation year", value: (r) => r.graduationYear },
  { header: "Status", value: (r) => r.status },
  { header: "Admin", value: (r) => yesNo(r.isAdmin) },
  { header: "Team", value: (r) => r.team },
  { header: "Designation", value: (r) => r.designation },
  { header: "Engagement type", value: (r) => r.engagementType },
  { header: "Engagement status", value: (r) => r.engagementStatus },
  { header: "Mentor", value: (r) => r.mentor },
  { header: "Start date", value: (r) => r.startDate },
  { header: "End date", value: (r) => r.endDate },
  { header: "Work logs submitted", value: (r) => r.workLogs },
  { header: "Weekly reports submitted", value: (r) => r.weeklyReports },
  { header: "Last submission", value: (r) => r.lastSubmission },
  { header: "Tasks assigned", value: (r) => r.tasksAssigned },
  { header: "Tasks submitted", value: (r) => r.tasksSubmitted },
  { header: "Tasks overdue", value: (r) => r.tasksOverdue },
];

/** One row per person, with their progress over the range. */
export const GET = guarded(
  { action: "export", resource: { kind: "export", dataset: "people" } },
  async ({ actor, req }) => {
    const range = resolveRange(new URL(req.url).searchParams);
    const window = rangeAsUtc(range);
    const ids = await exportablePersonIds(actor);
    const today = istDateString();

    const people = await prisma.person.findMany({
      where: { id: { in: ids } },
      orderBy: { personId: "asc" },
      include: {
        engagements: {
          orderBy: { startDate: "desc" },
          take: 1,
          include: {
            team: { select: { name: true } },
            mentor: { select: { fullName: true, preferredName: true } },
          },
        },
        workLogs: {
          where: { status: "SUBMITTED", workDate: window },
          select: { workDate: true },
          orderBy: { workDate: "desc" },
        },
        weeklyReports: {
          where: { status: "SUBMITTED", weekStart: window },
          select: { id: true },
        },
        taskAssignments: {
          include: { task: { select: { dueDate: true } } },
        },
      },
    });

    const rows: Row[] = people.map((person) => {
      const engagement = person.engagements[0];
      const submittedTasks = person.taskAssignments.filter((a) => a.status === "SUBMITTED");
      const overdue = person.taskAssignments.filter(
        (a) =>
          a.status !== "SUBMITTED" &&
          istDaysBetween(today, utcMidnightToIstDate(a.task.dueDate)) < 0,
      );

      return {
        personId: person.personId,
        fullName: person.fullName,
        preferredName: person.preferredName,
        email: person.email,
        phone: person.phone,
        college: person.college,
        course: person.course,
        graduationYear: person.graduationYear,
        status: person.status,
        isAdmin: person.isAdmin,
        team: engagement?.team?.name ?? "",
        designation: engagement?.designation ?? "",
        engagementType: engagement?.type ?? "",
        engagementStatus: engagement?.status ?? "",
        mentor: engagement?.mentor
          ? engagement.mentor.preferredName ?? engagement.mentor.fullName
          : "",
        startDate: engagement ? utcMidnightToIstDate(engagement.startDate) : "",
        endDate: engagement?.endDate ? utcMidnightToIstDate(engagement.endDate) : "",
        workLogs: person.workLogs.length,
        weeklyReports: person.weeklyReports.length,
        lastSubmission: person.workLogs[0]
          ? utcMidnightToIstDate(person.workLogs[0].workDate)
          : "",
        tasksAssigned: person.taskAssignments.length,
        tasksSubmitted: submittedTasks.length,
        tasksOverdue: overdue.length,
      };
    });

    await recordExport({ actor, dataset: "people", rowCount: rows.length, range });
    return csvResponse(toCsv(rows, columns), exportFilename("people"));
  },
);
