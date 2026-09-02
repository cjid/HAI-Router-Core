import { describe, expect, it } from "vitest";
import { normalizeModelTestError } from "../../src/shared/utils/modelTestError.js";

describe("model test error presentation", () => {
  it("keeps the actual HTTP status and provider message", () => {
    expect(normalizeModelTestError({
      status: 410,
      message: "The requested route is temporarily unavailable.",
    })).toMatchObject({
      httpStatus: 410,
      providerMessage: "The requested route is temporarily unavailable.",
      retryScheduled: false,
    });
  });

  it("only exposes retry state supplied by an actual scheduled retry", () => {
    expect(normalizeModelTestError({
      status: 429,
      message: "Too many requests",
      retryAfterMs: 2400,
    }).retryScheduled).toBe(false);

    expect(normalizeModelTestError({
      status: 429,
      message: "Too many requests",
      retryAt: "2026-09-02T15:00:02.400Z",
      retryAttempt: 2,
      retryMaxAttempts: 3,
    })).toMatchObject({
      retryScheduled: true,
      retryAttempt: 2,
      retryMaxAttempts: 3,
      retryAt: "2026-09-02T15:00:02.400Z",
    });
  });

  it("redacts credentials from provider and connection errors", () => {
    const normalized = normalizeModelTestError({
      status: 403,
      message: "Authorization: Bearer secret-token access_token=abc123 client_secret=shh",
    });
    expect(normalized.providerMessage).not.toContain("secret-token");
    expect(normalized.providerMessage).not.toContain("abc123");
    expect(normalized.providerMessage).not.toContain("shh");
    expect(normalized.providerMessage).toContain("[redacted]");
  });
});
