import type { Actor, ExportDataset } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { recordEvent } from "@/lib/timeline";
import { addIstDays, istDateString, istDateToUtcMidnight, type IstDate } from "@/lib/ist";

/**
 * Shared machinery for the CSV exports.
 *
 * The scope rule is the same one the rest of the app uses: an admin exports
 * everyone, a mentor exports the people they mentor and nobody else. The
 * filter is applied to the query, so out-of-scope rows are never fetched.
 */

export type ExportRange = { from: IstDate; to: IstDate };

/**
 * The window an export covers.
 *
 * Defaults to the last 90 days, which covers a typical internship term.
 *
 * Deadlines are the exception: a task due next week is precisely what somebody
 * checking follow-through wants to see, and a window ending today would hide
 * every upcoming one. So the tasks export looks forward as well, unless the
 * caller asks for a specific range.
 */
export function resolveRange(
  params: URLSearchParams,
  options: { forwardDays?: number } = {},
): ExportRange {
  const today = istDateString();
  const to = params.get("to") ?? addIstDays(today, options.forwardDays ?? 0);
  const from = params.get("from") ?? addIstDays(today, -90);
  return { from, to };
}

export function rangeAsUtc(range: ExportRange) {
  return { gte: istDateToUtcMidnight(range.from), lte: istDateToUtcMidnight(range.to) };
}

/** The people an actor may export. Admins get everyone. */
export async function exportablePersonIds(actor: Actor): Promise<string[]> {
  if (actor.isAdmin) {
    const all = await prisma.person.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }

  const mentored = await prisma.engagement.findMany({
    where: { mentorId: actor.id },
    select: { personId: true },
    distinct: ["personId"],
  });

  // A mentor's export is about the people they mentor. It does not include
  // themselves: their own record is not what they came for, and leaving it out
  // keeps "this file contains exactly my mentees" true.
  return mentored.map((e) => e.personId);
}

/**
 * Record that personal data left the system.
 *
 * A CSV of names, emails, phones and colleges is an export of personal data.
 * Under the DPDP Act it should be possible to say afterwards who took what and
 * when, so every export writes to the append-only timeline.
 */
export async function recordExport(params: {
  actor: Actor;
  dataset: ExportDataset;
  rowCount: number;
  range: ExportRange;
}): Promise<void> {
  await recordEvent(prisma, {
    personId: params.actor.id,
    eventType: "DATA_EXPORTED",
    description: `Exported ${params.rowCount} ${params.dataset.replace("-", " ")} rows as CSV.`,
    actorId: params.actor.id,
    metadata: {
      dataset: params.dataset,
      rowCount: params.rowCount,
      from: params.range.from,
      to: params.range.to,
    },
  });
}

/** `preraak-people-2026-09-08.csv` */
export function exportFilename(dataset: ExportDataset): string {
  return `preraak-${dataset}-${istDateString()}.csv`;
}
