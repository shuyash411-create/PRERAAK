"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOnboarding } from "@/app/actions/onboarding";
import { buttonClass, ErrorNote, Field, inputClass } from "@/components/ui";

export function OnboardingForm({
  teams,
  today,
  defaultValues,
}: {
  teams: { id: string; name: string }[];
  today: string;
  defaultValues: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await saveOnboarding(data);
          if (!result.ok) {
            setError(result.message);
            return;
          }
          router.refresh();
        });
      }}
    >
      <Field label="Preferred name" hint="What you like to be called." htmlFor="preferredName">
        <input id="preferredName" name="preferredName" defaultValue={defaultValues.preferredName}
          autoFocus className={inputClass} />
      </Field>

      <Field label="Phone" htmlFor="phone">
        <input id="phone" name="phone" type="tel" inputMode="tel"
          defaultValue={defaultValues.phone} className={inputClass} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="College" htmlFor="college">
          <input id="college" name="college" defaultValue={defaultValues.college} className={inputClass} />
        </Field>
        <Field label="Course" htmlFor="course">
          <input id="course" name="course" defaultValue={defaultValues.course} className={inputClass} />
        </Field>
      </div>

      <Field label="Graduation year" htmlFor="graduationYear">
        <input id="graduationYear" name="graduationYear" type="number" inputMode="numeric"
          min={1950} max={2100} defaultValue={defaultValues.graduationYear}
          className={`${inputClass} max-w-40`} />
      </Field>

      <div className="rounded-lg border border-cream-300 bg-cream-50 p-4 space-y-4">
        <p className="text-sm text-ink-500">
          An admin confirms the three below before your engagement opens.
        </p>

        <Field label="Which team are you joining?" htmlFor="requestedTeamId">
          <select id="requestedTeamId" name="requestedTeamId" className={inputClass}
            defaultValue={defaultValues.requestedTeamId}>
            <option value="">Not sure yet</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Designation" hint="For example, Engineering Intern." htmlFor="requestedDesignation">
          <input id="requestedDesignation" name="requestedDesignation" required
            defaultValue={defaultValues.requestedDesignation} className={inputClass} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Joining as" htmlFor="requestedType">
            <select id="requestedType" name="requestedType" className={inputClass}
              defaultValue={defaultValues.requestedType}>
              <option value="INTERNSHIP">Intern</option>
              <option value="EMPLOYMENT">Employee</option>
            </select>
          </Field>

          <Field label="Start date" htmlFor="proposedStartDate">
            <input id="proposedStartDate" name="proposedStartDate" type="date" required
              defaultValue={defaultValues.proposedStartDate || today} className={inputClass} />
          </Field>
        </div>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <button type="submit" disabled={pending} className={`${buttonClass} w-full sm:w-auto`}>
        {pending ? "Sending…" : "Send for confirmation"}
      </button>
    </form>
  );
}
