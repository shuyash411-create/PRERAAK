import type { CorrectionTarget, PersonStatus } from "@prisma/client";
import { prisma, type Db } from "@/lib/prisma";

/**
 * The one place any access decision is made.
 *
 * Every API route and server action calls `authorize` before touching data.
 * No route decides for itself, and nothing in a React component is ever the
 * enforcement point — hiding a button is not authorization.
 *
 * There are exactly three scopes and no roles table. At ten people, rising to
 * fifty, a boolean plus a mentor lookup is the correct engineering choice; a
 * permission matrix would be more code, more surface, and no more secure.
 *
 *   SELF    a person may read their own records, and write them while DRAFT
 *   MENTOR  a person may read the records of anyone they mentor
 *   ADMIN   people.is_admin = true — full read and write
 *
 * Denials are thrown, never returned. A caller cannot forget to check a
 * boolean it never receives.
 */

export type Scope = "SELF" | "MENTOR" | "ADMIN";

export type Action = "read" | "create" | "update" | "submit" | "review" | "decide" | "export";

export type Actor = {
  /** Internal row id. */
  id: string;
  /** Permanent public identity, PRR-000001. */
  personId: string;
  isAdmin: boolean;
  status: PersonStatus;
};

export type Resource =
  /** The actor's own record, whoever that turns out to be. */
  | { kind: "self" }
  | { kind: "person"; id: string }
  | { kind: "engagement"; id: string }
  | { kind: "work_log"; id: string }
  | { kind: "work_log_draft"; ownerId: string }
  | { kind: "weekly_report"; id: string }
  | { kind: "weekly_report_draft"; ownerId: string }
  | { kind: "correction"; id: string }
  | { kind: "correction_new"; targetType: CorrectionTarget; targetId: string }
  | { kind: "document"; id: string }
  | { kind: "timeline"; personId: string }
  | { kind: "team"; id: string }
  | { kind: "task"; id: string }
  | { kind: "task_assignment"; id: string }
  | { kind: "onboarding"; personId: string }
  | { kind: "export"; dataset: ExportDataset }
  | { kind: "admin" };

export type ExportDataset = "people" | "teams" | "work-logs" | "tasks";

export type Grant = {
  scope: Scope;
  /** The person whose records this grant is over. */
  subjectId: string;
  /**
   * Fields this grant may write. An empty list means read-only, which is what
   * a submitted record returns to its own author — permanently.
   *
   * Every PATCH handler intersects the request body against this list and
   * rejects anything outside it, so a field is never writable by accident.
   */
  writableFields: readonly string[];
};

export class AuthzError extends Error {
  constructor(
    readonly status: 401 | 403 | 404,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AuthzError";
  }
}

const unauthenticated = () => new AuthzError(401, "unauthenticated", "Sign in to continue.");

/**
 * Denial messages say what happened and what to do instead, without revealing
 * anything about records the reader cannot see. "That record is not yours" is
 * safe; "no such log" would confirm which ids exist.
 */
const DENIAL_MESSAGES: Record<string, string> = {
  forbidden: "You do not have access to this record.",
  not_found: "You do not have access to this record.",
  admin_only: "Only an admin can do that.",
  admin_only_document: "Only an admin can open that document.",
  account_archived: "This account has been archived. Ask an admin if you need access again.",
  not_the_author: "Only the person who wrote this can change it.",
  authorship_is_personal: "You can only file work under your own name.",
  submitted_records_are_immutable:
    "Submitted work cannot be edited. Request a correction and an admin will review it.",
  draft_records_are_edited_directly: "This is still a draft — edit it directly instead.",
  timeline_is_append_only: "History cannot be changed.",
  not_available_in_stage_1: "That is not available yet.",
  uploads_are_stage_3: "Document uploads are not available yet.",
  field_not_writable: "Those fields cannot be changed here.",
};

const forbidden = (code = "forbidden") =>
  new AuthzError(403, code, DENIAL_MESSAGES[code] ?? DENIAL_MESSAGES.forbidden);

/**
 * Content fields an author may edit while a submission is still a DRAFT.
 * Nothing about review, status or timestamps appears here: those are set by
 * the server, never by a request body.
 */
export const WORK_LOG_DRAFT_FIELDS = [
  "workDate",
  "summary",
  "workCompleted",
  "blockers",
  "nextStep",
  "links",
] as const;

export const WEEKLY_REPORT_DRAFT_FIELDS = [
  "workCompleted",
  "deliverables",
  "challenges",
  "learning",
  "nextWeekPlan",
] as const;

export const PERSON_ADMIN_FIELDS = [
  "fullName",
  "preferredName",
  "email",
  "phone",
  "college",
  "course",
  "graduationYear",
  "isAdmin",
] as const;

/**
 * What a person may change about themselves.
 *
 * `email` is absent deliberately: it is the login identity, and a person who
 * can change it can redirect their own sign-in links. `isAdmin`, `status` and
 * `personId` are absent for the obvious reasons. Everything here is a detail
 * only the person themselves reliably knows.
 */
export const PERSON_SELF_FIELDS = [
  "preferredName",
  "phone",
  "college",
  "course",
  "graduationYear",
] as const;

/** What an assignee may write on their own task submission, before submitting. */
export const TASK_SUBMISSION_FIELDS = ["submissionNote", "links"] as const;

export const TEAM_ADMIN_FIELDS = ["name", "leadId", "isActive"] as const;

export const TASK_ADMIN_FIELDS = [
  "title",
  "description",
  "teamId",
  "dueDate",
  "priority",
  "status",
] as const;

/**
 * What a person may put in their onboarding submission. Team and designation
 * are *requested* here, not set: an admin confirms them, because they are what
 * progress is grouped and reported by.
 */
export const ONBOARDING_FIELDS = [
  "requestedTeamId",
  "requestedDesignation",
  "requestedType",
  "proposedStartDate",
  "preferredName",
  "phone",
  "college",
  "course",
  "graduationYear",
] as const;

/**
 * Who owns the record a correction is aimed at, and whether it has been
 * submitted. All three correctable kinds answer the same two questions, so the
 * lookup is one function rather than a branch at every call site.
 */
async function correctionTargetOwner(
  db: Db,
  targetType: CorrectionTarget,
  targetId: string,
): Promise<{ personId: string; status: string } | null> {
  switch (targetType) {
    case "WORK_LOG":
      return db.workLog.findUnique({
        where: { id: targetId },
        select: { personId: true, status: true },
      });
    case "WEEKLY_REPORT":
      return db.weeklyReport.findUnique({
        where: { id: targetId },
        select: { personId: true, status: true },
      });
    case "TASK_ASSIGNMENT":
      return db.taskAssignment.findUnique({
        where: { id: targetId },
        select: { personId: true, status: true },
      });
  }
}

/** Is `actorId` the mentor on any engagement of `subjectId`? */
async function mentorsPerson(db: Db, actorId: string, subjectId: string): Promise<boolean> {
  const count = await db.engagement.count({
    where: { personId: subjectId, mentorId: actorId },
  });
  return count > 0;
}

/**
 * Resolve the scope an actor holds over a subject, most privileged first.
 * Throws if the actor holds none.
 */
async function scopeOver(db: Db, actor: Actor, subjectId: string): Promise<Scope> {
  if (actor.isAdmin) return "ADMIN";
  if (actor.id === subjectId) return "SELF";
  if (await mentorsPerson(db, actor.id, subjectId)) return "MENTOR";
  throw forbidden();
}

/**
 * Decide whether `actor` may perform `action` on `resource`.
 *
 * Throws AuthzError(401) when there is no actor and AuthzError(403) when there
 * is one without the necessary scope. Returns a Grant naming the scope and the
 * exact fields the caller may write.
 *
 * A missing record is reported as 403, not 404: whether a given id exists is
 * itself information a stranger should not be able to probe for.
 */
export async function authorize(
  actor: Actor | null,
  action: Action,
  resource: Resource,
  db: Db = prisma,
): Promise<Grant> {
  if (!actor) throw unauthenticated();

  // An archived person keeps their history but loses access to the system.
  // Admins are exempt so an archived admin cannot lock everyone out by
  // archiving themselves.
  if (actor.status === "ARCHIVED" && !actor.isAdmin) throw forbidden("account_archived");

  switch (resource.kind) {
    case "self": {
      if (action !== "read") throw forbidden();
      return { scope: "SELF", subjectId: actor.id, writableFields: [] };
    }

    case "admin": {
      if (!actor.isAdmin) throw forbidden("admin_only");
      return { scope: "ADMIN", subjectId: actor.id, writableFields: PERSON_ADMIN_FIELDS };
    }

    case "person": {
      const scope = await scopeOver(db, actor, resource.id);

      // A person maintains their own contact and study details; an admin
      // maintains everything. A mentor reads and writes nothing here.
      if (action !== "read" && scope === "MENTOR") throw forbidden();

      const writableFields =
        scope === "ADMIN" ? PERSON_ADMIN_FIELDS : scope === "SELF" ? PERSON_SELF_FIELDS : [];

      return { scope, subjectId: resource.id, writableFields };
    }

    case "timeline": {
      // History is readable within scope and writable by nobody: there is no
      // action other than "read" that this codebase can perform on it.
      const scope = await scopeOver(db, actor, resource.personId);
      if (action !== "read") throw forbidden("timeline_is_append_only");
      return { scope, subjectId: resource.personId, writableFields: [] };
    }

    case "engagement": {
      const engagement = await db.engagement.findUnique({
        where: { id: resource.id },
        select: { personId: true },
      });
      if (!engagement) throw forbidden("not_found");
      const scope = await scopeOver(db, actor, engagement.personId);
      if (action !== "read" && scope !== "ADMIN") throw forbidden();
      return { scope, subjectId: engagement.personId, writableFields: [] };
    }

    case "work_log_draft":
    case "weekly_report_draft": {
      // Creating a submission for somebody else is never allowed, admin or not.
      // Work is authored, not assigned.
      if (actor.id !== resource.ownerId) throw forbidden("authorship_is_personal");
      return {
        scope: "SELF",
        subjectId: actor.id,
        writableFields:
          resource.kind === "work_log_draft" ? WORK_LOG_DRAFT_FIELDS : WEEKLY_REPORT_DRAFT_FIELDS,
      };
    }

    case "work_log": {
      const log = await db.workLog.findUnique({
        where: { id: resource.id },
        select: { personId: true, status: true },
      });
      if (!log) throw forbidden("not_found");
      const scope = await scopeOver(db, actor, log.personId);

      if (action === "read") {
        return { scope, subjectId: log.personId, writableFields: [] };
      }

      // Invariant 1.3: once SUBMITTED a work log is read-only to its author,
      // permanently. Corrections go through a correction_request.
      //
      // This is also why an admin gets no writable fields here: an admin
      // approving a correction writes through approveCorrection, which
      // snapshots the previous value first. Handing admins a direct write path
      // would let history be lost by a route that simply forgot to snapshot.
      if (action === "update" || action === "submit") {
        if (scope !== "SELF") throw forbidden("not_the_author");
        if (log.status === "SUBMITTED") throw forbidden("submitted_records_are_immutable");
        return { scope, subjectId: log.personId, writableFields: WORK_LOG_DRAFT_FIELDS };
      }

      // Mentor review is Stage 2. The scope exists and is tested; the writable
      // field it will unlock (mentorComment) is not granted yet.
      throw forbidden("not_available_in_stage_1");
    }

    case "weekly_report": {
      const report = await db.weeklyReport.findUnique({
        where: { id: resource.id },
        select: { personId: true, status: true },
      });
      if (!report) throw forbidden("not_found");
      const scope = await scopeOver(db, actor, report.personId);

      if (action === "read") {
        return { scope, subjectId: report.personId, writableFields: [] };
      }

      if (action === "update" || action === "submit") {
        if (scope !== "SELF") throw forbidden("not_the_author");
        if (report.status === "SUBMITTED") throw forbidden("submitted_records_are_immutable");
        return { scope, subjectId: report.personId, writableFields: WEEKLY_REPORT_DRAFT_FIELDS };
      }

      throw forbidden("not_available_in_stage_1");
    }

    case "correction_new": {
      // Only the author of a submitted record may ask for it to be corrected.
      const owner = await correctionTargetOwner(db, resource.targetType, resource.targetId);
      if (!owner) throw forbidden("not_found");
      if (owner.personId !== actor.id) throw forbidden("not_the_author");
      if (owner.status !== "SUBMITTED") throw forbidden("draft_records_are_edited_directly");
      return { scope: "SELF", subjectId: actor.id, writableFields: [] };
    }

    case "correction": {
      const correction = await db.correctionRequest.findUnique({
        where: { id: resource.id },
        select: { requestedById: true },
      });
      if (!correction) throw forbidden("not_found");

      // Deciding is an admin act. Reading is available to the requester too.
      if (action === "decide") {
        if (!actor.isAdmin) throw forbidden("admin_only");
        return { scope: "ADMIN", subjectId: correction.requestedById, writableFields: [] };
      }
      if (action !== "read") throw forbidden();

      const scope = await scopeOver(db, actor, correction.requestedById);
      return { scope, subjectId: correction.requestedById, writableFields: [] };
    }

    case "team": {
      // Teams are structural, not personal: everyone signed in may see the
      // list, because they need it to pick one. Only an admin may change one.
      if (action !== "read" && !actor.isAdmin) throw forbidden("admin_only");
      return {
        scope: actor.isAdmin ? "ADMIN" : "SELF",
        subjectId: actor.id,
        writableFields: actor.isAdmin ? TEAM_ADMIN_FIELDS : [],
      };
    }

    case "task": {
      const task = await db.task.findUnique({
        where: { id: resource.id },
        select: { assignments: { select: { personId: true } } },
      });
      if (!task) throw forbidden("not_found");

      // Creating, editing and assigning tasks is an admin act.
      if (action !== "read") {
        if (!actor.isAdmin) throw forbidden("admin_only");
        return { scope: "ADMIN", subjectId: actor.id, writableFields: TASK_ADMIN_FIELDS };
      }

      if (actor.isAdmin) {
        return { scope: "ADMIN", subjectId: actor.id, writableFields: [] };
      }

      const assigneeIds = task.assignments.map((a) => a.personId);
      if (assigneeIds.includes(actor.id)) {
        return { scope: "SELF", subjectId: actor.id, writableFields: [] };
      }

      // A mentor sees a task only because somebody they mentor is on it.
      for (const assigneeId of assigneeIds) {
        if (await mentorsPerson(db, actor.id, assigneeId)) {
          return { scope: "MENTOR", subjectId: assigneeId, writableFields: [] };
        }
      }

      throw forbidden();
    }

    case "task_assignment": {
      const assignment = await db.taskAssignment.findUnique({
        where: { id: resource.id },
        select: { personId: true, status: true },
      });
      if (!assignment) throw forbidden("not_found");
      const scope = await scopeOver(db, actor, assignment.personId);

      if (action === "read") {
        return { scope, subjectId: assignment.personId, writableFields: [] };
      }

      if (action === "update" || action === "submit") {
        // Assignment is not authorship. Only the person the work was given to
        // may hand it in, and an admin gets no direct write path either: a
        // submitted record is corrected, never edited, so that the previous
        // value is always retained.
        if (scope !== "SELF") throw forbidden("not_the_author");
        if (assignment.status === "SUBMITTED") {
          throw forbidden("submitted_records_are_immutable");
        }
        return {
          scope,
          subjectId: assignment.personId,
          writableFields: TASK_SUBMISSION_FIELDS,
        };
      }

      throw forbidden("not_available_in_stage_1");
    }

    case "onboarding": {
      // An admin decides; the person themselves fills it in while it is still
      // pending. Mentors have no part in it — there is no mentor yet.
      if (action === "decide") {
        if (!actor.isAdmin) throw forbidden("admin_only");
        return { scope: "ADMIN", subjectId: resource.personId, writableFields: [] };
      }

      if (actor.isAdmin) {
        return {
          scope: "ADMIN",
          subjectId: resource.personId,
          writableFields: action === "read" ? [] : ONBOARDING_FIELDS,
        };
      }

      if (actor.id !== resource.personId) throw forbidden();

      if (action !== "read") {
        const existing = await db.onboardingSubmission.findUnique({
          where: { personId: actor.id },
          select: { status: true },
        });
        // Once an admin has decided, the submission is the record of what was
        // asked for and by whom. It stops being editable.
        if (existing && existing.status !== "PENDING") {
          throw forbidden("onboarding_already_decided");
        }
      }

      return {
        scope: "SELF",
        subjectId: actor.id,
        writableFields: action === "read" ? [] : ONBOARDING_FIELDS,
      };
    }

    case "export": {
      // A CSV of names, emails, phones and colleges is an export of personal
      // data. Admins export everyone; a mentor exports the people they mentor
      // and nobody else; everyone else is refused outright.
      if (action !== "export" && action !== "read") throw forbidden();
      if (actor.isAdmin) {
        return { scope: "ADMIN", subjectId: actor.id, writableFields: [] };
      }

      const mentees = await db.engagement.count({ where: { mentorId: actor.id } });
      if (mentees === 0) throw forbidden("export_requires_mentor_or_admin");

      return { scope: "MENTOR", subjectId: actor.id, writableFields: [] };
    }

    case "document": {
      const document = await db.document.findUnique({
        where: { id: resource.id },
        select: { personId: true, visibility: true },
      });
      if (!document) throw forbidden("not_found");
      const scope = await scopeOver(db, actor, document.personId);

      // ADMIN_ONLY documents are invisible to their own subject and to mentors.
      // Internal notes about a person are not the same thing as that person's
      // own paperwork.
      if (document.visibility === "ADMIN_ONLY" && scope !== "ADMIN") {
        throw forbidden("admin_only_document");
      }
      if (action !== "read") throw forbidden("uploads_are_stage_3");

      return { scope, subjectId: document.personId, writableFields: [] };
    }
  }
}

/**
 * Reject any body key the grant does not name as writable.
 *
 * This is what makes "a mentor cannot edit a summary" and "an author cannot
 * edit a submitted log" structural rather than incidental: a handler cannot
 * write a field without the grant that names it.
 */
export function assertWritable(grant: Grant, body: Record<string, unknown>): void {
  const requested = Object.keys(body);
  if (requested.length === 0) return;

  const forbiddenFields = requested.filter((key) => !grant.writableFields.includes(key));
  if (forbiddenFields.length > 0) {
    throw new AuthzError(
      403,
      "field_not_writable",
      `These fields are not writable here: ${forbiddenFields.join(", ")}.`,
    );
  }
}

/**
 * The `where` clause restricting a list query to what the actor may see.
 * Listing is filtered at the database, not after fetching.
 */
export async function visiblePeopleFilter(
  actor: Actor,
  db: Db = prisma,
): Promise<{ personId: string } | { personId: { in: string[] } }> {
  if (actor.isAdmin) return { personId: { in: await allPersonIds(db) } };

  const mentored = await db.engagement.findMany({
    where: { mentorId: actor.id },
    select: { personId: true },
    distinct: ["personId"],
  });

  return { personId: { in: [actor.id, ...mentored.map((e) => e.personId)] } };
}

async function allPersonIds(db: Db): Promise<string[]> {
  const people = await db.person.findMany({ select: { id: true } });
  return people.map((p) => p.id);
}
