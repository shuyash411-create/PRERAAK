import { db } from "./db";
import { allocatePersonId } from "@/lib/person-id";
import { addIstDays, istDateToUtcMidnight, istDateString, istWeekBounds } from "@/lib/ist";
import type { Person, Engagement, WorkLog, WeeklyReport, Team, Task, TaskAssignment } from "@prisma/client";

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
  overrides: Partial<{
    workDate: string;
    summary: string;
    status: "DRAFT" | "SUBMITTED";
    mentorComment: string | null;
    reviewedById: string | null;
    reviewedAt: Date | null;
  }> = {},
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
      mentorComment: overrides.mentorComment ?? null,
      reviewedById: overrides.reviewedById ?? null,
      reviewedAt: overrides.reviewedAt ?? null,
    },
  });
}

/** A weekly report. Mirrors `makeWorkLog`'s shape. */
export async function makeWeeklyReport(
  personId: string,
  engagementId: string,
  overrides: Partial<{
    weekStart: string;
    workCompleted: string;
    status: "DRAFT" | "SUBMITTED";
    mentorComment: string | null;
    reviewedById: string | null;
    reviewedAt: Date | null;
  }> = {},
): Promise<WeeklyReport> {
  const status = overrides.status ?? "DRAFT";
  const weekStart = overrides.weekStart ?? istWeekBounds().weekStart;
  return db.weeklyReport.create({
    data: {
      personId,
      engagementId,
      weekStart: istDateToUtcMidnight(weekStart),
      weekEnd: istDateToUtcMidnight(addIstDays(weekStart, 6)),
      workCompleted: overrides.workCompleted ?? "Worked on the thing this week.",
      status,
      submittedAt: status === "SUBMITTED" ? new Date() : null,
      mentorComment: overrides.mentorComment ?? null,
      reviewedById: overrides.reviewedById ?? null,
      reviewedAt: overrides.reviewedAt ?? null,
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

export async function makeTeam(name = `Team ${++counter}`): Promise<Team> {
  return db.team.create({
    data: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") },
  });
}

export async function makeTask(
  createdById: string,
  overrides: Partial<{ title: string; dueDate: string; teamId: string | null }> = {},
): Promise<Task> {
  return db.task.create({
    data: {
      title: overrides.title ?? "Write the migration",
      dueDate: istDateToUtcMidnight(overrides.dueDate ?? istDateString()),
      teamId: overrides.teamId ?? null,
      createdById,
    },
  });
}

export async function assign(
  taskId: string,
  personId: string,
  assignedById: string,
  overrides: Partial<{
    status: "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED";
    submissionNote: string;
    mentorComment: string | null;
    reviewedById: string | null;
    reviewedAt: Date | null;
  }> = {},
): Promise<TaskAssignment> {
  const status = overrides.status ?? "ASSIGNED";
  return db.taskAssignment.create({
    data: {
      taskId,
      personId,
      assignedById,
      status,
      submissionNote: overrides.submissionNote ?? (status === "SUBMITTED" ? "Handed in." : null),
      submittedAt: status === "SUBMITTED" ? new Date() : null,
      mentorComment: overrides.mentorComment ?? null,
      reviewedById: overrides.reviewedById ?? null,
      reviewedAt: overrides.reviewedAt ?? null,
    },
  });
}

export async function makeOnboarding(
  personId: string,
  overrides: Partial<{ designation: string; teamId: string | null; status: "PENDING" | "CONFIRMED" | "REJECTED" }> = {},
) {
  return db.onboardingSubmission.create({
    data: {
      personId,
      requestedDesignation: overrides.designation ?? "Engineering Intern",
      requestedTeamId: overrides.teamId ?? null,
      proposedStartDate: istDateToUtcMidnight(istDateString()),
      status: overrides.status ?? "PENDING",
    },
  });
}
