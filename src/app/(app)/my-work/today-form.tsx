"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveWorkLog, submitWorkLog } from "@/app/actions/work-log";
import { buttonClass, ErrorNote, Field, inputClass, secondaryButtonClass } from "@/components/ui";

/**
 * Only the summary is required, and it is focused on load. Every other field
 * is a decision somebody has to make at 1 AM on a phone, and the sub-60-second
 * budget is worth more than a tidier record.
 */
export function TodayForm({
  defaultValues,
  hasDraft,
}: {
  defaultValues: { summary: string; workCompleted: string; blockers: string; nextStep: string };
  hasDraft: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function run(action: (data: FormData) => Promise<{ ok: boolean; message?: string }>, form: HTMLFormElement) {
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await action(data);
      if (!result.ok) {
        setError(result.message ?? "Something went wrong.");
        setConfirming(false);
        return;
      }
      setSaved(true);
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setConfirming(true);
      }}
    >
      <Field label="What did you work on?" htmlFor="summary">
        <textarea
          id="summary"
          name="summary"
          required
          rows={3}
          autoFocus
          maxLength={500}
          defaultValue={defaultValues.summary}
          placeholder="One or two lines is plenty."
          className={inputClass}
        />
      </Field>

      <details className="rounded-md border border-cream-300 bg-cream-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-700">
          Add more detail (optional)
        </summary>

        <div className="mt-4 space-y-4">
          <Field label="What you completed" htmlFor="workCompleted">
            <textarea
              id="workCompleted"
              name="workCompleted"
              rows={3}
              defaultValue={defaultValues.workCompleted}
              className={inputClass}
            />
          </Field>

          <Field label="Anything blocking you" htmlFor="blockers">
            <textarea
              id="blockers"
              name="blockers"
              rows={2}
              defaultValue={defaultValues.blockers}
              className={inputClass}
            />
          </Field>

          <Field label="What is next" htmlFor="nextStep">
            <textarea
              id="nextStep"
              name="nextStep"
              rows={2}
              defaultValue={defaultValues.nextStep}
              className={inputClass}
            />
          </Field>
        </div>
      </details>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {saved && !confirming ? (
        <p role="status" className="text-sm text-forest-700">
          Saved.
        </p>
      ) : null}

      {confirming ? (
        <div className="space-y-3 rounded-md border border-forest-200 bg-forest-50 p-4">
          <p className="text-sm text-ink-900">
            Submit today&rsquo;s work? <strong>Submitted entries cannot be edited</strong> — changing
            one afterwards means asking an admin for a correction.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className={buttonClass}
              onClick={(event) => run(submitWorkLog, event.currentTarget.form as HTMLFormElement)}
            >
              {pending ? "Submitting…" : "Yes, submit"}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setConfirming(false)}
            >
              Keep editing
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={`${buttonClass} flex-1 sm:flex-none`}>
            Submit today&rsquo;s work
          </button>
          <button
            type="button"
            disabled={pending}
            className={secondaryButtonClass}
            onClick={(event) => run(saveWorkLog, event.currentTarget.form as HTMLFormElement)}
          >
            {hasDraft ? "Save draft" : "Save for later"}
          </button>
        </div>
      )}
    </form>
  );
}
