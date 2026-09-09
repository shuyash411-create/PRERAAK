import { NextResponse } from "next/server";
import { guarded } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { utcMidnightToIstDate } from "@/lib/ist";

/** The queue of people waiting to be confirmed. Admin only. */
export const GET = guarded({ action: "read", resource: { kind: "admin" } }, async ({ req }) => {
  const status = new URL(req.url).searchParams.get("status") ?? "PENDING";

  const submissions = await prisma.onboardingSubmission.findMany({
    where: status === "ALL" ? {} : { status: status as "PENDING" | "CONFIRMED" | "REJECTED" },
    orderBy: { createdAt: "asc" },
    include: {
      person: {
        select: {
          id: true, personId: true, fullName: true, preferredName: true, email: true,
          phone: true, college: true, course: true, graduationYear: true,
        },
      },
      requestedTeam: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    submissions: submissions.map((s) => ({
      ...s,
      proposedStartDate: utcMidnightToIstDate(s.proposedStartDate),
    })),
  });
});
