import { istDateString, istDaysBetween, type IstDate } from "@/lib/ist";

/**
 * How long it has been since somebody last logged work.
 *
 * A fact about the calendar, exactly like `dueState` in `src/lib/task-progress.ts`
 * — never about the time of day, per section 1.2 of the brief. "No log in 5
 * days" says something worth an admin's attention; what hour yesterday's log
 * was filed at never does.
 */
export type LastActivityState = {
  label: string;
  /** True once nothing has been logged in a while. Not an error state — a
   *  fact for an admin to notice, not a flag on the person. */
  stale: boolean;
  days: number | null;
};

const STALE_AFTER_DAYS = 3;

export function lastActivityState(
  lastLogDate: IstDate | null,
  today = istDateString(),
): LastActivityState {
  if (!lastLogDate) {
    return { label: "Nothing logged yet", stale: true, days: null };
  }

  const days = istDaysBetween(lastLogDate, today);

  if (days <= 0) return { label: "Logged today", stale: false, days };
  if (days === 1) return { label: "Logged yesterday", stale: false, days };
  return {
    label: `No log in ${days} days`,
    stale: days >= STALE_AFTER_DAYS,
    days,
  };
}
