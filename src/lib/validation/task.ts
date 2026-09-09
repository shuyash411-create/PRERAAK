import { z } from "zod";
import { istDate, linkList, longText, optionalLongText, shortText } from "@/lib/validation/common";

export const createTask = z.object({
  title: shortText(200),
  description: optionalLongText(),
  teamId: z.string().min(1).nullish(),
  dueDate: istDate,
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  assigneeIds: z.array(z.string().min(1)).min(1, {
    message: "Give the task to at least one person.",
  }).max(50),
});

export const updateTask = z
  .object({
    title: shortText(200),
    description: optionalLongText(),
    teamId: z.string().min(1).nullish(),
    dueDate: istDate,
    priority: z.enum(["LOW", "NORMAL", "HIGH"]),
    status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  })
  .partial();

export const assignTask = z.object({
  add: z.array(z.string().min(1)).max(50).optional(),
  remove: z.array(z.string().min(1)).max(50).optional(),
});

/** What an assignee writes on their own submission. */
export const updateSubmission = z
  .object({
    submissionNote: longText(5000),
    links: linkList,
  })
  .partial();

export const listTasks = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  teamId: z.string().min(1).optional(),
  mine: z.enum(["true", "false"]).optional(),
});
