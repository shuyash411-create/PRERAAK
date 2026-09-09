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
  assign,
  makeEngagement,
  makeIntern,
  makePerson,
  makeTask,
  makeWeeklyReport,
  makeWorkLog,
} from "./helpers/factories";
import { signInAs } from "./helpers/session";
import { call } from "./helpers/request";

import * as workLogReviewRoute from "@/app/api/work-logs/[id]/review/route";
import * as weeklyReportReviewRoute from "@/app/api/weekly-reports/[id]/review/route";
import * as taskAssignmentReviewRoute from "@/app/api/task-assignments/[id]/review/route";

beforeEach(async () => {
  await resetDatabase();
  signInAs(null);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("reviewing a work log", () => {
  it("lets a mentor comment on their mentee's submitted log", async () => {
    const mentor = await makePerson();
    const mentee = await makePerson();
    const engagement = await makeEngagement(mentee.id, { mentorId: mentor.id });
    const log = await makeWorkLog(mentee.id, engagement.id, { status: "SUBMITTED" });

    signInAs(mentor.id);
    const result = await call(workLogReviewRoute.POST, {
      method: "POST",
      params: { id: log.id },
      body: { mentorComment: "Nice progress this week." },
    });

    expect(result.status).toBe(200);

    const row = await db.workLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(row.mentorComment).toBe("Nice progress this week.");
    expect(row.reviewedById).toBe(mentor.id);
    expect(row.reviewedAt).not.toBeNull();

    const event = await db.timelineEvent.findFirstOrThrow({
      where: { personId: mentee.id, eventType: "WORK_LOG_REVIEWED" },
    });
    expect(event.actorId).toBe(mentor.id);
    expect(event.metadata).toMatchObject({ newComment: "Nice progress this week." });
  });

  it("lets an admin comment on anyone's submitted log", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const log = await makeWorkLog(a.person.id, a.engagement.id, { status: "SUBMITTED" });

    signInAs(admin.id);
    const result = await call(workLogReviewRoute.POST, {
      method: "POST",
      params: { id: log.id },
      body: { mentorComment: "Looks good." },
    });

    expect(result.status).toBe(200);
  });

  it("refuses a mentor commenting on somebody they do not mentor", async () => {
    const mentor = await makePerson();
    const stranger = await makeIntern();
    const log = await makeWorkLog(stranger.person.id, stranger.engagement.id, { status: "SUBMITTED" });

    signInAs(mentor.id);
    const result = await call(workLogReviewRoute.POST, {
      method: "POST",
      params: { id: log.id },
      body: { mentorComment: "Not mine to comment on." },
    });

    expect(result.status).toBe(403);
    const row = await db.workLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(row.mentorComment).toBeNull();
  });

  it("refuses reviewing a draft", async () => {
    const mentor = await makePerson();
    const mentee = await makePerson();
    const engagement = await makeEngagement(mentee.id, { mentorId: mentor.id });
    const log = await makeWorkLog(mentee.id, engagement.id, { status: "DRAFT" });

    signInAs(mentor.id);
    const result = await call(workLogReviewRoute.POST, {
      method: "POST",
      params: { id: log.id },
      body: { mentorComment: "Too soon." },
    });

    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: "cannot_review_a_draft" });
  });

  it("refuses the author reviewing their own submitted log", async () => {
    const a = await makeIntern();
    const log = await makeWorkLog(a.person.id, a.engagement.id, { status: "SUBMITTED" });

    signInAs(a.person.id);
    const result = await call(workLogReviewRoute.POST, {
      method: "POST",
      params: { id: log.id },
      body: { mentorComment: "Reviewing myself." },
    });

    expect(result.status).toBe(403);
  });

  it("refuses fields outside the review allowlist", async () => {
    const mentor = await makePerson();
    const mentee = await makePerson();
    const engagement = await makeEngagement(mentee.id, { mentorId: mentor.id });
    const log = await makeWorkLog(mentee.id, engagement.id, { status: "SUBMITTED" });

    signInAs(mentor.id);
    for (const body of [
      { mentorComment: "ok", reviewedById: mentor.id },
      { mentorComment: "ok", reviewedAt: new Date().toISOString() },
      { mentorComment: "ok", summary: "rewriting the author's words" },
      { mentorComment: "ok", status: "DRAFT" },
    ]) {
      const result = await call(workLogReviewRoute.POST, {
        method: "POST",
        params: { id: log.id },
        body,
      });
      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({ error: "field_not_writable" });
    }
  });

  it("is repeatable: a revision overwrites the live comment but both are on the timeline", async () => {
    const mentor = await makePerson();
    const mentee = await makePerson();
    const engagement = await makeEngagement(mentee.id, { mentorId: mentor.id });
    const log = await makeWorkLog(mentee.id, engagement.id, { status: "SUBMITTED" });

    signInAs(mentor.id);
    await call(workLogReviewRoute.POST, {
      method: "POST",
      params: { id: log.id },
      body: { mentorComment: "First pass." },
    });
    await call(workLogReviewRoute.POST, {
      method: "POST",
      params: { id: log.id },
      body: { mentorComment: "Revised after a second look." },
    });

    const row = await db.workLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(row.mentorComment).toBe("Revised after a second look.");

    const events = await db.timelineEvent.findMany({
      where: { personId: mentee.id, eventType: "WORK_LOG_REVIEWED" },
      orderBy: { occurredAt: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events[0].metadata).toMatchObject({ newComment: "First pass." });
    expect(events[1].metadata).toMatchObject({
      previousComment: "First pass.",
      newComment: "Revised after a second look.",
    });
  });

  it("never opens a hole in the author's own draft/self grant", async () => {
    // The pre-existing self-scope allowlist test stays true: an author still
    // cannot write mentorComment through their own draft grant, even though a
    // *different* grant (review) now can write it for somebody else.
    const a = await makeIntern();
    const log = await makeWorkLog(a.person.id, a.engagement.id, { status: "DRAFT" });

    signInAs(a.person.id);
    const result = await call(workLogReviewRoute.POST, {
      method: "POST",
      params: { id: log.id },
      body: { mentorComment: "Self-reviewing a draft." },
    });

    // Refused twice over: not the reviewer role, and not even submitted yet.
    expect(result.status).toBe(403);
  });
});

describe("reviewing a weekly report", () => {
  it("lets a mentor comment on a submitted report", async () => {
    const mentor = await makePerson();
    const mentee = await makePerson();
    const engagement = await makeEngagement(mentee.id, { mentorId: mentor.id });
    const report = await makeWeeklyReport(mentee.id, engagement.id, { status: "SUBMITTED" });

    signInAs(mentor.id);
    const result = await call(weeklyReportReviewRoute.POST, {
      method: "POST",
      params: { id: report.id },
      body: { mentorComment: "Solid week." },
    });

    expect(result.status).toBe(200);
    const row = await db.weeklyReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(row.mentorComment).toBe("Solid week.");
  });

  it("refuses a non-mentee's report and a draft report alike", async () => {
    const mentor = await makePerson();
    const stranger = await makeIntern();
    const submitted = await makeWeeklyReport(stranger.person.id, stranger.engagement.id, {
      status: "SUBMITTED",
    });

    const mentee = await makePerson();
    const engagement = await makeEngagement(mentee.id, { mentorId: mentor.id });
    const draft = await makeWeeklyReport(mentee.id, engagement.id, { status: "DRAFT" });

    signInAs(mentor.id);
    expect(
      (
        await call(weeklyReportReviewRoute.POST, {
          method: "POST",
          params: { id: submitted.id },
          body: { mentorComment: "x" },
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await call(weeklyReportReviewRoute.POST, {
          method: "POST",
          params: { id: draft.id },
          body: { mentorComment: "x" },
        })
      ).status,
    ).toBe(403);
  });
});

describe("reviewing a task submission", () => {
  it("lets a mentor comment on a mentee's submitted assignment", async () => {
    const admin = await makePerson({ isAdmin: true });
    const mentor = await makePerson();
    const mentee = await makePerson();
    await makeEngagement(mentee.id, { mentorId: mentor.id });
    const task = await makeTask(admin.id);
    const assignment = await assign(task.id, mentee.id, admin.id, { status: "SUBMITTED" });

    signInAs(mentor.id);
    const result = await call(taskAssignmentReviewRoute.POST, {
      method: "POST",
      params: { id: assignment.id },
      body: { mentorComment: "Good work." },
    });

    expect(result.status).toBe(200);
    const row = await db.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(row.mentorComment).toBe("Good work.");

    const event = await db.timelineEvent.findFirstOrThrow({
      where: { personId: mentee.id, eventType: "TASK_REVIEWED" },
    });
    expect(event.actorId).toBe(mentor.id);
  });

  it("refuses the assignee reviewing their own assignment", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const task = await makeTask(admin.id);
    const assignment = await assign(task.id, a.person.id, admin.id, { status: "SUBMITTED" });

    signInAs(a.person.id);
    const result = await call(taskAssignmentReviewRoute.POST, {
      method: "POST",
      params: { id: assignment.id },
      body: { mentorComment: "Reviewing myself." },
    });

    expect(result.status).toBe(403);
  });

  it("refuses reviewing an assignment that has not been submitted", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const task = await makeTask(admin.id);
    const assignment = await assign(task.id, a.person.id, admin.id, { status: "ASSIGNED" });

    signInAs(admin.id);
    const result = await call(taskAssignmentReviewRoute.POST, {
      method: "POST",
      params: { id: assignment.id },
      body: { mentorComment: "Too soon." },
    });

    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: "cannot_review_a_draft" });
  });
});

describe("unauthenticated", () => {
  it("refuses all three review routes with no session", async () => {
    for (const handler of [
      workLogReviewRoute.POST,
      weeklyReportReviewRoute.POST,
      taskAssignmentReviewRoute.POST,
    ]) {
      const result = await call(handler, {
        method: "POST",
        params: { id: "does-not-exist" },
        body: { mentorComment: "x" },
      });
      expect(result.status).toBe(401);
    }
  });
});
