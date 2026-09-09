import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/mailer";
import { formatIstDate, istDateToUtcMidnight, istWeekBounds } from "@/lib/ist";

/**
 * A Friday nudge to anyone with an active engagement who has not submitted a
 * weekly report for the current IST week.
 *
 * Triggered by Vercel Cron (see `vercel.json`), never by a person, so it is
 * authenticated by a shared secret rather than `guarded()` — see
 * `src/lib/cron-auth.ts`.
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { weekStart } = istWeekBounds();
  const weekStartUtc = istDateToUtcMidnight(weekStart);

  const active = await prisma.person.findMany({
    where: { status: "ACTIVE", engagements: { some: { status: "ACTIVE" } } },
    select: {
      email: true,
      fullName: true,
      preferredName: true,
      weeklyReports: {
        where: { weekStart: weekStartUtc, status: "SUBMITTED" },
        select: { id: true },
      },
    },
  });

  const missing = active.filter((person) => person.weeklyReports.length === 0);

  for (const person of missing) {
    await sendEmail({
      to: person.email,
      subject: "This week's report is still open",
      text: [
        `Hi ${person.preferredName ?? person.fullName.split(" ")[0]},`,
        "",
        `You haven't submitted a weekly report for the week of ${formatIstDate(weekStart)} yet.`,
        "It only takes a few minutes — sign in and file it whenever suits you.",
      ].join("\n"),
    });
  }

  return NextResponse.json({ ok: true, remindersSent: missing.length });
}
