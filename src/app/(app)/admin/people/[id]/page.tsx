import { notFound, redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatIstTimestamp, utcMidnightToIstDate } from "@/lib/ist";
import { BackLink, Card, EmptyState, StatusPill } from "@/components/ui";
import { EngagementPanel } from "./engagement-panel";
import { CorrectionQueue } from "./correction-queue";

export default async function AdminPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) redirect("/login");

  try {
    await authorize(actor, "read", { kind: "admin" });
  } catch (error) {
    if (error instanceof AuthzError) redirect("/my-work");
    throw error;
  }

  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      engagements: {
        orderBy: { startDate: "desc" },
        include: { mentor: { select: { id: true, fullName: true, preferredName: true } } },
      },
      timeline: {
        orderBy: { occurredAt: "desc" },
        take: 100,
        include: { actor: { select: { fullName: true, preferredName: true } } },
      },
    },
  });
  if (!person) notFound();

  const [mentorCandidates, corrections, logCount] = await Promise.all([
    prisma.person.findMany({
      where: { status: "ACTIVE", id: { not: person.id } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, preferredName: true, personId: true },
    }),
    prisma.correctionRequest.findMany({
      where: { requestedById: person.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workLog.count({ where: { personId: person.id } }),
  ]);

  const openEngagement = person.engagements.find(
    (e) => e.status === "ACTIVE" || e.status === "UPCOMING",
  );

  return (
    <div className="space-y-8">
      <BackLink href="/admin/people">← Back to people</BackLink>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">{person.fullName}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {person.personId} · {person.email}
            {person.isAdmin ? " · admin" : ""}
          </p>
        </div>
        <StatusPill status={person.status} />
      </div>

      <Card className="grid gap-4 sm:grid-cols-3">
        <Detail label="Preferred name" value={person.preferredName} />
        <Detail label="Phone" value={person.phone} />
        <Detail label="College" value={person.college} />
        <Detail label="Course" value={person.course} />
        <Detail
          label="Graduation year"
          value={person.graduationYear ? String(person.graduationYear) : null}
        />
        <Detail label="Work logs filed" value={String(logCount)} />
      </Card>

      {corrections.length > 0 ? <CorrectionQueue corrections={corrections} /> : null}

      <EngagementPanel
        personId={person.id}
        engagements={person.engagements.map((engagement) => ({
          id: engagement.id,
          type: engagement.type,
          designation: engagement.designation,
          department: engagement.department,
          status: engagement.status,
          workMode: engagement.workMode,
          startDate: utcMidnightToIstDate(engagement.startDate),
          endDate: engagement.endDate ? utcMidnightToIstDate(engagement.endDate) : null,
          mentorName: engagement.mentor
            ? engagement.mentor.preferredName ?? engagement.mentor.fullName
            : null,
        }))}
        mentorCandidates={mentorCandidates.map((m) => ({
          id: m.id,
          label: `${m.preferredName ?? m.fullName} (${m.personId})`,
        }))}
        hasOpenEngagement={Boolean(openEngagement)}
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink-900">History</h2>
        <p className="mb-3 text-sm text-ink-500">
          Append-only. Entries here are never edited or removed.
        </p>

        {person.timeline.length === 0 ? (
          <EmptyState title="Nothing recorded yet" description="Events will appear here as they happen." />
        ) : (
          <ol className="space-y-3 border-l border-cream-300 pl-4">
            {person.timeline.map((event) => (
              <li key={event.id}>
                <p className="text-sm text-ink-900">{event.description}</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {formatIstTimestamp(event.occurredAt)}
                  {event.actor ? ` · ${event.actor.preferredName ?? event.actor.fullName}` : ""}
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
      <p className="mt-1 text-ink-900">
        {value ?? <span className="text-ink-400">Not recorded</span>}
      </p>
    </div>
  );
}
