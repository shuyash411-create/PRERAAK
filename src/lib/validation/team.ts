import { z } from "zod";
import { shortText } from "@/lib/validation/common";

export const createTeam = z.object({
  name: shortText(100),
  leadId: z.string().min(1).nullish(),
});

export const updateTeam = z
  .object({
    name: shortText(100),
    leadId: z.string().min(1).nullish(),
    isActive: z.boolean(),
  })
  .partial();

/**
 * A URL-safe handle derived from the name. Lowercased, runs of anything that
 * is not a letter or digit collapsed to one hyphen, ends trimmed.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
