import { z } from "zod";
import { isIstDate } from "@/lib/ist";

/** A `YYYY-MM-DD` IST calendar date. */
export const istDate = z
  .string()
  .refine(isIstDate, { message: "Use a real calendar date in YYYY-MM-DD form." });

/** Trimmed free text with a sane ceiling, so a runaway paste cannot fill a column. */
export const shortText = (max = 200) => z.string().trim().min(1).max(max);
export const longText = (max = 5000) => z.string().trim().max(max);
export const optionalLongText = (max = 5000) =>
  z.string().trim().max(max).nullish().transform((v) => (v === "" ? null : v));

export const linkList = z
  .array(z.string().trim().url({ message: "Links must be full URLs." }).max(500))
  .max(20, { message: "Twenty links is plenty." });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});
