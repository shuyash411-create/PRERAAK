import { z } from "zod";
import { shortText } from "@/lib/validation/common";

/**
 * A mentor's or admin's comment on somebody else's submitted work.
 *
 * `shortText` rather than `longText`: a comment is required — there is
 * nothing to review about leaving an empty one — and 2000 characters is
 * plenty for feedback on a day's work or a week's report.
 */
export const reviewInput = z.object({
  mentorComment: shortText(2000),
});
