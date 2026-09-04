import type { Db } from "@/lib/prisma";

/**
 * Permanent identity allocation.
 *
 * A person gets PRR-000001 on creation and keeps it forever, across every
 * engagement. An intern who becomes an employee keeps the same number; there
 * is no path in this codebase that reassigns or reuses one.
 *
 * Backed by a Postgres sequence rather than `MAX(person_id) + 1`, so two
 * concurrent admin creates can never collide. A rolled-back transaction burns
 * a number — gaps are fine, collisions are not.
 */
export async function allocatePersonId(db: Db): Promise<string> {
  const rows = await db.$queryRaw<
    { value: bigint }[]
  >`SELECT nextval('person_id_seq') AS value`;

  const next = rows[0]?.value;
  if (next === undefined) throw new Error("person_id_seq returned no value");

  return formatPersonId(Number(next));
}

/** 1 becomes PRR-000001. Widens past six digits rather than truncating. */
export function formatPersonId(value: number): string {
  return `PRR-${String(value).padStart(6, "0")}`;
}
