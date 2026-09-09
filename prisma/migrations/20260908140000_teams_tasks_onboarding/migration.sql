-- Stage 2: teams, tasks, assignments and onboarding.
--
-- The interesting part is the middle. `engagements.department` was free text,
-- and team-level progress is now reported on and exported. A team is created
-- for each distinct department value and backfilled onto the engagements that
-- used it, so no existing grouping is lost -- and only then is the old column
-- dropped. Keeping both a string and a foreign key would guarantee they drift.

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterEnum
ALTER TYPE "CorrectionTarget" ADD VALUE 'TASK_ASSIGNMENT';

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "lead_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE INDEX "teams_is_active_idx" ON "teams"("is_active");

-- AlterTable: the new column lives alongside the old one for exactly as long
-- as the backfill below takes.
ALTER TABLE "engagements" ADD COLUMN "team_id" TEXT;

-- Backfill: one team per distinct department, then point engagements at it.
-- gen_random_uuid() is built in from PostgreSQL 13. Slugs lowercase the name
-- and collapse runs of non-alphanumerics to a single hyphen.
INSERT INTO "teams" ("id", "name", "slug", "is_active", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  d.department,
  trim(both '-' from regexp_replace(lower(d.department), '[^a-z0-9]+', '-', 'g')),
  true,
  now(),
  now()
FROM (
  SELECT DISTINCT btrim("department") AS department
  FROM "engagements"
  WHERE "department" IS NOT NULL AND btrim("department") <> ''
) AS d
ON CONFLICT ("name") DO NOTHING;

UPDATE "engagements" e
SET "team_id" = t."id"
FROM "teams" t
WHERE t."name" = btrim(e."department")
  AND e."department" IS NOT NULL;

-- The string column has served its purpose.
ALTER TABLE "engagements" DROP COLUMN "department";

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "team_id" TEXT,
    "due_date" DATE NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "submission_note" TEXT,
    "links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submitted_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "mentor_comment" TEXT,
    "assigned_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_submissions" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "requested_team_id" TEXT,
    "requested_designation" TEXT NOT NULL,
    "requested_type" "EngagementType" NOT NULL DEFAULT 'INTERNSHIP',
    "proposed_start_date" DATE NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- CreateIndex
CREATE INDEX "tasks_team_id_idx" ON "tasks"("team_id");

-- CreateIndex
CREATE INDEX "task_assignments_person_id_status_idx" ON "task_assignments"("person_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_task_id_person_id_key" ON "task_assignments"("task_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_submissions_person_id_key" ON "onboarding_submissions"("person_id");

-- CreateIndex
CREATE INDEX "onboarding_submissions_status_idx" ON "onboarding_submissions"("status");

-- CreateIndex
CREATE INDEX "engagements_team_id_idx" ON "engagements"("team_id");

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_requested_team_id_fkey" FOREIGN KEY ("requested_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
