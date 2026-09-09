import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/mailer";
import { formatIstDate, istDateToUtcMidnight, istWeekBounds } from "@/lib/ist";

/**
 * The founder's Friday-evening summary, sent to every admin — there is no
 * separate "founder" flag in the schema, `isAdmin` is the one privilege flag
 * this system has.
 *
 * Deliberately omits "engagements ending within 30 days": an open engagement
 * has no expected end date to query, only an `endDate` set when it's already
 * closed. Adding that is a real but separate piece of work — a nullable
 * column plus a form field — not done speculatively here.
 *
 * Authenticated the same way the Friday reminder is; see `src/lib/cron-auth.ts`.
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { weekStart, weekEnd } = istWeekBounds();
  const weekStartUtc = istDateToUtcMidnight(weekStart);
  const weekEndUtc = istDateToUtcMidnight(weekEnd);

  const [workLogCount, weeklyReportCount, active, unreviewed, admins] = await Promise.all([
    prisma.workLog.count({
      where: { status: "SUBMITTED", workDate: { gte: weekStartUtc, lte: weekEndUtc } },
    }),
    prisma.weeklyReport.count({
      where: { status: "SUBMITTED", weekStart: weekStartUtc },
    }),
    prisma.person.findMany({
      where: { status: "ACTIVE", engagements: { some: { status: "ACTIVE" } } },
      select: {
        fullName: true,
        preferredName: true,
        weeklyReports: {
          where: { weekStart: weekStartUtc, status: "SUBMITTED" },
          select: { id: true },
        },
      },
    }),
    prisma.workLog.findMany({
      where: { status: "SUBMITTED", reviewedAt: null },
      select: {
        person: {
          select: {
            engagements: {
              where: { status: "ACTIVE" },
              take: 1,
              select: {
                mentor: { select: { id: true, email: true, fullName: true, preferredName: true } },
              },
            },
          },
        },
      },
    }),
    prisma.person.findMany({
      where: { isAdmin: true, status: "ACTIVE" },
      select: { email: true },
    }),
  ]);

  const missingWeekly = active.filter((person) => person.weeklyReports.length === 0);

  const unreviewedByMentor = new Map<string, { name: string; count: number }>();
  for (const log of unreviewed) {
    const mentor = log.person.engagements[0]?.mentor;
    if (!mentor) continue;
    const existing = unreviewedByMentor.get(mentor.id);
    if (existing) existing.count += 1;
    else {
      unreviewedByMentor.set(mentor.id, {
        name: mentor.preferredName ?? mentor.fullName,
        count: 1,
      });
    }
  }

  const text = [
    `Weekly digest — ${formatIstDate(weekStart)} to ${formatIstDate(weekEnd)}`,
    "",
    `${workLogCount} work logs submitted this week.`,
    `${weeklyReportCount} weekly reports submitted this week.`,
    "",
    missingWeekly.length === 0
      ? "Everyone with an active engagement submitted a weekly report."
      : [
          "Have not submitted a weekly report:",
          ...missingWeekly.map((p) => `  - ${p.preferredName ?? p.fullName}`),
        ].join("\n"),
    "",
    unreviewedByMentor.size === 0
      ? "No unreviewed work logs outstanding."
      : [
          "Mentors with unreviewed logs:",
          ...[...unreviewedByMentor.values()].map((m) => `  - ${m.name}: ${m.count}`),
        ].join("\n"),
  ].join("\n");

  for (const admin of admins) {
    await sendEmail({ to: admin.email, subject: "PRERAAK weekly digest", text });
  }

  return NextResponse.json({
    ok: true,
    recipientCount: admins.length,
    workLogCount,
    weeklyReportCount,
    missingWeeklyCount: missingWeekly.length,
    unreviewedMentorCount: unreviewedByMentor.size,
  });
}
