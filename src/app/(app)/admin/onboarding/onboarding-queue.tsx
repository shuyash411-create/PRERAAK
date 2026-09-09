"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideOnboardingAction } from "@/app/actions/admin";
import { buttonClass, ErrorNote, Field, inputClass, secondaryButtonClass } from "@/components/ui";

type Submission = {
  id: string;
  personName: string;
  personId: string;
  email: string;
  college: string | null;
  course: string | null;
  graduationYear: number | null;
  requestedTeamId: string | null;
  requestedTeamName: string | null;
  requestedDesignation: string;
  requestedType: "INTERNSHIP" | "EMPLOYMENT";
  proposedStartDate: string;
};

/**
 * The confirm step.
 *
 * What the person asked for is pre-filled and editable — an admin correcting a
 * designation here is the point of the step, not a workaround. Both what was
 * requested and what was confirmed are written to the timeline.
 */
export function OnboardingQueue({
  submissions,
  teams,
  mentors,
}: {
  submissions: Submission[];
  teams: { id: string; name: string }[];
  mentors: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  function decide(form: HTMLFormElement, decision: "CONFIRM" | "REJECT") {
    const data = new FormData(form);
    data.set("decision", decision);
    setError(null);
    startTransition(async () => {
      const result = await decideOnboardingAction(data);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpenId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {submissions.map((s) => (
        <form
          key={s.id}
          className="rounded-lg border border-cream-300 bg-cream-50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            decide(event.currentTarget, "CONFIRM");
          }}
        >
          <input type="hidden" name="submissionId" value={s.id} />

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-ink-900">{s.personName}</p>
              <p className="mt-0.5 text-sm text-ink-500">
                {s.personId} · {s.email}
              </p>
              <p className="mt-2 text-sm text-ink-700">
                Asked to join{" "}
                <strong>{s.requestedTeamName ?? "no team yet"}</strong> as{" "}
                <strong>{s.requestedDesignation}</strong> (
                {s.requestedType === "INTERNSHIP" ? "intern" : "employee"}) from{" "}
                <strong>{s.proposedStartDate}</strong>.
              </p>
              {s.college ? (
                <p className="mt-1 text-sm text-ink-500">
                  {s.college}
                  {s.course ? ` · ${s.course}` : ""}
                  {s.graduationYear ? ` · ${s.graduationYear}` : ""}
                </p>
              ) : null}
            </div>

            {openId !== s.id ? (
              <button type="button" className={secondaryButtonClass} onClick={() => setOpenId(s.id)}>
                Review
              </button>
            ) : null}
          </div>

          {openId === s.id ? (
            <div className="mt-4 space-y-4 border-t border-cream-300 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Team" htmlFor={`team-${s.id}`}>
                  <select id={`team-${s.id}`} name="teamId" className={inputClass}
                    defaultValue={s.requestedTeamId ?? ""}>
                    <option value="">No team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Designation" htmlFor={`designation-${s.id}`}>
                  <input id={`designation-${s.id}`} name="designation"
                    defaultValue={s.requestedDesignation} className={inputClass} />
                </Field>

                <Field label="Type" htmlFor={`type-${s.id}`}>
                  <select id={`type-${s.id}`} name="type" className={inputClass}
                    defaultValue={s.requestedType}>
                    <option value="INTERNSHIP">Internship</option>
                    <option value="EMPLOYMENT">Employment</option>
                  </select>
                </Field>

                <Field label="Start date" htmlFor={`start-${s.id}`}>
                  <input id={`start-${s.id}`} name="startDate" type="date"
                    defaultValue={s.proposedStartDate} className={inputClass} />
                </Field>

                <Field label="Mentor" htmlFor={`mentor-${s.id}`}>
                  <select id={`mentor-${s.id}`} name="mentorId" className={inputClass} defaultValue="">
                    <option value="">No mentor yet</option>
                    {mentors.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={pending} className={buttonClass}>
                  {pending ? "Confirming…" : "Confirm and open engagement"}
                </button>
                <button type="button" disabled={pending} className={secondaryButtonClass}
                  onClick={(e) => decide(e.currentTarget.form as HTMLFormElement, "REJECT")}>
                  Decline
                </button>
                <button type="button" className={secondaryButtonClass} onClick={() => setOpenId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </form>
      ))}
    </div>
  );
}
