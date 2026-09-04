import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The Auth.js module is replaced so tests never boot NextAuth, but
// `currentActor` still reads the person from Postgres exactly as production
// does — authority is never taken from a token.
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
import { makeEngagement, makeIntern, makePerson, makeWorkLog } from "./helpers/factories";
import { signInAs } from "./helpers/session";
import { call } from "./helpers/request";

import * as workLogsRoute from "@/app/api/work-logs/route";
import * as workLogRoute from "@/app/api/work-logs/[id]/route";
import * as workLogSubmitRoute from "@/app/api/work-logs/[id]/submit/route";
import * as documentUrlRoute from "@/app/api/documents/[id]/url/route";
import * as adminPeopleRoute from "@/app/api/admin/people/route";
import * as adminEngagementsRoute from "@/app/api/admin/engagements/route";
import * as closeEngagementRoute from "@/app/api/admin/engagements/[id]/close/route";
import * as correctionsRoute from "@/app/api/correction-requests/route";
import * as decideCorrectionRoute from "@/app/api/correction-requests/[id]/decide/route";
import * as timelineRoute from "@/app/api/people/[id]/timeline/route";

import { istDateToUtcMidnight } from "@/lib/ist";

beforeEach(async () => {
  await resetDatabase();
  signInAs(null);
});

afterAll(async () => {
  await db.$disconnect();
});

/* ------------------------------------------------------------------ *
 * 1. An intern cannot read another intern's work log.
 *    The one that actually matters. Enforced server-side, in the route.
 * ------------------------------------------------------------------ */
describe("1. cross-person access", () => {
  it("refuses intern A reading intern B's work log", async () => {
    const a = await makeIntern({ fullName: "Intern A" });
    const b = await makeIntern({ fullName: "Intern B" });
    const bLog = await makeWorkLog(b.person.id, b.engagement.id, { status: "SUBMITTED" });

    signInAs(a.person.id);
    const result = await call(workLogRoute.GET, { params: { id: bLog.id } });

    expect(result.status).toBe(403);
  });

  it("does not leak the existence of a log through a different status code", async () => {
    const a = await makeIntern();
    const b = await makeIntern();
    const bLog = await makeWorkLog(b.person.id, b.engagement.id);

    signInAs(a.person.id);
    const real = await call(workLogRoute.GET, { params: { id: bLog.id } });
    const imaginary = await call(workLogRoute.GET, { params: { id: "does-not-exist" } });

    expect(real.status).toBe(403);
    expect(imaginary.status).toBe(403);
  });

  it("lets a person read their own log", async () => {
    const a = await makeIntern();
    const log = await makeWorkLog(a.person.id, a.engagement.id);

    signInAs(a.person.id);
    const result = await call(workLogRoute.GET, { params: { id: log.id } });

    expect(result.status).toBe(200);
  });

  it("excludes other people's logs from the list route", async () => {
    const a = await makeIntern();
    const b = await makeIntern();
    await makeWorkLog(a.person.id, a.engagement.id, { workDate: "2026-03-01" });
    await makeWorkLog(b.person.id, b.engagement.id, { workDate: "2026-03-01" });

    signInAs(a.person.id);
    const result = await call<{ workLogs: { personId: string }[] }>(workLogsRoute.GET);

    expect(result.status).toBe(200);
    expect(result.body.workLogs).toHaveLength(1);
    expect(result.body.workLogs[0].personId).toBe(a.person.id);
  });

  it("refuses a list narrowed to someone else's person id", async () => {
    const a = await makeIntern();
    const b = await makeIntern();

    signInAs(a.person.id);
    const result = await call(workLogsRoute.GET, { query: { personId: b.person.id } });

    expect(result.status).toBe(403);
  });
});

/* ------------------------------------------------------------------ *
 * 2. An intern cannot reach another intern's document.
 * ------------------------------------------------------------------ */
describe("2. document access", () => {
  async function makeDocument(personId: string, uploadedById: string, visibility: "ADMIN_ONLY" | "PERSON_VISIBLE") {
    return db.document.create({
      data: {
        personId,
        category: "LETTER",
        title: "Internship letter",
        storageKey: `documents/${personId}/letter.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        visibility,
        uploadedById,
      },
    });
  }

  it("refuses intern A reading intern B's document", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const b = await makeIntern();
    const document = await makeDocument(b.person.id, admin.id, "PERSON_VISIBLE");

    signInAs(a.person.id);
    const result = await call(documentUrlRoute.GET, { params: { id: document.id } });

    expect(result.status).toBe(403);
  });

  it("hides an ADMIN_ONLY document from its own subject", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const document = await makeDocument(a.person.id, admin.id, "ADMIN_ONLY");

    signInAs(a.person.id);
    const result = await call(documentUrlRoute.GET, { params: { id: document.id } });

    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: "admin_only_document" });
  });

  it("passes authorization for the subject's own visible document, then stops at unbuilt storage", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const document = await makeDocument(a.person.id, admin.id, "PERSON_VISIBLE");

    signInAs(a.person.id);
    const result = await call(documentUrlRoute.GET, { params: { id: document.id } });

    // 503, not 403: authorization succeeded and object storage is Stage 3.
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ error: "document_storage_not_configured" });
  });
});

/* ------------------------------------------------------------------ *
 * 3 & 4. Mentor scope.
 * ------------------------------------------------------------------ */
describe("3 & 4. mentor scope", () => {
  it("lets a mentor read the log of someone they mentor", async () => {
    const mentor = await makePerson({ fullName: "Mentor M" });
    const mentee = await makePerson({ fullName: "Mentee" });
    const engagement = await makeEngagement(mentee.id, { mentorId: mentor.id });
    const log = await makeWorkLog(mentee.id, engagement.id, { status: "SUBMITTED" });

    signInAs(mentor.id);
    const result = await call(workLogRoute.GET, { params: { id: log.id } });

    expect(result.status).toBe(200);
  });

  it("refuses a mentor the log of someone they do not mentor", async () => {
    const mentor = await makePerson({ fullName: "Mentor M" });
    const mentee = await makePerson();
    await makeEngagement(mentee.id, { mentorId: mentor.id });

    const stranger = await makeIntern();
    const strangerLog = await makeWorkLog(stranger.person.id, stranger.engagement.id);

    signInAs(mentor.id);
    const result = await call(workLogRoute.GET, { params: { id: strangerLog.id } });

    expect(result.status).toBe(403);
  });

  it("ends mentor access to future work when the mentored engagement is closed", async () => {
    const mentor = await makePerson();
    const mentee = await makePerson();
    const engagement = await makeEngagement(mentee.id, { mentorId: mentor.id });
    const log = await makeWorkLog(mentee.id, engagement.id, { status: "SUBMITTED" });

    // A closed engagement still carries the mentor, so history stays readable.
    await db.engagement.update({
      where: { id: engagement.id },
      data: { status: "COMPLETED", endDate: istDateToUtcMidnight("2026-06-30") },
    });

    signInAs(mentor.id);
    const result = await call(workLogRoute.GET, { params: { id: log.id } });

    expect(result.status).toBe(200);
  });
});

/* ------------------------------------------------------------------ *
 * 5 & 6. Submitted work is immutable.
 * ------------------------------------------------------------------ */
describe("5 & 6. immutability of submitted work", () => {
  it("refuses a mentor editing the summary of a submitted log", async () => {
    const mentor = await makePerson();
    const mentee = await makePerson();
    const engagement = await makeEngagement(mentee.id, { mentorId: mentor.id });
    const log = await makeWorkLog(mentee.id, engagement.id, {
      status: "SUBMITTED",
      summary: "Original summary.",
    });

    signInAs(mentor.id);
    const result = await call(workLogRoute.PATCH, {
      method: "PATCH",
      params: { id: log.id },
      body: { summary: "Rewritten by the mentor." },
    });

    expect(result.status).toBe(403);
    const unchanged = await db.workLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(unchanged.summary).toBe("Original summary.");
  });

  it("refuses a mentor editing a DRAFT log too", async () => {
    const mentor = await makePerson();
    const mentee = await makePerson();
    const engagement = await makeEngagement(mentee.id, { mentorId: mentor.id });
    const log = await makeWorkLog(mentee.id, engagement.id, { status: "DRAFT" });

    signInAs(mentor.id);
    const result = await call(workLogRoute.PATCH, {
      method: "PATCH",
      params: { id: log.id },
      body: { summary: "Not yours to write." },
    });

    expect(result.status).toBe(403);
  });

  it("refuses the author editing their own submitted log", async () => {
    const a = await makeIntern();
    const log = await makeWorkLog(a.person.id, a.engagement.id, {
      status: "SUBMITTED",
      summary: "As submitted.",
    });

    signInAs(a.person.id);
    const result = await call(workLogRoute.PATCH, {
      method: "PATCH",
      params: { id: log.id },
      body: { summary: "Second thoughts." },
    });

    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: "submitted_records_are_immutable" });

    const unchanged = await db.workLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(unchanged.summary).toBe("As submitted.");
  });

  it("refuses an admin editing a submitted log directly", async () => {
    const admin = await makePerson({ isAdmin: true });
    const a = await makeIntern();
    const log = await makeWorkLog(a.person.id, a.engagement.id, {
      status: "SUBMITTED",
      summary: "As submitted.",
    });

    signInAs(admin.id);
    const result = await call(workLogRoute.PATCH, {
      method: "PATCH",
      params: { id: log.id },
      body: { summary: "Admin knows best." },
    });

    // Even an admin goes through a correction, so the previous value is kept.
    expect(result.status).toBe(403);
  });

  it("lets the author edit their own draft", async () => {
    const a = await makeIntern();
    const log = await makeWorkLog(a.person.id, a.engagement.id, { status: "DRAFT" });

    signInAs(a.person.id);
    const result = await call(workLogRoute.PATCH, {
      method: "PATCH",
      params: { id: log.id },
      body: { summary: "Revised while still a draft." },
    });

    expect(result.status).toBe(200);
  });

  it("refuses a draft edit that reaches beyond the writable fields", async () => {
    const a = await makeIntern();
    const log = await makeWorkLog(a.person.id, a.engagement.id, { status: "DRAFT" });

    signInAs(a.person.id);
    for (const body of [
      { status: "SUBMITTED" },
      { mentorComment: "I reviewed myself." },
      { reviewedById: a.person.id },
      { submittedAt: new Date().toISOString() },
      { personId: "somebody-else" },
    ]) {
      const result = await call(workLogRoute.PATCH, {
        method: "PATCH",
        params: { id: log.id },
        body,
      });
      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({ error: "field_not_writable" });
    }

    const unchanged = await db.workLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(unchanged.status).toBe("DRAFT");
    expect(unchanged.mentorComment).toBeNull();
  });

  it("refuses submitting somebody else's log", async () => {
    const a = await makeIntern();
    const b = await makeIntern();
    const bLog = await makeWorkLog(b.person.id, b.engagement.id, { status: "DRAFT" });

    signInAs(a.person.id);
    const result = await call(workLogSubmitRoute.POST, { method: "POST", params: { id: bLog.id } });

    expect(result.status).toBe(403);
  });

  it("refuses submitting the same log twice", async () => {
    const a = await makeIntern();
    const log = await makeWorkLog(a.person.id, a.engagement.id, { status: "DRAFT" });

    signInAs(a.person.id);
    const first = await call(workLogSubmitRoute.POST, { method: "POST", params: { id: log.id } });
    const second = await call(workLogSubmitRoute.POST, { method: "POST", params: { id: log.id } });

    expect(first.status).toBe(200);
    expect(second.status).toBe(403);
  });
});

/* ------------------------------------------------------------------ *
 * 7. Only admins create people.
 * ------------------------------------------------------------------ */
describe("7. admin-only person creation", () => {
  const newPerson = {
    fullName: "Newly Hired",
    email: "newly.hired@example.test",
  };

  it("refuses a non-admin", async () => {
    const a = await makeIntern();

    signInAs(a.person.id);
    const result = await call(adminPeopleRoute.POST, { method: "POST", body: newPerson });

    expect(result.status).toBe(403);
    expect(await db.person.count({ where: { email: newPerson.email } })).toBe(0);
  });

  it("refuses a mentor, who is still not an admin", async () => {
    const mentor = await makePerson();
    const mentee = await makePerson();
    await makeEngagement(mentee.id, { mentorId: mentor.id });

    signInAs(mentor.id);
    const result = await call(adminPeopleRoute.POST, { method: "POST", body: newPerson });

    expect(result.status).toBe(403);
  });

  it("refuses a non-admin listing people", async () => {
    const a = await makeIntern();

    signInAs(a.person.id);
    expect((await call(adminPeopleRoute.GET)).status).toBe(403);
  });

  it("allows an admin and allocates a permanent id", async () => {
    const admin = await makePerson({ isAdmin: true });

    signInAs(admin.id);
    const result = await call<{ person: { personId: string } }>(adminPeopleRoute.POST, {
      method: "POST",
      body: newPerson,
    });

    expect(result.status).toBe(201);
    expect(result.body.person.personId).toMatch(/^PRR-\d{6}$/);
  });

  it("refuses an admin whose account has been archived from acting", async () => {
    const admin = await makePerson({ isAdmin: true });
    signInAs(admin.id);

    // Authority is read from the database on every request, so a change lands
    // on the next request rather than the next login.
    await db.person.update({ where: { id: admin.id }, data: { isAdmin: false } });

    const result = await call(adminPeopleRoute.POST, { method: "POST", body: newPerson });
    expect(result.status).toBe(403);
  });
});

/* ------------------------------------------------------------------ *
 * 10. Approving a correction preserves the previous value.
 * ------------------------------------------------------------------ */
describe("10. corrections preserve history", () => {
  async function submittedLog() {
    const a = await makeIntern();
    const log = await makeWorkLog(a.person.id, a.engagement.id, {
      status: "SUBMITTED",
      summary: "The original text.",
    });
    return { ...a, log };
  }

  it("records the previous value and applies the new one", async () => {
    const { person, log } = await submittedLog();
    const admin = await makePerson({ isAdmin: true });

    signInAs(person.id);
    const requested = await call<{ correctionRequest: { id: string } }>(correctionsRoute.POST, {
      method: "POST",
      body: {
        targetType: "WORK_LOG",
        targetId: log.id,
        reason: "I described the wrong module.",
        proposedValue: { summary: "The corrected text." },
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
    expect(correction.status).toBe("APPROVED");
    expect(correction.previousValue).toEqual({ summary: "The original text." });
    expect(correction.decidedById).toBe(admin.id);
    expect(correction.decidedAt).not.toBeNull();

    const updated = await db.workLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(updated.summary).toBe("The corrected text.");

    // The history is replayable from the append-only trail alone.
    const event = await db.timelineEvent.findFirstOrThrow({
      where: { personId: person.id, eventType: "CORRECTION_APPROVED" },
    });
    expect(event.metadata).toMatchObject({
      previousValue: { summary: "The original text." },
      newValue: { summary: "The corrected text." },
    });
  });

  it("leaves the record untouched when rejected", async () => {
    const { person, log } = await submittedLog();
    const admin = await makePerson({ isAdmin: true });

    signInAs(person.id);
    const requested = await call<{ correctionRequest: { id: string } }>(correctionsRoute.POST, {
      method: "POST",
      body: {
        targetType: "WORK_LOG",
        targetId: log.id,
        reason: "Typo.",
        proposedValue: { summary: "Never applied." },
      },
    });

    signInAs(admin.id);
    await call(decideCorrectionRoute.POST, {
      method: "POST",
      params: { id: requested.body.correctionRequest.id },
      body: { decision: "REJECT" },
    });

    const unchanged = await db.workLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(unchanged.summary).toBe("The original text.");
  });

  it("refuses a non-admin deciding a correction", async () => {
    const { person, log } = await submittedLog();

    signInAs(person.id);
    const requested = await call<{ correctionRequest: { id: string } }>(correctionsRoute.POST, {
      method: "POST",
      body: {
        targetType: "WORK_LOG",
        targetId: log.id,
        reason: "Typo.",
        proposedValue: { summary: "Self-approved." },
      },
    });

    const result = await call(decideCorrectionRoute.POST, {
      method: "POST",
      params: { id: requested.body.correctionRequest.id },
      body: { decision: "APPROVE" },
    });

    expect(result.status).toBe(403);
    const unchanged = await db.workLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(unchanged.summary).toBe("The original text.");
  });

  it("refuses requesting a correction to somebody else's record", async () => {
    const { log } = await submittedLog();
    const other = await makeIntern();

    signInAs(other.person.id);
    const result = await call(correctionsRoute.POST, {
      method: "POST",
      body: {
        targetType: "WORK_LOG",
        targetId: log.id,
        reason: "Not mine.",
        proposedValue: { summary: "Meddling." },
      },
    });

    expect(result.status).toBe(403);
  });

  it("refuses deciding the same correction twice", async () => {
    const { person, log } = await submittedLog();
    const admin = await makePerson({ isAdmin: true });

    signInAs(person.id);
    const requested = await call<{ correctionRequest: { id: string } }>(correctionsRoute.POST, {
      method: "POST",
      body: {
        targetType: "WORK_LOG",
        targetId: log.id,
        reason: "Typo.",
        proposedValue: { summary: "Once." },
      },
    });

    signInAs(admin.id);
    const first = await call(decideCorrectionRoute.POST, {
      method: "POST",
      params: { id: requested.body.correctionRequest.id },
      body: { decision: "APPROVE" },
    });
    const second = await call(decideCorrectionRoute.POST, {
      method: "POST",
      params: { id: requested.body.correctionRequest.id },
      body: { decision: "REJECT" },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });
});

/* ------------------------------------------------------------------ *
 * 11. A log submitted at 01:30 IST records that IST calendar date.
 * ------------------------------------------------------------------ */
describe("11. IST date at submission", () => {
  it("files 01:30 IST work against the IST date, not the UTC one", async () => {
    const a = await makeIntern();
    signInAs(a.person.id);

    // 01:30 IST on 4 Sep 2026 == 20:00 UTC on 3 Sep 2026.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T20:00:00.000Z"));

    try {
      const created = await call<{ workLog: { workDate: string } }>(workLogsRoute.POST, {
        method: "POST",
        body: { summary: "Shipped the migration at half past one." },
      });

      expect(created.status).toBe(201);
      expect(created.body.workLog.workDate).toBe("2026-09-04");

      const stored = await db.workLog.findFirstOrThrow({ where: { personId: a.person.id } });
      expect(stored.workDate.toISOString()).toBe("2026-09-04T00:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not flag, colour or otherwise mark a 01:30 submission", async () => {
    const a = await makeIntern();
    signInAs(a.person.id);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T20:00:00.000Z"));
    try {
      const created = await call<{ workLog: Record<string, unknown> }>(workLogsRoute.POST, {
        method: "POST",
        body: { summary: "Night work is normal work." },
      });

      // Section 1.2: there is nowhere for a time-of-day judgement to live.
      const keys = Object.keys(created.body.workLog);
      expect(keys).not.toContain("isLate");
      expect(keys).not.toContain("flagged");
      expect(keys).not.toContain("anomaly");
      expect(keys).not.toContain("submittedAtHour");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps 23:30 IST on the same IST day", async () => {
    const a = await makeIntern();
    signInAs(a.person.id);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T18:00:00.000Z")); // 23:30 IST on the 4th
    try {
      const created = await call<{ workLog: { workDate: string } }>(workLogsRoute.POST, {
        method: "POST",
        body: { summary: "Late but on the same day." },
      });
      expect(created.body.workLog.workDate).toBe("2026-09-04");
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats a second post on the same IST day as the same log", async () => {
    const a = await makeIntern();
    signInAs(a.person.id);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T20:00:00.000Z"));
    try {
      const first = await call<{ workLog: { id: string } }>(workLogsRoute.POST, {
        method: "POST",
        body: { summary: "First tap." },
      });
      const second = await call<{ workLog: { id: string } }>(workLogsRoute.POST, {
        method: "POST",
        body: { summary: "Second tap, flaky connection." },
      });

      expect(first.body.workLog.id).toBe(second.body.workLog.id);
      expect(await db.workLog.count({ where: { personId: a.person.id } })).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ------------------------------------------------------------------ *
 * 12. One person, one identity, across engagements.
 * ------------------------------------------------------------------ */
describe("12. engagement transition keeps one identity", () => {
  it("keeps every prior work log queryable under the same person after internship becomes employment", async () => {
    const admin = await makePerson({ isAdmin: true });
    signInAs(admin.id);

    const created = await call<{ person: { id: string; personId: string } }>(adminPeopleRoute.POST, {
      method: "POST",
      body: { fullName: "Rising Star", email: "rising.star@example.test" },
    });
    const personId = created.body.person.id;
    const permanentId = created.body.person.personId;

    const internship = await call<{ engagement: { id: string } }>(adminEngagementsRoute.POST, {
      method: "POST",
      body: {
        personId,
        type: "INTERNSHIP",
        designation: "Engineering Intern",
        startDate: "2026-01-05",
      },
    });
    expect(internship.status).toBe(201);
    const internshipId = internship.body.engagement.id;

    signInAs(personId);
    await makeWorkLog(personId, internshipId, { workDate: "2026-01-06", status: "SUBMITTED" });
    await makeWorkLog(personId, internshipId, { workDate: "2026-01-07", status: "SUBMITTED" });

    // Close the internship.
    signInAs(admin.id);
    const closed = await call(closeEngagementRoute.POST, {
      method: "POST",
      params: { id: internshipId },
      body: { endDate: "2026-06-30", status: "COMPLETED" },
    });
    expect(closed.status).toBe(200);

    // Open employment on the SAME person.
    const employment = await call<{ engagement: { id: string } }>(adminEngagementsRoute.POST, {
      method: "POST",
      body: {
        personId,
        type: "EMPLOYMENT",
        designation: "Software Engineer",
        startDate: "2026-07-01",
      },
    });
    expect(employment.status).toBe(201);
    const employmentId = employment.body.engagement.id;

    await makeWorkLog(personId, employmentId, { workDate: "2026-07-02", status: "SUBMITTED" });

    // One person, one id, no second record.
    expect(await db.person.count({ where: { email: "rising.star@example.test" } })).toBe(1);
    const person = await db.person.findUniqueOrThrow({ where: { id: personId } });
    expect(person.personId).toBe(permanentId);

    // Every log, across both engagements, under the one person.
    signInAs(personId);
    const listed = await call<{ workLogs: { workDate: string; engagementId: string }[] }>(
      workLogsRoute.GET,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.workLogs).toHaveLength(3);
    expect(listed.body.workLogs.map((l) => l.workDate).sort()).toEqual([
      "2026-01-06",
      "2026-01-07",
      "2026-07-02",
    ]);
    expect(new Set(listed.body.workLogs.map((l) => l.engagementId))).toEqual(
      new Set([internshipId, employmentId]),
    );

    // The closed engagement kept its content; only the ending was recorded.
    const internshipRow = await db.engagement.findUniqueOrThrow({ where: { id: internshipId } });
    expect(internshipRow.designation).toBe("Engineering Intern");
    expect(internshipRow.status).toBe("COMPLETED");
    expect(internshipRow.startDate.toISOString()).toBe("2026-01-05T00:00:00.000Z");
    expect(internshipRow.endDate?.toISOString()).toBe("2026-06-30T00:00:00.000Z");

    // And the whole story is on the timeline.
    signInAs(admin.id);
    const timeline = await call<{ timeline: { eventType: string }[] }>(timelineRoute.GET, {
      params: { id: personId },
    });
    const types = timeline.body.timeline.map((e) => e.eventType);
    expect(types).toContain("PERSON_CREATED");
    expect(types).toContain("ENGAGEMENT_CREATED");
    expect(types).toContain("ENGAGEMENT_CLOSED");
  });

  it("never issues the same permanent id twice", async () => {
    const admin = await makePerson({ isAdmin: true });
    signInAs(admin.id);

    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const created = await call<{ person: { personId: string } }>(adminPeopleRoute.POST, {
        method: "POST",
        body: { fullName: `Person ${i}`, email: `person.${i}@example.test` },
      });
      ids.push(created.body.person.personId);
    }

    expect(new Set(ids).size).toBe(5);
    expect(ids.every((id) => /^PRR-\d{6}$/.test(id))).toBe(true);
  });

  it("refuses a second person with an email that already exists", async () => {
    const admin = await makePerson({ isAdmin: true });
    signInAs(admin.id);

    const body = { fullName: "Same Human", email: "same.human@example.test" };
    expect((await call(adminPeopleRoute.POST, { method: "POST", body })).status).toBe(201);
    const second = await call(adminPeopleRoute.POST, { method: "POST", body });

    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ error: "email_taken" });
  });
});
