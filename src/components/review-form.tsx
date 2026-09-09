"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewRecord } from "@/app/actions/review";
import { buttonClass, ErrorNote, Field, inputClass } from "@/components/ui";

/**
 * A mentor's or admin's comment on somebody else's submitted work.
 *
 * Shared across work logs, weekly reports and task assignments — the same
 * form, three call sites, one server action. Shown open rather than behind a
 * toggle: unlike a correction request, which is a rare exception on the
 * owner's own page, this usually *is* the reason a mentor is on the page.
 *
 * Existing comment pre-fills, so revising one shows what was said before,
 * ready to edit. Saving is never one-way the way submitting is — see
 * `src/lib/review.ts`.
 */
export function ReviewForm({
  targetType,
  targetId,
  revalidateTarget,
  existingComment,
}: {
  targetType: "WORK_LOG" | "WEEKLY_REPORT" | "TASK_ASSIGNMENT";
  targetId: string;
  revalidateTarget: string;
  existingComment: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="space-y-4 rounded-lg border border-forest-200 bg-forest-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await reviewRecord(data);
          if (!result.ok) {
            setError(result.message);
            return;
          }
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="revalidateTarget" value={revalidateTarget} />

      <Field
        label={existingComment ? "Your comment" : "Leave a comment"}
        hint="Only you and the person who wrote this can see it."
        htmlFor="mentorComment"
      >
        <textarea
          id="mentorComment"
          name="mentorComment"
          rows={3}
          required
          maxLength={2000}
          defaultValue={existingComment ?? ""}
          className={inputClass}
        />
      </Field>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {saved ? (
        <p role="status" className="text-sm text-forest-700">
          Saved.
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : existingComment ? "Update comment" : "Save comment"}
      </button>
    </form>
  );
}
