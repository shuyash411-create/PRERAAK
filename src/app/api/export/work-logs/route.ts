import { guarded } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { csvResponse, toCsv, type Column } from "@/lib/csv";
import { exportFilename, exportablePersonIds, rangeAsUtc, recordExport, resolveRange } from "@/lib/export";
import { utcMidnightToIstDate } from "@/lib/ist";

type Row = {
  workDate: string; personId: string; name: string; team: string;
  summary: string; workCompleted: string; blockers: string; nextStep: string;
  links: string; status: string; reviewer: string;
};

const columns: Column<Row>[] = [
  { header: "Date", value: (r) => r.workDate },
  { header: "PRERAAK ID", value: (r) => r.personId },
  { header: "Name", value: (r) => r.name },
  { header: "Team", value: (r) => r.team },
  { header: "Summary", value: (r) => r.summary },
  { header: "Work completed", value: (r) => r.workCompleted },
  { header: "Blockers", value: (r) => r.blockers },
  { header: "Next step", value: (r) => r.nextStep },
  { header: "Links", value: (r) => r.links },
  { header: "Status", value: (r) => r.status },
  { header: "Reviewed by", value: (r) => r.reviewer },
];

/**
 * Every work log in range, one per row.
 *
 * Dates are IST calendar dates, exactly as they were filed. Nothing about the
 * time of day a log was submitted appears here, by design.
 */
export const GET = guarded(
  { action: "export", resource: { kind: "export", dataset: "work-logs" } },
  async ({ actor, req }) => {
    const range = resolveRange(new URL(req.url).searchParams);
    const ids = await exportablePersonIds(actor);

    const logs = await prisma.workLog.findMany({
      where: { personId: { in: ids }, workDate: rangeAsUtc(range) },
      orderBy: [{ workDate: "desc" }, { personId: "asc" }],
      include: {
        person: {
          select: {
            personId: true, fullName: true, preferredName: true,
            engagements: {
              orderBy: { startDate: "desc" },
              take: 1,
              select: { team: { select: { name: true } } },
            },
          },
        },
        reviewedBy: { select: { fullName: true, preferredName: true } },
      },
    });

    const rows: Row[] = logs.map((log) => ({
      workDate: utcMidnightToIstDate(log.workDate),
      personId: log.person.personId,
      name: log.person.preferredName ?? log.person.fullName,
      team: log.person.engagements[0]?.team?.name ?? "",
      summary: log.summary,
      workCompleted: log.workCompleted ?? "",
      blockers: log.blockers ?? "",
      nextStep: log.nextStep ?? "",
      links: log.links.join(" "),
      status: log.status,
      reviewer: log.reviewedBy ? log.reviewedBy.preferredName ?? log.reviewedBy.fullName : "",
    }));

    await recordExport({ actor, dataset: "work-logs", rowCount: rows.length, range });
    return csvResponse(toCsv(rows, columns), exportFilename("work-logs"));
  },
);
