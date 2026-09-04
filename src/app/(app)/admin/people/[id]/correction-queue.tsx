"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideCorrectionAction } from "@/app/actions/admin";
import { buttonClass, ErrorNote, secondaryButtonClass } from "@/components/ui";

type Correction = {
  id: string;
  targetType: "WORK_LOG" | "WEEKLY_REPORT";
  reason: string;
  proposedValue: unknown;
  createdAt: Date;
};

/**
 * Pending corrections.
 *
 * Approving one applies the proposal and keeps the previous value in the same
 * transaction, so the earlier version is never lost.
 */
export function CorrectionQueue({ corrections }: { corrections: Correction[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(correctionId: string, decision: "APPROVE" | "REJECT") {
    const data = new FormData();
    data.set("correctionId", correctionId);
    data.set("decision", decision);
    setError(null);
    startTransition(async () => {
      const result = await decideCorrectionAction(data);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-ink-900">
        Corrections waiting for a decision
      </h2>

      {error ? <div className="mb-3"><ErrorNote>{error}</ErrorNote></div> : null}

      <ul className="space-y-3">
        {corrections.map((correction) => {
          const proposed = correction.proposedValue as Record<string, string> | null;
          return (
            <li key={correction.id} className="rounded-lg border border-cream-300 bg-cream-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                {correction.targetType === "WORK_LOG" ? "Work log" : "Weekly report"}
              </p>

              <p className="mt-2 text-sm text-ink-900">
                <span className="text-ink-500">Reason: </span>
                {correction.reason}
              </p>

              {proposed
                ? Object.entries(proposed).map(([field, value]) => (
                    <p key={field} className="mt-2 text-sm text-ink-900">
                      <span className="text-ink-500">Proposed {field}: </span>
                      {String(value)}
                    </p>
                  ))
                : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  className={buttonClass}
                  onClick={() => decide(correction.id, "APPROVE")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className={secondaryButtonClass}
                  onClick={() => decide(correction.id, "REJECT")}
                >
                  Decline
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
