import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/guarded";
import { decideCorrection as applyDecision } from "@/lib/corrections";
import { decideCorrection as decideSchema } from "@/lib/validation/correction";

type Params = { id: string };

/**
 * Approve or reject a correction. Admin only.
 *
 * Approval preserves the previous value in the same transaction that applies
 * the new one — see lib/corrections.ts.
 */
export const POST = guarded<Params>(
  { action: "decide", resource: ({ params }) => ({ kind: "correction", id: params.id }) },
  async ({ actor, params, req }) => {
    const input = decideSchema.parse(await readJson(req));

    const result = await applyDecision({
      correctionId: params.id,
      decision: input.decision,
      adminId: actor.id,
      note: input.note,
    });

    return NextResponse.json({ status: result.status });
  },
);
