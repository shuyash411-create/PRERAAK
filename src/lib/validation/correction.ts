import { z } from "zod";
import type { CorrectionTarget } from "@prisma/client";
import { longText, shortText } from "@/lib/validation/common";
import {
  TASK_SUBMISSION_FIELDS,
  WEEKLY_REPORT_DRAFT_FIELDS,
  WORK_LOG_DRAFT_FIELDS,
} from "@/lib/authz";

/**
 * A correction proposes new values for content fields only. The allowlist is
 * the same one the author had while the record was a draft, so a correction
 * can never reach status, timestamps or review fields.
 */
const workLogProposal = z
  .object({
    summary: shortText(500),
    workCompleted: longText().nullish(),
    blockers: longText(2000).nullish(),
    nextStep: longText(2000).nullish(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Propose at least one change.",
  });

const weeklyReportProposal = z
  .object({
    workCompleted: longText(),
    deliverables: longText().nullish(),
    challenges: longText().nullish(),
    learning: longText().nullish(),
    nextWeekPlan: longText().nullish(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Propose at least one change.",
  });

const taskAssignmentProposal = z
  .object({
    submissionNote: longText(2000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Propose at least one change.",
  });

export const createCorrection = z.discriminatedUnion("targetType", [
  z.object({
    targetType: z.literal("WORK_LOG"),
    targetId: z.string().min(1),
    reason: shortText(1000),
    proposedValue: workLogProposal,
  }),
  z.object({
    targetType: z.literal("WEEKLY_REPORT"),
    targetId: z.string().min(1),
    reason: shortText(1000),
    proposedValue: weeklyReportProposal,
  }),
  z.object({
    targetType: z.literal("TASK_ASSIGNMENT"),
    targetId: z.string().min(1),
    reason: shortText(1000),
    proposedValue: taskAssignmentProposal,
  }),
]);

export const decideCorrection = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: shortText(1000).optional(),
});

/** Fields a correction may touch, per target type. */
export const CORRECTABLE_FIELDS: Record<CorrectionTarget, readonly string[]> = {
  WORK_LOG: WORK_LOG_DRAFT_FIELDS.filter((f) => f !== "workDate" && f !== "links"),
  WEEKLY_REPORT: WEEKLY_REPORT_DRAFT_FIELDS,
  // Links are evidence of what was handed in; correcting the note is enough.
  TASK_ASSIGNMENT: TASK_SUBMISSION_FIELDS.filter((f) => f !== "links"),
};
