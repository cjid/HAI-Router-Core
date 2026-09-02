import { describe, it, expect } from "vitest";
import { serializeBodyForGoTransport } from "../../src/lib/goEngine/serializeBodyForGoTransport.js";

describe("serializeBodyForGoTransport", () => {
  it("preserves URLSearchParams OAuth form body", () => {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "abc 123",
      redirect_uri: "http://localhost/callback",
    });

    const serialized = serializeBodyForGoTransport(body, {
      "Content-Type": "application/x-www-form-urlencoded",
    });

    const parsed = new URLSearchParams(serialized);
    expect(parsed.get("grant_type")).toBe("authorization_code");
    expect(parsed.get("code")).toBe("abc 123");
    expect(parsed.get("redirect_uri")).toBe("http://localhost/callback");
    expect(serialized).not.toBe("{}");
    expect(serialized).not.toContain("[object Object]");
  });

  it("preserves JSON string bodies unchanged", () => {
    const json = JSON.stringify({ metadata: { tier: "free" } });
    expect(serializeBodyForGoTransport(json, { "Content-Type": "application/json" })).toBe(json);
  });

  it("returns empty string for null/undefined", () => {
    expect(serializeBodyForGoTransport(null)).toBe("");
    expect(serializeBodyForGoTransport(undefined)).toBe("");
  });

  it("rejects plain objects instead of silently JSON-encoding", () => {
    expect(() =>
      serializeBodyForGoTransport({ grant_type: "authorization_code" }, {
        "Content-Type": "application/x-www-form-urlencoded",
      })
    ).toThrow(/Plain object bodies are not supported/);
  });

  it("encodes special OAuth characters via URLSearchParams", () => {
    const body = new URLSearchParams({
      code_verifier: "a+b/c=d?&",
      redirect_uri: "http://localhost:20127/oauth/callback?x=1",
    });
    const serialized = serializeBodyForGoTransport(body);
    const parsed = new URLSearchParams(serialized);
    expect(parsed.get("code_verifier")).toBe("a+b/c=d?&");
    expect(parsed.get("redirect_uri")).toBe("http://localhost:20127/oauth/callback?x=1");
  });
});
