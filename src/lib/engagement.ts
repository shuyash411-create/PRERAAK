import type { Db } from "@/lib/prisma";
import { RequestError } from "@/lib/guarded";

/**
 * The engagement a person's new work should be filed against.
 *
 * Work belongs to a person permanently and to an engagement contextually. When
 * an intern becomes an employee, new logs attach to the employment engagement
 * while every earlier log stays attached to the internship — and both stay
 * queryable under the one person.
 */
export async function currentEngagementId(db: Db, personId: string): Promise<string> {
  const active = await db.engagement.findFirst({
    where: { personId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    select: { id: true },
  });
  if (active) return active.id;

  const upcoming = await db.engagement.findFirst({
    where: { personId, status: "UPCOMING" },
    orderBy: { startDate: "asc" },
    select: { id: true },
  });
  if (upcoming) return upcoming.id;

  throw new RequestError(
    409,
    "no_active_engagement",
    "You do not have an active engagement yet. Ask an admin to set one up.",
  );
}
