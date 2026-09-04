import { z } from "zod";
import { istDate, linkList, longText, optionalLongText, shortText } from "@/lib/validation/common";

/**
 * Only `summary` is required. Every optional field is a field somebody has to
 * decide about at 1 AM on a phone, and the sub-60-second constraint is worth
 * more than a tidier record.
 */
const content = {
  summary: shortText(500),
  workCompleted: optionalLongText(),
  blockers: optionalLongText(2000),
  nextStep: optionalLongText(2000),
  links: linkList.optional(),
};

export const createWorkLog = z.object({
  workDate: istDate.optional(),
  ...content,
});

export const updateWorkLog = z
  .object({
    workDate: istDate,
    summary: shortText(500),
    workCompleted: optionalLongText(),
    blockers: optionalLongText(2000),
    nextStep: optionalLongText(2000),
    links: linkList,
  })
  .partial();

export const listWorkLogs = z.object({
  personId: z.string().min(1).optional(),
  from: istDate.optional(),
  to: istDate.optional(),
  status: z.enum(["DRAFT", "SUBMITTED"]).optional(),
});

export type CreateWorkLogInput = z.infer<typeof createWorkLog>;
export type UpdateWorkLogInput = z.infer<typeof updateWorkLog>;
export { longText };
