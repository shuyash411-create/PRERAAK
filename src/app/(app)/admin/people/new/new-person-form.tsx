"use client";

import { useState, useTransition } from "react";
import { createPersonAction } from "@/app/actions/admin";
import { buttonClass, ErrorNote, Field, inputClass } from "@/components/ui";

/**
 * Only the fields section 6 of the brief allows. No Aadhaar, PAN, bank
 * details, address, date of birth, gender or salary: under the DPDP Act each
 * one is an obligation, and none of them help anyone do their job here.
 */
export function NewPersonForm() {
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
          const result = await createPersonAction(data);
          if (result && !result.ok) setError(result.message);
        });
      }}
    >
      <Field label="Full name" htmlFor="fullName">
        <input id="fullName" name="fullName" required autoFocus className={inputClass} />
      </Field>

      <Field label="Preferred name" hint="What they like to be called." htmlFor="preferredName">
        <input id="preferredName" name="preferredName" className={inputClass} />
      </Field>

      <Field
        label="Email address"
        hint="Sign-in links go here. It must be one they can read."
        htmlFor="email"
      >
        <input id="email" name="email" type="email" required className={inputClass} />
      </Field>

      <Field label="Phone" htmlFor="phone">
        <input id="phone" name="phone" type="tel" inputMode="tel" className={inputClass} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="College" htmlFor="college">
          <input id="college" name="college" className={inputClass} />
        </Field>

        <Field label="Course" htmlFor="course">
          <input id="course" name="course" className={inputClass} />
        </Field>
      </div>

      <Field label="Graduation year" htmlFor="graduationYear">
        <input
          id="graduationYear"
          name="graduationYear"
          type="number"
          inputMode="numeric"
          min={1950}
          max={2100}
          className={`${inputClass} max-w-40`}
        />
      </Field>

      <div className="flex items-start gap-2.5 rounded-md border border-cream-300 bg-cream-50 p-3">
        <input id="isAdmin" name="isAdmin" type="checkbox" className="mt-1 size-4" />
        <label htmlFor="isAdmin" className="text-sm text-ink-900">
          Make this person an admin
          <span className="mt-0.5 block text-xs text-ink-500">
            Admins can see and change everybody&rsquo;s records. Give this to as few people as
            possible.
          </span>
        </label>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Adding…" : "Add person"}
      </button>
    </form>
  );
}
