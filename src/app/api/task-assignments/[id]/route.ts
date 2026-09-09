import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { assertWritable } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { updateSubmission } from "@/lib/validation/task";

type Params = { id: string };

export const GET = guarded<Params>(
  { action: "read", resource: ({ params }) => ({ kind: "task_assignment", id: params.id }) },
  async ({ params }) => {
    const assignment = await prisma.taskAssignment.findUnique({
      where: { id: params.id },
      include: {
        task: { select: { id: true, title: true, dueDate: true } },
        person: { select: { id: true, personId: true, fullName: true, preferredName: true } },
      },
    });
    if (!assignment) throw new RequestError(404, "not_found", "That assignment no longer exists.");

    return NextResponse.json({ assignment });
  },
);

/**
 * Edit your own submission before handing it in.
 *
 * A submitted assignment never reaches this handler: `authorize` refuses
 * `update` on one, for its author and for admins alike. Changing a submitted
 * one goes through a correction request, which keeps the previous value.
 */
export const PATCH = guarded<Params>(
  { action: "update", resource: ({ params }) => ({ kind: "task_assignment", id: params.id }) },
  async ({ grant, params, req }) => {
    const body = await readJson(req);
    assertWritable(grant, body);
    const input = updateSubmission.parse(body);

    const assignment = await prisma.taskAssignment.update({
      where: { id: params.id },
      data: {
        ...(input.submissionNote !== undefined ? { submissionNote: input.submissionNote } : {}),
        ...(input.links !== undefined ? { links: input.links } : {}),
        // Touching a draft means work has started.
        status: "IN_PROGRESS",
      },
    });

    return NextResponse.json({ assignment });
  },
);
