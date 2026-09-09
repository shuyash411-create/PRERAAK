import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { createTeam, slugify } from "@/lib/validation/team";

/** Teams with their headcount. Admin only — this counts people. */
export const GET = guarded({ action: "read", resource: { kind: "admin" } }, async () => {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      lead: { select: { id: true, fullName: true, preferredName: true } },
      _count: { select: { engagements: true, tasks: true } },
    },
  });

  return NextResponse.json({ teams });
});

export const POST = guarded({ action: "create", resource: { kind: "admin" } }, async ({ req }) => {
  const input = createTeam.parse(await readJson(req));
  const slug = slugify(input.name);
  if (!slug) throw new RequestError(400, "invalid_name", "Give the team a name with letters in it.");

  const clash = await prisma.team.findFirst({
    where: { OR: [{ name: input.name }, { slug }] },
  });
  if (clash) {
    throw new RequestError(409, "team_exists", `There is already a team called ${clash.name}.`);
  }

  const team = await prisma.team.create({
    data: { name: input.name, slug, leadId: input.leadId ?? null },
  });

  return NextResponse.json({ team }, { status: 201 });
});
