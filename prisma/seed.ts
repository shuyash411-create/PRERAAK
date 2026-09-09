/**
 * DEVELOPMENT SEED — NEVER RUN THIS AGAINST PRODUCTION.
 *
 * It writes fabricated people and work logs, and it is guarded three ways:
 *   1. SEED_CONFIRM must equal DEV.
 *   2. NODE_ENV must not be production.
 *   3. DATABASE_URL must point at localhost, unless SEED_ALLOW_REMOTE=true.
 *
 * Every row it creates is prefixed [DEV] so seeded data is obvious in any
 * screen it reaches.
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { istDateToUtcMidnight, addIstDays, istDateString } from "../src/lib/ist";
import { formatPersonId } from "../src/lib/person-id";

config({ path: ".env.local", quiet: true });

const db = new PrismaClient();

function refuse(reason: string): never {
  console.error(`\nSeed refused: ${reason}\n`);
  process.exit(1);
}

function checkGuards(): void {
  if (process.env.SEED_CONFIRM !== "DEV") {
    refuse("set SEED_CONFIRM=DEV to confirm this is a development database.");
  }
  if (process.env.NODE_ENV === "production") {
    refuse("NODE_ENV is production.");
  }

  const url = process.env.DATABASE_URL;
  if (!url) refuse("DATABASE_URL is not set.");

  const isLocal = /@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url);
  if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "true") {
    refuse(
      `DATABASE_URL is not local (${url.replace(/:[^:@/]*@/, ":***@")}). ` +
        "Set SEED_ALLOW_REMOTE=true only if you are certain.",
    );
  }
}

async function main(): Promise<void> {
  checkGuards();

  const existing = await db.person.count();
  if (existing > 0) {
    refuse(`the database already has ${existing} people. Seed only an empty database.`);
  }

  const today = istDateString();

  const nextId = async () => {
    const [{ value }] = await db.$queryRaw<{ value: bigint }[]>`SELECT nextval('person_id_seq') AS value`;
    return formatPersonId(Number(value));
  };

  const founder = await db.person.create({
    data: {
      personId: await nextId(),
      fullName: "[DEV] Aditi Founder",
      preferredName: "Aditi",
      email: "aditi@dev.local",
      isAdmin: true,
    },
  });

  const mentor = await db.person.create({
    data: {
      personId: await nextId(),
      fullName: "[DEV] Rohan Mentor",
      preferredName: "Rohan",
      email: "rohan@dev.local",
    },
  });

  const intern = await db.person.create({
    data: {
      personId: await nextId(),
      fullName: "[DEV] Meera Intern",
      preferredName: "Meera",
      email: "meera@dev.local",
      college: "[DEV] Example Institute of Technology",
      course: "B.Tech Computer Science",
      graduationYear: 2027,
    },
  });

  const engineering = await db.team.create({
    data: { name: "[DEV] Engineering", slug: "dev-engineering", leadId: mentor.id },
  });

  const design = await db.team.create({
    data: { name: "[DEV] Design", slug: "dev-design" },
  });

  await db.engagement.create({
    data: {
      personId: founder.id,
      type: "EMPLOYMENT",
      designation: "Founder",
      teamId: design.id,
      startDate: istDateToUtcMidnight("2024-01-01"),
      status: "ACTIVE",
      workMode: "HYBRID",
    },
  });

  await db.engagement.create({
    data: {
      personId: mentor.id,
      type: "EMPLOYMENT",
      designation: "Engineering Lead",
      teamId: engineering.id,
      startDate: istDateToUtcMidnight("2025-03-01"),
      status: "ACTIVE",
      workMode: "REMOTE",
    },
  });

  const internship = await db.engagement.create({
    data: {
      personId: intern.id,
      type: "INTERNSHIP",
      designation: "Engineering Intern",
      teamId: engineering.id,
      mentorId: mentor.id,
      startDate: istDateToUtcMidnight(addIstDays(today, -30)),
      status: "ACTIVE",
      workMode: "REMOTE",
    },
  });

  for (const [offset, summary, review] of [
    [
      -3,
      "[DEV] Set up the local environment and read the codebase.",
      "[DEV] Good first few days — nice pace.",
    ],
    [-2, "[DEV] Wrote the first migration and got it reviewed.", null],
    [-1, "[DEV] Fixed the timezone handling on the reports screen.", null],
  ] as const) {
    await db.workLog.create({
      data: {
        personId: intern.id,
        engagementId: internship.id,
        workDate: istDateToUtcMidnight(addIstDays(today, offset)),
        summary,
        status: "SUBMITTED",
        submittedAt: new Date(),
        mentorComment: review,
        reviewedById: review ? mentor.id : null,
        reviewedAt: review ? new Date() : null,
      },
    });
  }

  const tasks = [
    { title: "[DEV] Write the onboarding form", due: 5, submitted: false },
    { title: "[DEV] Review the IST helpers", due: -2, submitted: false },
    { title: "[DEV] Draft the export columns", due: -6, submitted: true },
  ];

  for (const spec of tasks) {
    const task = await db.task.create({
      data: {
        title: spec.title,
        description: "Development seed data.",
        teamId: engineering.id,
        dueDate: istDateToUtcMidnight(addIstDays(today, spec.due)),
        createdById: founder.id,
        priority: spec.due < 0 ? "HIGH" : "NORMAL",
        status: spec.submitted ? "COMPLETED" : "OPEN",
      },
    });

    await db.taskAssignment.create({
      data: {
        taskId: task.id,
        personId: intern.id,
        assignedById: founder.id,
        status: spec.submitted ? "SUBMITTED" : "ASSIGNED",
        submissionNote: spec.submitted ? "[DEV] Wrote up the column list and shared it." : null,
        submittedAt: spec.submitted ? new Date() : null,
      },
    });
  }

  await db.timelineEvent.createMany({
    data: [founder, mentor, intern].map((person) => ({
      personId: person.id,
      eventType: "PERSON_CREATED",
      description: `${person.fullName} was added as ${person.personId}.`,
      actorId: founder.id,
    })),
  });

  console.info(
    [
      "",
      "Seeded development data. Sign in at http://localhost:3000/login with:",
      `  admin   ${founder.email}`,
      `  mentor  ${mentor.email}`,
      `  intern  ${intern.email}`,
      "",
      "With RESEND_API_KEY unset, the sign-in link prints to this server's console.",
      "",
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
