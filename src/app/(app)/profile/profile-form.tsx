"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOwnProfile } from "@/app/actions/profile";
import { buttonClass, ErrorNote, Field, inputClass, secondaryButtonClass } from "@/components/ui";

/**
 * Your own details.
 *
 * Team, designation and PRERAAK id are not here: they are engagement facts an
 * admin sets, and they are what progress is grouped by. Email is not here
 * either — it is how you sign in.
 */
export function ProfileForm({
  defaultValues,
}: {
  defaultValues: {
    preferredName: string; phone: string; college: string; course: string; graduationYear: string;
  };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button type="button" className={secondaryButtonClass} onClick={() => setEditing(true)}>
        Edit my details
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-lg border border-cream-300 bg-cream-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await updateOwnProfile(data);
          if (!result.ok) {
            setError(result.message);
            return;
          }
          setEditing(false);
          router.refresh();
        });
      }}
    >
      <Field label="Preferred name" htmlFor="preferredName">
        <input id="preferredName" name="preferredName" defaultValue={defaultValues.preferredName}
          autoFocus className={inputClass} />
      </Field>

      <Field label="Phone" htmlFor="phone">
        <input id="phone" name="phone" type="tel" inputMode="tel"
          defaultValue={defaultValues.phone} className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
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

      <p className="text-xs text-ink-500">
        Your team, designation and PRERAAK id are set by an admin — ask them if one is wrong.
      </p>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
