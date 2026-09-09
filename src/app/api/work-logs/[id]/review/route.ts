import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/guarded";
import { assertWritable } from "@/lib/authz";
import { applyReview } from "@/lib/review";
import { reviewInput } from "@/lib/validation/review";

type Params = { id: string };

/**
 * A mentor or admin comments on a submitted work log.
 *
 * `authorize` already refuses this on a draft, and refuses the author
 * reviewing their own work — see the "review" branch of the `work_log` case
 * in `src/lib/authz.ts`. Repeatable, not one-way: see `src/lib/review.ts`.
 */
export const POST = guarded<Params>(
  { action: "review", resource: ({ params }) => ({ kind: "work_log", id: params.id }) },
  async ({ actor, grant, params, req }) => {
    const body = await readJson(req);
    assertWritable(grant, body);
    const input = reviewInput.parse(body);

    const result = await applyReview({
      targetType: "WORK_LOG",
      targetId: params.id,
      mentorComment: input.mentorComment,
      actorId: actor.id,
    });

    return NextResponse.json({ mentorComment: result.mentorComment });
  },
);
