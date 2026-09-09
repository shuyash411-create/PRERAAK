/**
 * ONE-TIME PRODUCTION BOOTSTRAP — creates the first admin.
 *
 * The app is invite-only by construction: nobody can sign in until a
 * `Person` row exists. A brand-new database has none, so this script exists
 * to create exactly one. It refuses outright if the `people` table already
 * has anyone in it — it cannot be used to mint a second admin, and running
 * it twice is a no-op refusal, not a duplicate.
 *
 * Run once, from your own machine, against the production DATABASE_URL:
 *   ADMIN_NAME="..." ADMIN_EMAIL="..." DATABASE_URL="<neon pooled url>" \
 *     npm run bootstrap-admin
 */
import { PrismaClient } from "@prisma/client";
import { allocatePersonId } from "../src/lib/person-id";

const db = new PrismaClient();

function refuse(reason: string): never {
  console.error(`\nBootstrap refused: ${reason}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const fullName = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL;

  if (!fullName) refuse("set ADMIN_NAME.");
  if (!email) refuse("set ADMIN_EMAIL.");

  const existing = await db.person.count();
  if (existing > 0) {
    refuse(`the database already has ${existing} people. This script only creates the first one.`);
  }

  const admin = await db.person.create({
    data: {
      personId: await allocatePersonId(db),
      fullName,
      email,
      isAdmin: true,
      status: "ACTIVE",
    },
  });

  await db.timelineEvent.create({
    data: {
      personId: admin.id,
      eventType: "PERSON_CREATED",
      description: `${admin.fullName} was added as ${admin.personId}.`,
      actorId: admin.id,
    },
  });

  console.info(
    [
      "",
      `Created the first admin: ${admin.fullName} <${admin.email}> (${admin.personId}).`,
      "Sign in at /login with that email to get the magic link.",
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
