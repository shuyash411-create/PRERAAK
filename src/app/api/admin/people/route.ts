import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guarded, readJson, RequestError } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";
import { allocatePersonId } from "@/lib/person-id";
import { recordEvent } from "@/lib/timeline";
import { createPerson, listPeople } from "@/lib/validation/person";

/** The people list. Search and pagination happen in the database. */
export const GET = guarded({ action: "read", resource: { kind: "admin" } }, async ({ req }) => {
  const url = new URL(req.url);
  const query = listPeople.parse(Object.fromEntries(url.searchParams));

  const where: Prisma.PersonWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { fullName: { contains: query.q, mode: "insensitive" } },
            { preferredName: { contains: query.q, mode: "insensitive" } },
            { personId: { contains: query.q, mode: "insensitive" } },
            { email: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, people] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      orderBy: { personId: "asc" },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      select: {
        id: true,
        personId: true,
        fullName: true,
        preferredName: true,
        email: true,
        status: true,
        isAdmin: true,
        engagements: {
          orderBy: { startDate: "desc" },
          take: 1,
          select: {
            id: true,
            type: true,
            designation: true,
            department: true,
            status: true,
            mentor: { select: { id: true, fullName: true, preferredName: true } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    people: people.map(({ engagements, ...person }) => ({
      ...person,
      currentEngagement: engagements[0] ?? null,
    })),
    page: query.page,
    perPage: query.perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.perPage)),
  });
});

/**
 * Create a person.
 *
 * This is the moment a permanent identity is allocated. It happens once and
 * the number is never reissued, so an intern who returns as an employee keeps
 * the same PRR- id and the same history.
 */
export const POST = guarded({ action: "create", resource: { kind: "admin" } }, async ({ actor, req }) => {
  const input = createPerson.parse(await readJson(req));

  const existing = await prisma.person.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new RequestError(
      409,
      "email_taken",
      `${input.email} already belongs to ${existing.personId}. A person is created once and keeps that record.`,
    );
  }

  const person = await prisma.$transaction(async (tx) => {
    const created = await tx.person.create({
      data: {
        personId: await allocatePersonId(tx),
        fullName: input.fullName,
        preferredName: input.preferredName ?? null,
        email: input.email,
        phone: input.phone ?? null,
        college: input.college ?? null,
        course: input.course ?? null,
        graduationYear: input.graduationYear ?? null,
        isAdmin: input.isAdmin,
      },
    });

    await recordEvent(tx, {
      personId: created.id,
      eventType: "PERSON_CREATED",
      description: `${created.fullName} was added as ${created.personId}.`,
      actorId: actor.id,
      metadata: { personId: created.personId, isAdmin: created.isAdmin },
    });

    return created;
  });

  return NextResponse.json({ person }, { status: 201 });
});
