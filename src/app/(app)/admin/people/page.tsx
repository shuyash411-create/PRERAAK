import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  buttonClass,
  EmptyState,
  inputClass,
  PageHeader,
  secondaryButtonClass,
  StatusPill,
} from "@/components/ui";

const PER_PAGE = 25;

/** The people list. Desktop-first: this is a screen used at a desk. */
export default async function AdminPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  try {
    await authorize(actor, "read", { kind: "admin" });
  } catch (error) {
    if (error instanceof AuthzError) redirect("/my-work");
    throw error;
  }

  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const where: Prisma.PersonWhereInput = q
    ? {
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { preferredName: { contains: q, mode: "insensitive" } },
          { personId: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [total, people, pendingCorrections] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      orderBy: { personId: "asc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        engagements: {
          orderBy: { startDate: "desc" },
          take: 1,
          include: {
            mentor: { select: { fullName: true, preferredName: true } },
            team: { select: { name: true } },
          },
        },
      },
    }),
    prisma.correctionRequest.count({ where: { status: "PENDING" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        subtitle={`${total} ${total === 1 ? "person" : "people"}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/capacity" className={secondaryButtonClass}>Capacity</Link>
            <Link href="/admin/onboarding" className={secondaryButtonClass}>Onboarding</Link>
            <Link href="/admin/tasks" className={secondaryButtonClass}>Tasks</Link>
            <Link href="/admin/export" className={secondaryButtonClass}>Export</Link>
            <Link href="/admin/people/new" className={buttonClass}>Add a person</Link>
          </div>
        }
      />

      {pendingCorrections > 0 ? (
        <p className="rounded-md border border-cream-300 bg-cream-50 px-4 py-3 text-sm text-ink-700">
          {pendingCorrections} correction{pendingCorrections === 1 ? "" : "s"} waiting for a
          decision. Open the person&rsquo;s page to review.
        </p>
      ) : null}

      <form method="GET" className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search people
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Name, PRERAAK id or email"
          className={`${inputClass} max-w-sm`}
        />
        <button type="submit" className={buttonClass}>
          Search
        </button>
      </form>

      {people.length === 0 ? (
        <EmptyState
          title={q ? "Nobody matched that search" : "No people yet"}
          description={
            q
              ? "Try a different name, PRERAAK id or email address."
              : "Add the first person to get started. They will receive a sign-in link at the email you enter."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-cream-300">
          <table className="w-full min-w-[42rem] border-collapse bg-cream-50 text-left text-sm">
            <thead className="border-b border-cream-300 text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Id</th>
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Team</th>
                <th scope="col" className="px-4 py-3 font-medium">Designation</th>
                <th scope="col" className="px-4 py-3 font-medium">Mentor</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-300">
              {people.map((person) => {
                const engagement = person.engagements[0];
                return (
                  <tr key={person.id} className="hover:bg-cream-100">
                    <td className="px-4 py-3 font-mono text-xs text-ink-500">{person.personId}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/people/${person.id}`}
                        className="font-medium text-forest-700 underline underline-offset-2"
                      >
                        {person.fullName}
                      </Link>
                      <p className="text-xs text-ink-400">{person.email}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {engagement?.team?.name ?? <span className="text-ink-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {engagement?.designation ?? <span className="text-ink-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {engagement?.mentor
                        ? engagement.mentor.preferredName ?? engagement.mentor.fullName
                        : <span className="text-ink-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={person.status} />
                      {person.isAdmin ? (
                        <span className="ml-1 text-xs text-ink-400">admin</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/people?q=${encodeURIComponent(q)}&page=${page - 1}`}
              className="text-forest-700 underline underline-offset-2"
            >
              ← Previous
            </Link>
          ) : null}
          <span className="text-ink-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/admin/people?q=${encodeURIComponent(q)}&page=${page + 1}`}
              className="text-forest-700 underline underline-offset-2"
            >
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
