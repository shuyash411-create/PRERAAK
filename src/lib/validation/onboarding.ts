import { z } from "zod";
import { istDate, shortText } from "@/lib/validation/common";

/**
 * What a newly invited person tells us about themselves.
 *
 * Only the fields section 6 of the brief permits, plus the team and
 * designation they are *requesting* — an admin confirms those, because they
 * are what progress is grouped and reported by.
 */
export const submitOnboarding = z.object({
  preferredName: shortText(100).optional(),
  phone: z.string().trim().max(20).optional(),
  college: shortText(200).optional(),
  course: shortText(200).optional(),
  graduationYear: z.coerce.number().int().min(1950).max(2100).optional(),

  requestedTeamId: z.string().min(1).nullish(),
  requestedDesignation: shortText(200),
  requestedType: z.enum(["INTERNSHIP", "EMPLOYMENT"]).default("INTERNSHIP"),
  proposedStartDate: istDate,
});

export const decideOnboarding = z.object({
  decision: z.enum(["CONFIRM", "REJECT"]),
  /** An admin may correct what was requested before confirming it. */
  teamId: z.string().min(1).nullish(),
  designation: shortText(200).optional(),
  type: z.enum(["INTERNSHIP", "EMPLOYMENT"]).optional(),
  startDate: istDate.optional(),
  mentorId: z.string().min(1).nullish(),
  note: shortText(1000).optional(),
});
