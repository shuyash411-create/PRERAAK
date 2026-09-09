"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSubmission, submitAssignment } from "@/app/actions/task";
import { buttonClass, ErrorNote, Field, inputClass, secondaryButtonClass } from "@/components/ui";

export function SubmissionForm({
  assignmentId,
  defaultNote,
}: {
  assignmentId: string;
  defaultNote: string;
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
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setConfirming(true);
      }}
    >
      <input type="hidden" name="assignmentId" value={assignmentId} />

      <Field label="What did you do?" hint="A short note is enough." htmlFor="submissionNote">
        <textarea
          id="submissionNote"
          name="submissionNote"
          rows={4}
          required
          autoFocus
          defaultValue={defaultNote}
          className={inputClass}
        />
      </Field>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {saved && !confirming ? (
        <p role="status" className="text-sm text-forest-700">Saved.</p>
      ) : null}

      {confirming ? (
        <div className="space-y-3 rounded-md border border-forest-200 bg-forest-50 p-4">
          <p className="text-sm text-ink-900">
            Hand this in? <strong>Submitted work cannot be edited</strong> — changing it afterwards
            means asking an admin for a correction.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className={buttonClass}
              onClick={(e) => run(submitAssignment, e.currentTarget.form as HTMLFormElement)}
            >
              {pending ? "Submitting…" : "Yes, hand it in"}
            </button>
            <button type="button" className={secondaryButtonClass} onClick={() => setConfirming(false)}>
              Keep editing
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={buttonClass}>
            Hand in
          </button>
          <button
            type="button"
            disabled={pending}
            className={secondaryButtonClass}
            onClick={(e) => run(saveSubmission, e.currentTarget.form as HTMLFormElement)}
          >
            Save draft
          </button>
        </div>
      )}
    </form>
  );
}
