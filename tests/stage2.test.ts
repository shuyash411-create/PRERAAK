import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", async () => {
  const { signedInPersonId } = await import("./helpers/session");
  const { db } = await import("./helpers/db");
  return {
    currentActor: async () => {
      const id = signedInPersonId();
      if (!id) return null;
      return db.person.findUnique({
        where: { id },
        select: { id: true, personId: true, isAdmin: true, status: true },
      });
    },
    auth: async () => null,
    handlers: {},
    signIn: async () => undefined,
    signOut: async () => undefined,
  };
});

import { db, resetDatabase } from "./helpers/db";
import {
  assign, makeEngagement, makeIntern, makeOnboarding, makePerson, makeTask, makeTeam,
} from "./helpers/factories";
import { signInAs } from "./helpers/session";
import { call } from "./helpers/request";

import * as tasksRoute from "@/app/api/tasks/route";
import * as taskRoute from "@/app/api/tasks/[id]/route";
import * as adminTasksRoute from "@/app/api/admin/tasks/route";
import * as assignmentRoute from "@/app/api/task-assignments/[id]/route";
import * as submitRoute from "@/app/api/task-assignments/[id]/submit/route";
import * as onboardingRoute from "@/app/api/onboarding/route";
import * as adminOnboardingRoute from "@/app/api/admin/onboarding/route";
import * as decideOnboardingRoute from "@/app/api/admin/onboarding/[id]/decide/route";
import * as adminPersonRoute from "@/app/api/admin/people/[id]/route";
import * as adminTeamsRoute from "@/app/api/admin/teams/route";
import * as correctionsRoute from "@/app/api/correction-requests/route";
import * as decideCorrectionRoute from "@/app/api/correction-requests/[id]/decide/route";
import * as exportPeopleRoute from "@/app/api/export/people/route";
import * as exportWorkLogsRoute from "@/app/api/export/work-logs/route";
import * as exportTasksRoute from "@/app/api/export/tasks/route";
import * as exportTeamsRoute from "@/app/api/export/teams/route";

import { istDateString } from "@/lib/ist";

beforeEach(async () => {
  await resetDatabase();
  signInAs(null);
});
afterAll(async () => {
  await db.$disconnect();
});

/* ------------------------------------------------------------------ *
 * Tasks: who may see and submit what.
 * ------------------------------------------------------------------ */
describe("task access", () => {
  it("refuses intern A a task assigned only to intern B", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const b = await makeIntern();
    const task = await makeTask(admin.id);
    await assign(task.id, b.person.id, admin.id);

    signInAs(a.person.id);
    expect((await call(taskRoute.GET, { params: { id: task.id } })).status).toBe(403);
  });

  it("lets an assignee read their own task", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const task = await makeTask(admin.id);
    await assign(task.id, a.person.id, admin.id);

    signInAs(a.person.id);
    expect((await call(taskRoute.GET, { params: { id: task.id } })).status).toBe(200);
  });

  it("lets a mentor read a task their mentee is on, but not a stranger's", async () => {
    const admin = await makePerson({ isAdmin: true });
    const mentor = await makePerson();
    const mentee = await makePerson();
    await makeEngagement(mentee.id, { mentorId: mentor.id });
    const stranger = await makeIntern();

    const mentored = await makeTask(admin.id, { title: "Mentee task" });
    await assign(mentored.id, mentee.id, admin.id);
    const other = await makeTask(admin.id, { title: "Stranger task" });
    await assign(other.id, stranger.person.id, admin.id);

    signInAs(mentor.id);
    expect((await call(taskRoute.GET, { params: { id: mentored.id } })).status).toBe(200);
    expect((await call(taskRoute.GET, { params: { id: other.id } })).status).toBe(403);
  });

  it("lists only tasks in the actor's scope", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const b = await makeIntern();
    const mine = await makeTask(admin.id, { title: "Mine" });
    const theirs = await makeTask(admin.id, { title: "Theirs" });
    await assign(mine.id, a.person.id, admin.id);
    await assign(theirs.id, b.person.id, admin.id);

    signInAs(a.person.id);
    const result = await call<{ tasks: { title: string }[] }>(tasksRoute.GET);
    expect(result.body.tasks.map((t) => t.title)).toEqual(["Mine"]);
  });

  it("does not reveal co-assignees a person may not otherwise see", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const b = await makeIntern({ fullName: "Hidden Colleague" });
    const task = await makeTask(admin.id);
    await assign(task.id, a.person.id, admin.id);
    await assign(task.id, b.person.id, admin.id);

    signInAs(a.person.id);
    const result = await call<{ task: { assignments: { person: { id: string } }[] } }>(
      taskRoute.GET, { params: { id: task.id } },
    );
    expect(result.body.task.assignments).toHaveLength(1);
    expect(result.body.task.assignments[0].person.id).toBe(a.person.id);
  });
});

describe("task submission is immutable once handed in", () => {
  async function submittedAssignment() {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const task = await makeTask(admin.id);
    const assignment = await assign(task.id, a.person.id, admin.id, {
      status: "SUBMITTED",
      submissionNote: "The original note.",
    });
    return { admin, person: a.person, task, assignment };
  }

  it("refuses the author editing it", async () => {
    const { person, assignment } = await submittedAssignment();
    signInAs(person.id);

    const result = await call(assignmentRoute.PATCH, {
      method: "PATCH", params: { id: assignment.id }, body: { submissionNote: "Second thoughts." },
    });

    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: "submitted_records_are_immutable" });
    const row = await db.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(row.submissionNote).toBe("The original note.");
  });

  it("refuses an admin editing it directly", async () => {
    const { admin, assignment } = await submittedAssignment();
    signInAs(admin.id);

    const result = await call(assignmentRoute.PATCH, {
      method: "PATCH", params: { id: assignment.id }, body: { submissionNote: "Admin edit." },
    });

    expect(result.status).toBe(403);
    const row = await db.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(row.submissionNote).toBe("The original note.");
  });

  it("refuses submitting somebody else's assignment", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const b = await makeIntern();
    const task = await makeTask(admin.id);
    const theirs = await assign(task.id, b.person.id, admin.id, { submissionNote: "Theirs." });

    signInAs(a.person.id);
    expect(
      (await call(submitRoute.POST, { method: "POST", params: { id: theirs.id } })).status,
    ).toBe(403);
  });

  it("refuses submitting twice", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const task = await makeTask(admin.id);
    const assignment = await assign(task.id, a.person.id, admin.id, { submissionNote: "Done." });

    signInAs(a.person.id);
    const first = await call(submitRoute.POST, { method: "POST", params: { id: assignment.id } });
    const second = await call(submitRoute.POST, { method: "POST", params: { id: assignment.id } });
    expect(first.status).toBe(200);
    expect(second.status).toBe(403);
  });

  it("refuses writing fields outside the submission allowlist", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const task = await makeTask(admin.id);
    const assignment = await assign(task.id, a.person.id, admin.id);

    signInAs(a.person.id);
    for (const body of [
      { status: "SUBMITTED" },
      { mentorComment: "Reviewed myself." },
      { submittedAt: new Date().toISOString() },
      { personId: "somebody-else" },
    ]) {
      const result = await call(assignmentRoute.PATCH, {
        method: "PATCH", params: { id: assignment.id }, body,
      });
      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({ error: "field_not_writable" });
    }
  });

  it("refuses a non-admin creating a task", async () => {
    const a = await makeIntern();
    signInAs(a.person.id);
    const result = await call(adminTasksRoute.POST, {
      method: "POST",
      body: { title: "Sneaky", dueDate: istDateString(), assigneeIds: [a.person.id] },
    });
    expect(result.status).toBe(403);
    expect(await db.task.count()).toBe(0);
  });

  it("preserves the previous value when a task correction is approved", async () => {
    const { admin, person, assignment } = await submittedAssignment();

    signInAs(person.id);
    const requested = await call<{ correctionRequest: { id: string } }>(correctionsRoute.POST, {
      method: "POST",
      body: {
        targetType: "TASK_ASSIGNMENT",
        targetId: assignment.id,
        reason: "Left out the tricky bit.",
        proposedValue: { submissionNote: "The corrected note." },
      },
    });
    expect(requested.status).toBe(201);

    signInAs(admin.id);
    const decided = await call(decideCorrectionRoute.POST, {
      method: "POST",
      params: { id: requested.body.correctionRequest.id },
      body: { decision: "APPROVE" },
    });
    expect(decided.status).toBe(200);

    const correction = await db.correctionRequest.findUniqueOrThrow({
      where: { id: requested.body.correctionRequest.id },
    });
    expect(correction.previousValue).toEqual({ submissionNote: "The original note." });

    const row = await db.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(row.submissionNote).toBe("The corrected note.");
  });
});

/* ------------------------------------------------------------------ *
 * Onboarding.
 * ------------------------------------------------------------------ */
describe("onboarding", () => {
  it("refuses a non-admin confirming a submission", async () => {
    const newcomer = await makePerson();
    const other = await makeIntern();
    const submission = await makeOnboarding(newcomer.id);

    signInAs(other.person.id);
    const result = await call(decideOnboardingRoute.POST, {
      method: "POST", params: { id: submission.id }, body: { decision: "CONFIRM" },
    });
    expect(result.status).toBe(403);
    expect(await db.engagement.count({ where: { personId: newcomer.id } })).toBe(0);
  });

  it("refuses a non-admin reading the queue", async () => {
    const a = await makeIntern();
    signInAs(a.person.id);
    expect((await call(adminOnboardingRoute.GET)).status).toBe(403);
  });

  it("refuses editing an onboarding submission after it has been decided", async () => {
    const newcomer = await makePerson();
    await makeOnboarding(newcomer.id, { status: "CONFIRMED" });

    signInAs(newcomer.id);
    const result = await call(onboardingRoute.POST, {
      method: "POST",
      body: { requestedDesignation: "Something Else", proposedStartDate: istDateString() },
    });
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: "onboarding_already_decided" });
  });

  it("opens exactly one engagement with the confirmed values, and records both", async () => {
    const admin = await makePerson({ isAdmin: true });
    const team = await makeTeam("Design");
    const newcomer = await makePerson({ fullName: "New Joiner" });
    const submission = await makeOnboarding(newcomer.id, { designation: "Intern (requested)" });

    signInAs(admin.id);
    const result = await call(decideOnboardingRoute.POST, {
      method: "POST",
      params: { id: submission.id },
      body: {
        decision: "CONFIRM",
        teamId: team.id,
        designation: "Design Intern",
        startDate: istDateString(),
      },
    });
    expect(result.status).toBe(200);

    const engagements = await db.engagement.findMany({ where: { personId: newcomer.id } });
    expect(engagements).toHaveLength(1);
    expect(engagements[0].designation).toBe("Design Intern");
    expect(engagements[0].teamId).toBe(team.id);

    const event = await db.timelineEvent.findFirstOrThrow({
      where: { personId: newcomer.id, eventType: "ONBOARDING_CONFIRMED" },
    });
    // Both what was asked for and what was accepted are on the record.
    expect(event.metadata).toMatchObject({
      requested: { designation: "Intern (requested)" },
      confirmed: { designation: "Design Intern" },
    });
  });

  it("refuses confirming the same submission twice", async () => {
    const admin = await makePerson({ isAdmin: true });
    const newcomer = await makePerson();
    const submission = await makeOnboarding(newcomer.id);

    signInAs(admin.id);
    const body = { decision: "CONFIRM", startDate: istDateString() };
    expect((await call(decideOnboardingRoute.POST, { method: "POST", params: { id: submission.id }, body })).status).toBe(200);
    expect((await call(decideOnboardingRoute.POST, { method: "POST", params: { id: submission.id }, body })).status).toBe(409);
    expect(await db.engagement.count({ where: { personId: newcomer.id } })).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * Self-service profile.
 * ------------------------------------------------------------------ */
describe("editing your own profile", () => {
  it("refuses raising your own privileges or changing your login identity", async () => {
    const a = await makeIntern();
    signInAs(a.person.id);

    for (const body of [
      { isAdmin: true },
      { email: "attacker@example.test" },
      { status: "ACTIVE" },
      { personId: "PRR-000001" },
      { fullName: "Renamed Themselves" },
    ]) {
      const result = await call(adminPersonRoute.PATCH, {
        method: "PATCH", params: { id: a.person.id }, body,
      });
      expect(result.status).toBe(403);
    }

    const unchanged = await db.person.findUniqueOrThrow({ where: { id: a.person.id } });
    expect(unchanged.isAdmin).toBe(false);
    expect(unchanged.email).toBe(a.person.email);
  });

  it("refuses editing somebody else's profile", async () => {
    const a = await makeIntern();
    const b = await makeIntern();
    signInAs(a.person.id);

    const result = await call(adminPersonRoute.PATCH, {
      method: "PATCH", params: { id: b.person.id }, body: { phone: "9999999999" },
    });
    expect(result.status).toBe(403);
  });

  it("refuses a mentor editing their mentee's profile", async () => {
    const mentor = await makePerson();
    const mentee = await makePerson();
    await makeEngagement(mentee.id, { mentorId: mentor.id });

    signInAs(mentor.id);
    const result = await call(adminPersonRoute.PATCH, {
      method: "PATCH", params: { id: mentee.id }, body: { phone: "9999999999" },
    });
    expect(result.status).toBe(403);
  });
});

/* ------------------------------------------------------------------ *
 * Teams.
 * ------------------------------------------------------------------ */
describe("teams", () => {
  it("refuses a non-admin creating one", async () => {
    const a = await makeIntern();
    signInAs(a.person.id);
    expect((await call(adminTeamsRoute.POST, { method: "POST", body: { name: "Rogue" } })).status).toBe(403);
    expect(await db.team.count()).toBe(0);
  });

  it("refuses a duplicate name", async () => {
    const admin = await makePerson({ isAdmin: true });
    await makeTeam("Engineering");
    signInAs(admin.id);
    const result = await call(adminTeamsRoute.POST, { method: "POST", body: { name: "Engineering" } });
    expect(result.status).toBe(409);
  });
});

/* ------------------------------------------------------------------ *
 * CSV exports.
 * ------------------------------------------------------------------ */
describe("exports", () => {
  const routes = [
    ["people", exportPeopleRoute.GET],
    ["teams", exportTeamsRoute.GET],
    ["work-logs", exportWorkLogsRoute.GET],
    ["tasks", exportTasksRoute.GET],
  ] as const;

  it.each(routes)("refuses %s to somebody who is neither admin nor mentor", async (_name, handler) => {
    const a = await makeIntern();
    signInAs(a.person.id);
    const result = await call(handler);
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: "export_requires_mentor_or_admin" });
  });

  it("gives an admin every person", async () => {
    const admin = await makePerson({ isAdmin: true, fullName: "The Admin" });
    const a = await makeIntern({ fullName: "Person One" });
    const b = await makeIntern({ fullName: "Person Two" });

    signInAs(admin.id);
    const result = await call<{ raw: string }>(exportPeopleRoute.GET);
    expect(result.status).toBe(200);

    const csv = result.body.raw;
    expect(csv).toContain("Person One");
    expect(csv).toContain("Person Two");
    expect(csv).toContain(a.person.personId);
    expect(csv).toContain(b.person.personId);
  });

  it("gives a mentor their mentees and nobody else", async () => {
    const mentor = await makePerson({ fullName: "The Mentor" });
    const mentee = await makePerson({ fullName: "My Mentee" });
    await makeEngagement(mentee.id, { mentorId: mentor.id });
    const stranger = await makeIntern({ fullName: "Not My Business" });

    signInAs(mentor.id);
    const result = await call<{ raw: string }>(exportPeopleRoute.GET);
    expect(result.status).toBe(200);

    const csv = result.body.raw;
    expect(csv).toContain("My Mentee");
    expect(csv).not.toContain("Not My Business");
    expect(csv).not.toContain(stranger.person.personId);

    // Exactly one data row, and it is the mentee. The mentor's own record is
    // not in the file -- their name appears only as the mentee's mentor, which
    // is the column doing its job.
    const dataRows = csv.trimEnd().split("\r\n").slice(1);
    expect(dataRows).toHaveLength(1);

    const idColumn = dataRows.map((row) => row.split(",")[0]);
    expect(idColumn).toEqual([mentee.personId]);
    expect(idColumn).not.toContain(mentor.personId);
  });

  it("records every export on the append-only timeline", async () => {
    const admin = await makePerson({ isAdmin: true });
    signInAs(admin.id);

    await call(exportPeopleRoute.GET);
    await call(exportTasksRoute.GET);

    const events = await db.timelineEvent.findMany({
      where: { actorId: admin.id, eventType: "DATA_EXPORTED" },
    });
    expect(events).toHaveLength(2);
    expect(events.map((e) => (e.metadata as { dataset: string }).dataset).sort()).toEqual([
      "people", "tasks",
    ]);
  });

  it("exports a 01:30 IST work log under its IST date", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();

    // 01:30 IST on 4 Sep 2026 is 20:00 UTC on 3 Sep.
    await db.workLog.create({
      data: {
        personId: a.person.id,
        engagementId: a.engagement.id,
        workDate: new Date("2026-09-04T00:00:00.000Z"),
        summary: "Night work",
        status: "SUBMITTED",
        submittedAt: new Date("2026-09-03T20:00:00.000Z"),
      },
    });

    signInAs(admin.id);
    const result = await call<{ raw: string }>(exportWorkLogsRoute.GET, {
      query: { from: "2026-09-01", to: "2026-09-30" },
    });

    expect(result.body.raw).toContain("2026-09-04");
    expect(result.body.raw).not.toContain("2026-09-03");
  });

  it("neutralises a formula typed into a work log summary", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    await db.workLog.create({
      data: {
        personId: a.person.id,
        engagementId: a.engagement.id,
        workDate: new Date(`${istDateString()}T00:00:00.000Z`),
        summary: '=cmd|\' /C calc\'!A0',
        status: "SUBMITTED",
      },
    });

    signInAs(admin.id);
    const result = await call<{ raw: string }>(exportWorkLogsRoute.GET);
    expect(result.body.raw).toContain("'=cmd");
    expect(result.body.raw).not.toMatch(/,=cmd/);
  });
});
