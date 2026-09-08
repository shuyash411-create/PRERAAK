import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearDevSignInLink,
  devSignInLinkEnabled,
  readDevSignInLink,
  rememberDevSignInLink,
} from "@/lib/dev-signin-link";

/**
 * The dev sign-in link is the one place a sign-in URL is shown in the
 * interface. These tests exist to prove the gate closes — a regression here
 * would put working sign-in links on a page in a real deployment.
 */

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
const originalResendKey = env.RESEND_API_KEY;

function setEnv(nodeEnv: string, resendKey: string | undefined) {
  env.NODE_ENV = nodeEnv;
  if (resendKey === undefined) delete env.RESEND_API_KEY;
  else env.RESEND_API_KEY = resendKey;
}

beforeEach(() => clearDevSignInLink());

afterEach(() => {
  setEnv(originalNodeEnv ?? "test", originalResendKey);
  clearDevSignInLink();
});

describe("the gate", () => {
  it("is open only in development with no email service configured", () => {
    setEnv("development", undefined);
    expect(devSignInLinkEnabled()).toBe(true);

    setEnv("development", "");
    expect(devSignInLinkEnabled()).toBe(true);
  });

  it("is closed in production, with or without a key", () => {
    setEnv("production", undefined);
    expect(devSignInLinkEnabled()).toBe(false);

    setEnv("production", "re_live_key");
    expect(devSignInLinkEnabled()).toBe(false);
  });

  it("is closed whenever an email service is configured", () => {
    setEnv("development", "re_live_key");
    expect(devSignInLinkEnabled()).toBe(false);

    setEnv("test", "re_live_key");
    expect(devSignInLinkEnabled()).toBe(false);
  });
});

describe("storing and reading", () => {
  it("round-trips a link while the gate is open", () => {
    setEnv("development", undefined);
    rememberDevSignInLink("meera@dev.local", "http://localhost:3000/callback?token=abc");

    expect(readDevSignInLink()).toEqual({
      email: "meera@dev.local",
      url: "http://localhost:3000/callback?token=abc",
    });
  });

  it("stores nothing at all when the gate is closed", () => {
    setEnv("production", "re_live_key");
    rememberDevSignInLink("meera@dev.local", "http://example.com/callback?token=secret");

    // Re-open the gate: if the write had happened, the link would surface now.
    setEnv("development", undefined);
    expect(readDevSignInLink()).toBeNull();
  });

  it("refuses to return a link stored before the gate closed", () => {
    setEnv("development", undefined);
    rememberDevSignInLink("meera@dev.local", "http://localhost:3000/callback?token=abc");
    expect(readDevSignInLink()).not.toBeNull();

    // A deployment that later gets a Resend key must stop showing it.
    setEnv("production", "re_live_key");
    expect(readDevSignInLink()).toBeNull();

    setEnv("development", "re_live_key");
    expect(readDevSignInLink()).toBeNull();
  });

  it("returns nothing before any link has been requested", () => {
    setEnv("development", undefined);
    expect(readDevSignInLink()).toBeNull();
  });

  it("keeps only the most recent link", () => {
    setEnv("development", undefined);
    rememberDevSignInLink("first@dev.local", "http://localhost:3000/a");
    rememberDevSignInLink("second@dev.local", "http://localhost:3000/b");

    expect(readDevSignInLink()?.email).toBe("second@dev.local");
  });
});
