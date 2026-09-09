import { NextResponse } from "next/server";
import { guarded } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";

/**
 * The team list, for pickers.
 *
 * Readable by anyone signed in: a person completing onboarding has to choose
 * one, and a team name is not personal data. Only names and ids go out — no
 * headcount, no membership.
 */
export const GET = guarded(
  { action: "read", resource: { kind: "team", id: "*" } },
  async ({ req }) => {
    const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "true";

    const teams = await prisma.team.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, isActive: true },
    });

    return NextResponse.json({ teams });
  },
);
