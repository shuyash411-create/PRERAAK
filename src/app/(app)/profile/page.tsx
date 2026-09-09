import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatIstDate, formatIstTimestamp, utcMidnightToIstDate } from "@/lib/ist";
import { Card, EmptyState, StatusPill } from "@/components/ui";
import { ProfileForm } from "./profile-form";

/**
 * A person's own record: who they are, every engagement they have had, and
 * their history. Read-only — details are changed by an admin, which keeps the
 * timeline honest about who changed what.
 */
export default async function ProfilePage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const person = await prisma.person.findUniqueOrThrow({
    where: { id: actor.id },
    include: {
      engagements: {
        orderBy: { startDate: "desc" },
        include: {
          mentor: { select: { fullName: true, preferredName: true } },
          team: { select: { name: true } },
        },
      },
      timeline: {
        orderBy: { occurredAt: "desc" },
        take: 50,
        include: { actor: { select: { fullName: true, preferredName: true } } },
      },
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">{person.fullName}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {person.personId} · {person.email}
        </p>
      </div>

      <Card className="grid gap-4 sm:grid-cols-2">
        <Detail label="Preferred name" value={person.preferredName} />
        <Detail label="Phone" value={person.phone} />
        <Detail label="College" value={person.college} />
        <Detail label="Course" value={person.course} />
        <Detail
          label="Graduation year"
          value={person.graduationYear ? String(person.graduationYear) : null}
        />
        <Detail label="Status" value={person.status} />
      </Card>

      <ProfileForm
        defaultValues={{
          preferredName: person.preferredName ?? "",
          phone: person.phone ?? "",
          college: person.college ?? "",
          course: person.course ?? "",
          graduationYear: person.graduationYear ? String(person.graduationYear) : "",
        }}
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Engagements</h2>
        <p className="mb-3 text-sm text-ink-500">
          Your PRERAAK id stays the same across all of these. Nothing you have filed is ever
          detached from it.
        </p>

        {person.engagements.length === 0 ? (
          <EmptyState
            title="No engagements yet"
            description="An admin will add your internship or employment engagement here."
          />
        ) : (
          <ul className="space-y-3">
            {person.engagements.map((engagement) => (
              <li
                key={engagement.id}
                className="rounded-lg border border-cream-300 bg-cream-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink-900">{engagement.designation}</p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {engagement.type === "INTERNSHIP" ? "Internship" : "Employment"}
                      {engagement.team ? ` · ${engagement.team.name}` : ""}
                      {engagement.workMode ? ` · ${engagement.workMode.toLowerCase()}` : ""}
                    </p>
                  </div>
                  <StatusPill status={engagement.status} />
                </div>

                <p className="mt-2 text-sm text-ink-500">
                  {formatIstDate(utcMidnightToIstDate(engagement.startDate))} —{" "}
                  {engagement.endDate
                    ? formatIstDate(utcMidnightToIstDate(engagement.endDate))
                    : "present"}
                </p>

                {engagement.mentor ? (
                  <p className="mt-1 text-sm text-ink-500">
                    Mentor: {engagement.mentor.preferredName ?? engagement.mentor.fullName}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink-900">History</h2>
        {person.timeline.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            description="Milestones like joining, changing engagement and approved corrections appear here."
          />
        ) : (
          <ol className="space-y-3 border-l border-cream-300 pl-4">
            {person.timeline.map((event) => (
              <li key={event.id}>
                <p className="text-sm text-ink-900">{event.description}</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {formatIstTimestamp(event.occurredAt)}
                  {event.actor
                    ? ` · ${event.actor.preferredName ?? event.actor.fullName}`
                    : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-ink-900">{value ?? <span className="text-ink-400">Not recorded</span>}</p>
    </div>
  );
}
