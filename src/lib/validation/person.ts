import { z } from "zod";
import { istDate, shortText } from "@/lib/validation/common";

/**
 * Section 6 of the brief: name, preferred name, email, phone, college, course,
 * graduation year. Nothing else. Under the DPDP Act every extra sensitive
 * field is an obligation for no operational benefit at this scale, so adding
 * one is a deliberate decision, not a convenience.
 */
export const createPerson = z.object({
  fullName: shortText(200),
  preferredName: shortText(100).optional(),
  email: z.string().trim().toLowerCase().email({ message: "That does not look like an email address." }),
  phone: z.string().trim().max(20).optional(),
  college: shortText(200).optional(),
  course: shortText(200).optional(),
  graduationYear: z.coerce.number().int().min(1950).max(2100).optional(),
  isAdmin: z.boolean().default(false),
});

export const updatePerson = createPerson.partial();

export const createEngagement = z.object({
  personId: z.string().min(1),
  type: z.enum(["INTERNSHIP", "EMPLOYMENT"]),
  designation: shortText(200),
  department: shortText(200).optional(),
  mentorId: z.string().min(1).nullish(),
  startDate: istDate,
  workMode: z.enum(["ONSITE", "REMOTE", "HYBRID"]).optional(),
});

export const closeEngagement = z.object({
  endDate: istDate,
  status: z.enum(["COMPLETED", "TERMINATED"]).default("COMPLETED"),
});

export const listPeople = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});
