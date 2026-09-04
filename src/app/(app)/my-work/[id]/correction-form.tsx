"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestCorrection } from "@/app/actions/work-log";
import { buttonClass, ErrorNote, Field, inputClass, secondaryButtonClass } from "@/components/ui";

/**
 * The only route from a submitted entry to a changed one.
 *
 * It does not edit anything: it records what was proposed and why, for an
 * admin to decide. If they approve it, the original text is kept alongside the
 * new one.
 */
export function CorrectionForm({
  targetId,
  currentSummary,
}: {
  targetId: string;
  currentSummary: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="rounded-lg border border-cream-300 bg-cream-50 p-4">
        <p className="text-sm text-ink-500">
          Submitted entries cannot be edited. If something is wrong, ask for a correction — the
          original is kept either way.
        </p>
        <button type="button" className={`${secondaryButtonClass} mt-3`} onClick={() => setOpen(true)}>
          Request a correction
        </button>
      </div>
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
          const result = await requestCorrection(data);
          if (!result.ok) {
            setError(result.message);
            return;
          }
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="targetId" value={targetId} />

      <Field label="Corrected summary" htmlFor="correction-summary">
        <textarea
          id="correction-summary"
          name="summary"
          rows={3}
          required
          maxLength={500}
          defaultValue={currentSummary}
          className={inputClass}
        />
      </Field>

      <Field label="Why does it need changing?" htmlFor="correction-reason">
        <textarea
          id="correction-reason"
          name="reason"
          rows={2}
          required
          maxLength={1000}
          placeholder="A sentence is enough."
          className={inputClass}
        />
      </Field>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Sending…" : "Send for review"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
