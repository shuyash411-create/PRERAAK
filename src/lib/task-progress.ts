import { istDateString, istDaysBetween, type IstDate } from "@/lib/ist";

/**
 * How a deadline reads to a human.
 *
 * This is a fact about a date somebody agreed to, not a judgement about when
 * they worked. Section 1.2 of the brief still holds absolutely: nothing here
 * looks at the time of day, and a task handed in at 01:30 is described exactly
 * like one handed in at noon.
 */
export type DueState = {
  label: string;
  /** True only past the deadline, and only while still unsubmitted. */
  overdue: boolean;
  days: number;
};

export function dueState(dueDate: IstDate, submitted: boolean, today = istDateString()): DueState {
  const days = istDaysBetween(today, dueDate);

  if (submitted) {
    return { label: "Submitted", overdue: false, days };
  }
  if (days < 0) {
    const n = Math.abs(days);
    return { label: `${n} day${n === 1 ? "" : "s"} overdue`, overdue: true, days };
  }
  if (days === 0) return { label: "Due today", overdue: false, days };
  if (days === 1) return { label: "Due tomorrow", overdue: false, days };
  return { label: `Due in ${days} days`, overdue: false, days };
}
