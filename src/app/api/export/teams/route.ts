import { guarded } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { csvResponse, toCsv, type Column } from "@/lib/csv";
import { exportFilename, exportablePersonIds, rangeAsUtc, recordExport, resolveRange } from "@/lib/export";
import { istDateString, istDaysBetween, utcMidnightToIstDate } from "@/lib/ist";

type Row = {
  team: string; lead: string; headcount: number; active: number;
  workLogs: number; weeklyReports: number;
  tasksOpen: number; tasksSubmitted: number; tasksOverdue: number;
  notSubmittedRecently: number;
};

const columns: Column<Row>[] = [
  { header: "Team", value: (r) => r.team },
  { header: "Lead", value: (r) => r.lead },
  { header: "People", value: (r) => r.headcount },
  { header: "Active people", value: (r) => r.active },
  { header: "Work logs submitted", value: (r) => r.workLogs },
  { header: "Weekly reports submitted", value: (r) => r.weeklyReports },
  { header: "Tasks outstanding", value: (r) => r.tasksOpen },
  { header: "Tasks submitted", value: (r) => r.tasksSubmitted },
  { header: "Tasks overdue", value: (r) => r.tasksOverdue },
  { header: "No log in last 7 days", value: (r) => r.notSubmittedRecently },
];

/**
 * One row per team.
 *
 * Rolled up from the same people the actor may export, so a mentor's team row
 * counts only their mentees rather than the whole team — the numbers describe
 * what they can see, and the people export alongside it says who that is.
 */
export const GET = guarded(
  { action: "export", resource: { kind: "export", dataset: "teams" } },
  async ({ actor, req }) => {
    const range = resolveRange(new URL(req.url).searchParams);
    const window = rangeAsUtc(range);
    const ids = await exportablePersonIds(actor);
    const today = istDateString();

    const teams = await prisma.team.findMany({
      orderBy: { name: "asc" },
      include: { lead: { select: { fullName: true, preferredName: true } } },
    });

    const engagements = await prisma.engagement.findMany({
      where: { personId: { in: ids } },
      select: { personId: true, teamId: true, status: true },
    });

    const rows: Row[] = [];

    for (const team of [...teams, null]) {
      const members = engagements.filter((e) =>
        team ? e.teamId === team.id : e.teamId === null,
      );
      const memberIds = [...new Set(members.map((m) => m.personId))];
      if (memberIds.length === 0) continue;

      const [workLogs, weeklyReports, assignments, recentLogs] = await Promise.all([
        prisma.workLog.count({
          where: { personId: { in: memberIds }, status: "SUBMITTED", workDate: window },
        }),
        prisma.weeklyReport.count({
          where: { personId: { in: memberIds }, status: "SUBMITTED", weekStart: window },
        }),
        prisma.taskAssignment.findMany({
          where: { personId: { in: memberIds } },
          include: { task: { select: { dueDate: true } } },
        }),
        prisma.workLog.findMany({
          where: { personId: { in: memberIds }, status: "SUBMITTED" },
          select: { personId: true, workDate: true },
          orderBy: { workDate: "desc" },
        }),
      ]);

      const submitted = assignments.filter((a) => a.status === "SUBMITTED");
      const overdue = assignments.filter(
        (a) =>
          a.status !== "SUBMITTED" &&
          istDaysBetween(today, utcMidnightToIstDate(a.task.dueDate)) < 0,
      );

      const loggedRecently = new Set(
        recentLogs
          .filter((l) => istDaysBetween(utcMidnightToIstDate(l.workDate), today) <= 7)
          .map((l) => l.personId),
      );

      rows.push({
        team: team?.name ?? "(no team)",
        lead: team?.lead ? team.lead.preferredName ?? team.lead.fullName : "",
        headcount: memberIds.length,
        active: members.filter((m) => m.status === "ACTIVE").length,
        workLogs,
        weeklyReports,
        tasksOpen: assignments.length - submitted.length,
        tasksSubmitted: submitted.length,
        tasksOverdue: overdue.length,
        notSubmittedRecently: memberIds.filter((id) => !loggedRecently.has(id)).length,
      });
    }

    await recordExport({ actor, dataset: "teams", rowCount: rows.length, range });
    return csvResponse(toCsv(rows, columns), exportFilename("teams"));
  },
);
