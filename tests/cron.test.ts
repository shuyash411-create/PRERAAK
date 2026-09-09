import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

// Cron routes carry no session at all — nothing to mock on @/lib/auth here,
// unlike every other test file. Their auth is a bearer secret, checked
// directly against process.env.CRON_SECRET.

import { db, resetDatabase } from "./helpers/db";
import { makeEngagement, makePerson, makeWorkLog } from "./helpers/factories";
import { istDateString } from "@/lib/ist";

import * as reminderRoute from "@/app/api/cron/friday-reminder/route";
import * as digestRoute from "@/app/api/cron/weekly-digest/route";

const ORIGINAL_SECRET = process.env.CRON_SECRET;

function request(secret: string | null): Request {
  return new Request("http://localhost:3000/api/cron/test", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(async () => {
  await resetDatabase();
  process.env.CRON_SECRET = "test-cron-secret";
});

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL_SECRET;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("cron route authentication", () => {
  it.each([
    ["friday-reminder", reminderRoute.GET],
    ["weekly-digest", digestRoute.GET],
  ])("%s refuses a request with no bearer token", async (_name, handler) => {
    const response = await handler(request(null));
    expect(response.status).toBe(401);
  });

  it.each([
    ["friday-reminder", reminderRoute.GET],
    ["weekly-digest", digestRoute.GET],
  ])("%s refuses the wrong bearer token", async (_name, handler) => {
    const response = await handler(request("not-the-secret"));
    expect(response.status).toBe(401);
  });

  it.each([
    ["friday-reminder", reminderRoute.GET],
    ["weekly-digest", digestRoute.GET],
  ])("%s refuses every request when CRON_SECRET is unset", async (_name, handler) => {
    delete process.env.CRON_SECRET;
    const response = await handler(request("anything"));
    expect(response.status).toBe(401);
  });

  it.each([
    ["friday-reminder", reminderRoute.GET],
    ["weekly-digest", digestRoute.GET],
  ])("%s accepts the correct bearer token", async (_name, handler) => {
    const response = await handler(request("test-cron-secret"));
    expect(response.status).toBe(200);
  });
});

describe("weekly digest content", () => {
  it("counts this week's submissions and who is missing a report", async () => {
    // isAdmin here is the recipient the digest counts and would email.
    await makePerson({ isAdmin: true });
    const a = await makePerson();
    const engagementA = await makeEngagement(a.id, { status: "ACTIVE" });
    await makeWorkLog(a.id, engagementA.id, { workDate: istDateString(), status: "SUBMITTED" });

    const response = await digestRoute.GET(request("test-cron-secret"));
    expect(response.status).toBe(200);

    const body = (await response.json()) as { workLogCount: number; recipientCount: number };
    expect(body.workLogCount).toBeGreaterThanOrEqual(1);
    expect(body.recipientCount).toBeGreaterThanOrEqual(1);
  });
});
