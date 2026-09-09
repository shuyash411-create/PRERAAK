import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { assertWritable } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { slugify, updateTeam } from "@/lib/validation/team";

type Params = { id: string };

/**
 * Rename a team, set its lead, or retire it.
 *
 * There is no delete route. A retired team keeps its name and every engagement
 * that ever pointed at it, so historical rollups stay correct — `isActive`
 * only removes it from the pickers.
 */
export const PATCH = guarded<Params>(
  { action: "update", resource: ({ params }) => ({ kind: "team", id: params.id }) },
  async ({ grant, params, req }) => {
    const body = await readJson(req);
    assertWritable(grant, body);
    const input = updateTeam.parse(body);

    const team = await prisma.team.findUnique({ where: { id: params.id } });
    if (!team) throw new RequestError(404, "not_found", "No such team.");

    if (input.name && input.name !== team.name) {
      const slug = slugify(input.name);
      const clash = await prisma.team.findFirst({
        where: { OR: [{ name: input.name }, { slug }], NOT: { id: params.id } },
      });
      if (clash) {
        throw new RequestError(409, "team_exists", `There is already a team called ${clash.name}.`);
      }
    }

    const updated = await prisma.team.update({
      where: { id: params.id },
      data: {
        ...(input.name !== undefined ? { name: input.name, slug: slugify(input.name) } : {}),
        ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    return NextResponse.json({ team: updated });
  },
);
