import { describe, expect, it } from "vitest";
import {
  addIstDays,
  formatIstDate,
  isIstDate,
  istDateString,
  istDateToUtcMidnight,
  istDayRangeUtc,
  istDaysBetween,
  istTimeString,
  istWeekBounds,
} from "@/lib/ist";

describe("IST calendar dates", () => {
  it("files a 01:30 IST submission against that IST date, not the previous UTC one", () => {
    // 01:30 IST on 4 Sep 2026 is 20:00 UTC on 3 Sep 2026.
    const instant = new Date("2026-09-03T20:00:00.000Z");

    expect(istDateString(instant)).toBe("2026-09-04");
    expect(istTimeString(instant)).toBe("01:30");
    // The naive implementation this guards against:
    expect(instant.toISOString().slice(0, 10)).toBe("2026-09-03");
  });

  it("keeps a 23:30 IST submission on the same IST date", () => {
    // 23:30 IST on 4 Sep 2026 is 18:00 UTC on 4 Sep 2026.
    const instant = new Date("2026-09-04T18:00:00.000Z");
    expect(istDateString(instant)).toBe("2026-09-04");
    expect(istTimeString(instant)).toBe("23:30");
  });

  it("rolls over at exactly 00:00 IST and not before", () => {
    // 18:29:59 UTC is 23:59:59 IST on the 3rd; 18:30:00 UTC is 00:00 on the 4th.
    expect(istDateString(new Date("2026-09-03T18:29:59.999Z"))).toBe("2026-09-03");
    expect(istDateString(new Date("2026-09-03T18:30:00.000Z"))).toBe("2026-09-04");
  });

  it("handles month, year and leap-day boundaries", () => {
    expect(istDateString(new Date("2026-12-31T18:30:00.000Z"))).toBe("2027-01-01");
    expect(istDateString(new Date("2024-02-28T18:30:00.000Z"))).toBe("2024-02-29");
    expect(istDateString(new Date("2026-02-28T18:30:00.000Z"))).toBe("2026-03-01");
  });
});

describe("istDayRangeUtc", () => {
  it("covers exactly one IST day as a half-open UTC interval", () => {
    const { gte, lt } = istDayRangeUtc("2026-09-04");
    expect(gte.toISOString()).toBe("2026-09-03T18:30:00.000Z");
    expect(lt.toISOString()).toBe("2026-09-04T18:30:00.000Z");
  });

  it("includes a 01:30 IST instant in the day it belongs to", () => {
    const instant = new Date("2026-09-03T20:00:00.000Z"); // 01:30 IST on the 4th
    const { gte, lt } = istDayRangeUtc("2026-09-04");
    expect(instant >= gte && instant < lt).toBe(true);

    const previous = istDayRangeUtc("2026-09-03");
    expect(instant >= previous.gte && instant < previous.lt).toBe(false);
  });
});

describe("date arithmetic", () => {
  it("adds and subtracts whole days across month ends", () => {
    expect(addIstDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addIstDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(addIstDays("2026-09-04", 30)).toBe("2026-10-04");
  });

  it("counts days between dates", () => {
    expect(istDaysBetween("2026-09-04", "2026-10-04")).toBe(30);
    expect(istDaysBetween("2026-10-04", "2026-09-04")).toBe(-30);
    expect(istDaysBetween("2026-09-04", "2026-09-04")).toBe(0);
  });
});

describe("istWeekBounds", () => {
  it("runs Monday to Sunday in IST", () => {
    // 4 Sep 2026 is a Friday.
    const friday = istWeekBounds(new Date("2026-09-04T06:00:00.000Z"));
    expect(friday).toEqual({ weekStart: "2026-08-31", weekEnd: "2026-09-06" });
  });

  it("puts a Monday in its own week and a Sunday at the end of the previous one", () => {
    expect(istWeekBounds(new Date("2026-08-31T06:00:00.000Z")).weekStart).toBe("2026-08-31");
    expect(istWeekBounds(new Date("2026-09-06T06:00:00.000Z"))).toEqual({
      weekStart: "2026-08-31",
      weekEnd: "2026-09-06",
    });
  });

  it("uses the IST date when the UTC date differs", () => {
    // 20:00 UTC Sunday 6 Sep is 01:30 IST Monday 7 Sep — a new week.
    expect(istWeekBounds(new Date("2026-09-06T20:00:00.000Z")).weekStart).toBe("2026-09-07");
  });
});

describe("validation and formatting", () => {
  it("accepts real dates and rejects malformed or impossible ones", () => {
    expect(isIstDate("2026-09-04")).toBe(true);
    expect(isIstDate("2024-02-29")).toBe(true);
    expect(isIstDate("2026-02-30")).toBe(false);
    expect(isIstDate("2026-13-01")).toBe(false);
    expect(isIstDate("04-09-2026")).toBe(false);
    expect(isIstDate("2026-9-4")).toBe(false);
    expect(isIstDate("")).toBe(false);
  });

  it("maps a date to the UTC midnight Postgres stores for a date column", () => {
    expect(istDateToUtcMidnight("2026-09-04").toISOString()).toBe("2026-09-04T00:00:00.000Z");
    expect(() => istDateToUtcMidnight("2026-02-30")).toThrow(RangeError);
  });

  it("formats dates for display", () => {
    expect(formatIstDate("2026-09-04")).toBe("4 Sep 2026");
    expect(formatIstDate(new Date("2026-01-15T00:00:00.000Z"))).toBe("15 Jan 2026");
  });
});
