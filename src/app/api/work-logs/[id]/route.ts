import { NextResponse } from "next/server";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { assertWritable } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { istDateToUtcMidnight } from "@/lib/ist";
import { serializeWorkLog } from "@/lib/serialize";
import { updateWorkLog } from "@/lib/validation/work-log";

type Params = { id: string };

/** Read one work log. In scope for its author, their mentor, and admins. */
export const GET = guarded<Params>(
  { action: "read", resource: ({ params }) => ({ kind: "work_log", id: params.id }) },
  async ({ params }) => {
    const log = await prisma.workLog.findUnique({
      where: { id: params.id },
      include: {
        person: { select: { id: true, personId: true, fullName: true, preferredName: true } },
      },
    });
    // authorize already established the log exists and is in scope.
    if (!log) throw new RequestError(404, "not_found", "That work log no longer exists.");

    return NextResponse.json({ workLog: { ...serializeWorkLog(log), person: log.person } });
  },
);

/**
 * Edit a draft.
 *
 * A submitted log never reaches this handler: `authorize` refuses `update` on
 * one, for its author and for everybody else. The field allowlist then bounds
 * what a permitted edit may touch, so status, timestamps and review fields are
 * unreachable from a request body.
 */
export const PATCH = guarded<Params>(
  { action: "update", resource: ({ params }) => ({ kind: "work_log", id: params.id }) },
  async ({ grant, params, req }) => {
    const body = await readJson(req);
    assertWritable(grant, body);
    const input = updateWorkLog.parse(body);

    const log = await prisma.workLog.update({
      where: { id: params.id },
      data: {
        ...(input.workDate !== undefined ? { workDate: istDateToUtcMidnight(input.workDate) } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.workCompleted !== undefined ? { workCompleted: input.workCompleted } : {}),
        ...(input.blockers !== undefined ? { blockers: input.blockers } : {}),
        ...(input.nextStep !== undefined ? { nextStep: input.nextStep } : {}),
        ...(input.links !== undefined ? { links: input.links } : {}),
      },
    });

    return NextResponse.json({ workLog: serializeWorkLog(log) });
  },
);
