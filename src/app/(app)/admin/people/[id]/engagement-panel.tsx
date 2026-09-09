"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeEngagementAction, createEngagementAction } from "@/app/actions/admin";
import { formatIstDate } from "@/lib/ist";
import {
  buttonClass,
  ErrorNote,
  Field,
  inputClass,
  secondaryButtonClass,
  StatusPill,
} from "@/components/ui";

type Engagement = {
  id: string;
  type: "INTERNSHIP" | "EMPLOYMENT";
  designation: string;
  teamName: string | null;
  status: "UPCOMING" | "ACTIVE" | "COMPLETED" | "TERMINATED";
  workMode: "ONSITE" | "REMOTE" | "HYBRID" | null;
  startDate: string;
  endDate: string | null;
  mentorName: string | null;
};

/**
 * The engagement stack.
 *
 * Closing one and opening another is how an intern becomes an employee. It is
 * two deliberate steps against the same person, never a new person record —
 * their id, their logs and their history all stay where they are.
 */
export function EngagementPanel({
  personId,
  engagements,
  mentorCandidates,
  hasOpenEngagement,
}: {
  personId: string;
  engagements: Engagement[];
  mentorCandidates: { id: string; label: string }[];
  hasOpenEngagement: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);

  function submit(
    action: (data: FormData) => Promise<{ ok: boolean; message?: string }>,
    form: HTMLFormElement,
    onDone: () => void,
  ) {
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await action(data);
      if (!result.ok) {
        setError(result.message ?? "Something went wrong.");
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink-900">Engagements</h2>
        {!hasOpenEngagement && !adding ? (
          <button type="button" className={secondaryButtonClass} onClick={() => setAdding(true)}>
            Open an engagement
          </button>
        ) : null}
      </div>

      {hasOpenEngagement ? (
        <p className="mb-3 text-sm text-ink-500">
          Close the open engagement before opening the next one.
        </p>
      ) : null}

      {error ? <div className="mb-3"><ErrorNote>{error}</ErrorNote></div> : null}

      {adding ? (
        <form
          className="mb-4 space-y-4 rounded-lg border border-cream-300 bg-cream-50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(createEngagementAction, event.currentTarget, () => setAdding(false));
          }}
        >
          <input type="hidden" name="personId" value={personId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="type">
              <select id="type" name="type" required className={inputClass} defaultValue="INTERNSHIP">
                <option value="INTERNSHIP">Internship</option>
                <option value="EMPLOYMENT">Employment</option>
              </select>
            </Field>

            <Field label="Designation" htmlFor="designation">
              <input id="designation" name="designation" required className={inputClass} />
            </Field>

            <Field label="Department" htmlFor="department">
              <input id="department" name="department" className={inputClass} />
            </Field>

            <Field label="Start date" htmlFor="startDate">
              <input id="startDate" name="startDate" type="date" required className={inputClass} />
            </Field>

            <Field label="Mentor" htmlFor="mentorId">
              <select id="mentorId" name="mentorId" className={inputClass} defaultValue="">
                <option value="">No mentor yet</option>
                {mentorCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Work mode" htmlFor="workMode">
              <select id="workMode" name="workMode" className={inputClass} defaultValue="">
                <option value="">Not specified</option>
                <option value="ONSITE">Onsite</option>
                <option value="REMOTE">Remote</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={buttonClass}>
              {pending ? "Opening…" : "Open engagement"}
            </button>
            <button type="button" className={secondaryButtonClass} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {engagements.length === 0 ? (
        <p className="rounded-lg border border-dashed border-cream-300 bg-cream-50 px-4 py-8 text-center text-sm text-ink-500">
          No engagements yet. Open one so this person can start logging work.
        </p>
      ) : (
        <ul className="space-y-3">
          {engagements.map((engagement) => {
            const open = engagement.status === "ACTIVE" || engagement.status === "UPCOMING";
            return (
              <li key={engagement.id} className="rounded-lg border border-cream-300 bg-cream-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink-900">{engagement.designation}</p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {engagement.type === "INTERNSHIP" ? "Internship" : "Employment"}
                      {engagement.teamName ? ` · ${engagement.teamName}` : ""}
                      {engagement.workMode ? ` · ${engagement.workMode.toLowerCase()}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-ink-500">
                      {formatIstDate(engagement.startDate)} —{" "}
                      {engagement.endDate ? formatIstDate(engagement.endDate) : "present"}
                      {engagement.mentorName ? ` · mentor ${engagement.mentorName}` : ""}
                    </p>
                  </div>
                  <StatusPill status={engagement.status} />
                </div>

                {open ? (
                  closingId === engagement.id ? (
                    <form
                      className="mt-4 space-y-3 border-t border-cream-300 pt-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        submit(closeEngagementAction, event.currentTarget, () => setClosingId(null));
                      }}
                    >
                      <input type="hidden" name="engagementId" value={engagement.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="End date" htmlFor={`end-${engagement.id}`}>
                          <input
                            id={`end-${engagement.id}`}
                            name="endDate"
                            type="date"
                            required
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Outcome" htmlFor={`status-${engagement.id}`}>
                          <select
                            id={`status-${engagement.id}`}
                            name="status"
                            className={inputClass}
                            defaultValue="COMPLETED"
                          >
                            <option value="COMPLETED">Completed</option>
                            <option value="TERMINATED">Terminated</option>
                          </select>
                        </Field>
                      </div>
                      <p className="text-xs text-ink-500">
                        The engagement is kept, not deleted. Every work log filed against it stays
                        attached to this person.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={pending} className={buttonClass}>
                          {pending ? "Closing…" : "Close engagement"}
                        </button>
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          onClick={() => setClosingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className={`${secondaryButtonClass} mt-3`}
                      onClick={() => setClosingId(engagement.id)}
                    >
                      Close this engagement
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
