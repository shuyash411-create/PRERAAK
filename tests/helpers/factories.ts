import { db } from "./db";
import { allocatePersonId } from "@/lib/person-id";
import { istDateToUtcMidnight, istDateString } from "@/lib/ist";
import type { Person, Engagement, WorkLog } from "@prisma/client";

let counter = 0;
const uniqueEmail = (label: string) => `${label}-${++counter}-${Date.now()}@example.test`;

export async function makePerson(
  overrides: Partial<{ fullName: string; email: string; isAdmin: boolean; status: "ACTIVE" | "COMPLETED" | "ARCHIVED" }> = {},
): Promise<Person> {
  return db.person.create({
    data: {
      personId: await allocatePersonId(db),
      fullName: overrides.fullName ?? "Test Person",
      email: overrides.email ?? uniqueEmail("person"),
      isAdmin: overrides.isAdmin ?? false,
      status: overrides.status ?? "ACTIVE",
    },
  });
}

export async function makeEngagement(
  personId: string,
  overrides: Partial<{
    mentorId: string | null;
    type: "INTERNSHIP" | "EMPLOYMENT";
    startDate: string;
    status: "UPCOMING" | "ACTIVE" | "COMPLETED" | "TERMINATED";
    designation: string;
  }> = {},
): Promise<Engagement> {
  return db.engagement.create({
    data: {
      personId,
      type: overrides.type ?? "INTERNSHIP",
      designation: overrides.designation ?? "Intern",
      mentorId: overrides.mentorId ?? null,
      startDate: istDateToUtcMidnight(overrides.startDate ?? "2026-01-01"),
      status: overrides.status ?? "ACTIVE",
    },
  });
}

export async function makeWorkLog(
  personId: string,
  engagementId: string,
  overrides: Partial<{ workDate: string; summary: string; status: "DRAFT" | "SUBMITTED" }> = {},
): Promise<WorkLog> {
  const status = overrides.status ?? "DRAFT";
  return db.workLog.create({
    data: {
      personId,
      engagementId,
      workDate: istDateToUtcMidnight(overrides.workDate ?? istDateString()),
      summary: overrides.summary ?? "Worked on the thing.",
      status,
      submittedAt: status === "SUBMITTED" ? new Date() : null,
    },
  });
}

/** A person with an active engagement, which is what most tests need. */
export async function makeIntern(
  overrides: Parameters<typeof makePerson>[0] = {},
  engagement: Parameters<typeof makeEngagement>[1] = {},
): Promise<{ person: Person; engagement: Engagement }> {
  const person = await makePerson(overrides);
  return { person, engagement: await makeEngagement(person.id, engagement) };
}
