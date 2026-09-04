/**
 * Asia/Kolkata date handling.
 *
 * Every timestamp is stored in UTC. Every date a human sees or files work
 * against is an IST calendar date. India has had no daylight saving since 1945
 * and a single nationwide offset, so a fixed +05:30 is correct and avoids
 * pulling a timezone database into the request path.
 *
 * The rule that matters: a work log submitted at 01:30 IST belongs to THAT IST
 * calendar date, not the previous UTC one. 01:30 IST on 4 September is
 * 20:00 UTC on 3 September; `new Date().toISOString().slice(0, 10)` would file
 * it against the 3rd and quietly corrupt a month of records.
 *
 * Nothing outside this module may derive a date string from a Date. A test
 * greps the source tree to keep that true.
 */

/** Asia/Kolkata is UTC+05:30, year-round, with no DST. */
export const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

/** A calendar date with no time and no zone, as `YYYY-MM-DD`. */
export type IstDate = string;

const IST_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The IST calendar date an instant falls on. */
export function istDateString(instant: Date = new Date()): IstDate {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The IST wall-clock time an instant falls on, as `HH:MM`. Display only. */
export function istTimeString(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}

export function isIstDate(value: string): value is IstDate {
  if (!IST_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * A `YYYY-MM-DD` as the UTC midnight Postgres stores for a `date` column.
 * Prisma maps `@db.Date` to a Date pinned at UTC midnight, so a date column is
 * written and read at that instant and never shifted into local time.
 */
export function istDateToUtcMidnight(date: IstDate): Date {
  if (!isIstDate(date)) throw new RangeError(`Not an IST calendar date: ${date}`);
  return new Date(`${date}T00:00:00.000Z`);
}

/** The inverse: a `@db.Date` value back to `YYYY-MM-DD`. */
export function utcMidnightToIstDate(value: Date): IstDate {
  return value.toISOString().slice(0, 10);
}

/**
 * The UTC half-open interval `[start, end)` covering one IST calendar day.
 * Use for querying timestamp columns by IST date.
 */
export function istDayRangeUtc(date: IstDate): { gte: Date; lt: Date } {
  const startOfDayIst = istDateToUtcMidnight(date).getTime() - IST_OFFSET_MS;
  return {
    gte: new Date(startOfDayIst),
    lt: new Date(startOfDayIst + 24 * 60 * 60 * 1000),
  };
}

/** Shift an IST calendar date by whole days. */
export function addIstDays(date: IstDate, days: number): IstDate {
  const shifted = istDateToUtcMidnight(date).getTime() + days * 24 * 60 * 60 * 1000;
  return new Date(shifted).toISOString().slice(0, 10);
}

/**
 * The IST week an instant falls in. Weeks run Monday to Sunday, which is what
 * a Friday digest and a Monday-morning weekly report both assume.
 */
export function istWeekBounds(instant: Date = new Date()): {
  weekStart: IstDate;
  weekEnd: IstDate;
} {
  const today = istDateString(instant);
  // getUTCDay on the UTC-midnight form gives the IST weekday: 0 = Sunday.
  const weekday = istDateToUtcMidnight(today).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const weekStart = addIstDays(today, -daysSinceMonday);
  return { weekStart, weekEnd: addIstDays(weekStart, 6) };
}

/** Whole days between two IST calendar dates (`to - from`). */
export function istDaysBetween(from: IstDate, to: IstDate): number {
  const ms = istDateToUtcMidnight(to).getTime() - istDateToUtcMidnight(from).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** `4 Sep 2026`, for display. */
export function formatIstDate(date: IstDate | Date): string {
  const value = typeof date === "string" ? date : utcMidnightToIstDate(date);
  const [year, month, day] = value.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/**
 * `4 Sep 2026` for a stored timestamp, in IST.
 *
 * Deliberately date-only. Section 1.2 of the brief: PRERAAK people work
 * mornings, nights, 2 AM and weekends, and a submission time is never a
 * signal. Rendering the clock time invites exactly the judgement this system
 * refuses to make, so the display helpers do not offer it.
 */
export function formatIstTimestamp(instant: Date): string {
  return formatIstDate(istDateString(instant));
}
