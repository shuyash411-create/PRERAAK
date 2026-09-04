import { z } from "zod";
import { istDate, longText, optionalLongText } from "@/lib/validation/common";

export const createWeeklyReport = z.object({
  weekStart: istDate.optional(),
  workCompleted: longText().min(1, { message: "Say what you worked on this week." }),
  deliverables: optionalLongText(),
  challenges: optionalLongText(),
  learning: optionalLongText(),
  nextWeekPlan: optionalLongText(),
});

export const updateWeeklyReport = z
  .object({
    workCompleted: longText().min(1),
    deliverables: optionalLongText(),
    challenges: optionalLongText(),
    learning: optionalLongText(),
    nextWeekPlan: optionalLongText(),
  })
  .partial();

export const listWeeklyReports = z.object({
  personId: z.string().min(1).optional(),
  status: z.enum(["DRAFT", "SUBMITTED"]).optional(),
});
