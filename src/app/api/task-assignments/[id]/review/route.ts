import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/guarded";
import { assertWritable } from "@/lib/authz";
import { applyReview } from "@/lib/review";
import { reviewInput } from "@/lib/validation/review";

type Params = { id: string };

/** A mentor or admin comments on a submitted task assignment. See work-logs' review route. */
export const POST = guarded<Params>(
  { action: "review", resource: ({ params }) => ({ kind: "task_assignment", id: params.id }) },
  async ({ actor, grant, params, req }) => {
    const body = await readJson(req);
    assertWritable(grant, body);
    const input = reviewInput.parse(body);

    const result = await applyReview({
      targetType: "TASK_ASSIGNMENT",
      targetId: params.id,
      mentorComment: input.mentorComment,
      actorId: actor.id,
    });

    return NextResponse.json({ mentorComment: result.mentorComment });
  },
);
