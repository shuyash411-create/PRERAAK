"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveWeeklyReport, submitWeeklyReport } from "@/app/actions/work-log";
import { buttonClass, ErrorNote, Field, inputClass, secondaryButtonClass } from "@/components/ui";

export function WeeklyForm({
  defaultValues,
}: {
  defaultValues: {
    workCompleted: string;
    deliverables: string;
    challenges: string;
    learning: string;
    nextWeekPlan: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function run(
    action: (data: FormData) => Promise<{ ok: boolean; message?: string }>,
    form: HTMLFormElement,
  ) {
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
      <Field label="What you worked on this week" htmlFor="workCompleted">
        <textarea
          id="workCompleted"
          name="workCompleted"
          required
          rows={4}
          autoFocus
          defaultValue={defaultValues.workCompleted}
          className={inputClass}
        />
      </Field>

      <Field label="Deliverables" hint="Anything finished and handed over." htmlFor="deliverables">
        <textarea
          id="deliverables"
          name="deliverables"
          rows={3}
          defaultValue={defaultValues.deliverables}
          className={inputClass}
        />
      </Field>

      <Field label="Challenges" htmlFor="challenges">
        <textarea
          id="challenges"
          name="challenges"
          rows={3}
          defaultValue={defaultValues.challenges}
          className={inputClass}
        />
      </Field>

      <Field label="What you learned" htmlFor="learning">
        <textarea
          id="learning"
          name="learning"
          rows={3}
          defaultValue={defaultValues.learning}
          className={inputClass}
        />
      </Field>

      <Field label="Plan for next week" htmlFor="nextWeekPlan">
        <textarea
          id="nextWeekPlan"
          name="nextWeekPlan"
          rows={3}
          defaultValue={defaultValues.nextWeekPlan}
          className={inputClass}
        />
      </Field>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {saved && !confirming ? (
        <p role="status" className="text-sm text-forest-700">
          Draft saved.
        </p>
      ) : null}

      {confirming ? (
        <div className="space-y-3 rounded-md border border-forest-200 bg-forest-50 p-4">
          <p className="text-sm text-ink-900">
            Submit this week&rsquo;s report? <strong>Submitted reports cannot be edited.</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className={buttonClass}
              onClick={(event) => run(submitWeeklyReport, event.currentTarget.form as HTMLFormElement)}
            >
              {pending ? "Submitting…" : "Yes, submit"}
            </button>
            <button type="button" className={secondaryButtonClass} onClick={() => setConfirming(false)}>
              Keep editing
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={buttonClass}>
            Submit weekly report
          </button>
          <button
            type="button"
            disabled={pending}
            className={secondaryButtonClass}
            onClick={(event) => run(saveWeeklyReport, event.currentTarget.form as HTMLFormElement)}
          >
            Save draft
          </button>
        </div>
      )}
    </form>
  );
}
