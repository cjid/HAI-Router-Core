import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeCompletionOrigin,
  buildCustomProviderIconCandidates,
  getCompatibilityFallbackIconSrc,
  resolveCustomProviderCompatibility,
  getCustomProviderIconCacheKey,
  getCachedCustomProviderIcon,
  cacheResolvedCustomProviderIcon,
  cacheFallbackCustomProviderIcon,
  clearCustomProviderIconCache,
  isPrivateOrLocalHost,
  getRegistrableDomain,
} from "@/shared/utils/customProviderIcon";

describe("customProviderIcon", () => {
  beforeEach(() => {
    clearCustomProviderIconCache();
  });

  describe("normalizeCompletionOrigin", () => {
    it("derives origin from completion path, not path suffix (E)", () => {
      expect(normalizeCompletionOrigin("https://api.example.com/v1/chat/completions"))
        .toBe("https://api.example.com");
    });

    it("preserves non-default port (F)", () => {
      expect(normalizeCompletionOrigin("https://provider.example.com:8443/v1"))
        .toBe("https://provider.example.com:8443");
    });

    it("returns null for invalid URL (G)", () => {
      expect(normalizeCompletionOrigin("not-a-url")).toBeNull();
      expect(normalizeCompletionOrigin("")).toBeNull();
    });

    it("adds https when protocol omitted", () => {
      expect(normalizeCompletionOrigin("api.example.com/v1")).toBe("https://api.example.com");
    });
  });

  describe("buildCustomProviderIconCandidates", () => {
    it("builds favicon candidates from exact API origin (A/B/E)", () => {
      const candidates = buildCustomProviderIconCandidates("https://api.example.com/v1");
      expect(candidates[0]).toBe("https://api.example.com/favicon.ico");
      expect(candidates[1]).toBe("https://api.example.com/favicon.png");
      expect(candidates[2]).toBe("https://api.example.com/apple-touch-icon.png");
      expect(candidates.some((u) => u.startsWith("https://example.com/"))).toBe(true);
      expect(candidates.some((u) => u.includes("/v1/"))).toBe(false);
    });

    it("includes root-domain candidates for subdomains", () => {
      const candidates = buildCustomProviderIconCandidates("https://openrouter.ai/api/v1");
      expect(candidates[0]).toBe("https://openrouter.ai/favicon.ico");
    });

    it("returns empty for invalid URL (G)", () => {
      expect(buildCustomProviderIconCandidates("")).toEqual([]);
    });

    it("skips root fallback for localhost (local endpoints)", () => {
      const candidates = buildCustomProviderIconCandidates("http://localhost:8080/v1");
      expect(candidates).toEqual([
        "http://localhost:8080/favicon.ico",
        "http://localhost:8080/favicon.png",
        "http://localhost:8080/apple-touch-icon.png",
      ]);
    });
  });

  describe("compatibility fallback", () => {
    it("OpenAI-compatible chat fallback (C)", () => {
      expect(getCompatibilityFallbackIconSrc("openai", "chat")).toBe("/providers/oai-cc.png");
    });

    it("OpenAI-compatible responses fallback", () => {
      expect(getCompatibilityFallbackIconSrc("openai", "responses")).toBe("/providers/oai-r.png");
    });

    it("Anthropic-compatible fallback (D)", () => {
      expect(getCompatibilityFallbackIconSrc("anthropic")).toBe("/providers/anthropic-m.png");
    });
  });

  describe("resolveCustomProviderCompatibility", () => {
    it("detects openai-compatible provider id", () => {
      expect(resolveCustomProviderCompatibility("openai-compatible-chat-abc"))
        .toBe("openai");
    });

    it("detects anthropic-compatible provider id", () => {
      expect(resolveCustomProviderCompatibility("anthropic-compatible-abc"))
        .toBe("anthropic");
    });

    it("returns null for built-in providers (J/R)", () => {
      expect(resolveCustomProviderCompatibility("openrouter")).toBeNull();
      expect(resolveCustomProviderCompatibility("anthropic")).toBeNull();
    });
  });

  describe("resolution cache", () => {
    it("caches resolved URL by origin key (I/N)", () => {
      const key = getCustomProviderIconCacheKey("https://openrouter.ai/api/v1");
      expect(key).toBe("https://openrouter.ai");

      cacheResolvedCustomProviderIcon(key, "https://openrouter.ai/favicon.ico");
      expect(getCachedCustomProviderIcon(key)).toEqual({
        status: "resolved",
        url: "https://openrouter.ai/favicon.ico",
      });
    });

    it("caches fallback state (M)", () => {
      const key = "https://api.example.com";
      cacheFallbackCustomProviderIcon(key);
      expect(getCachedCustomProviderIcon(key)).toEqual({ status: "fallback" });
    });

    it("endpoint change uses different cache key (H/O)", () => {
      const oldKey = getCustomProviderIconCacheKey("https://api.old.example/v1");
      const newKey = getCustomProviderIconCacheKey("https://api.new.example/v1");
      expect(oldKey).not.toBe(newKey);

      cacheResolvedCustomProviderIcon(oldKey, "https://api.old.example/favicon.ico");
      expect(getCachedCustomProviderIcon(newKey)).toBeNull();
    });

    it("same origin shares cache key across providers (I/N)", () => {
      const a = getCustomProviderIconCacheKey("https://api.example.com/v1");
      const b = getCustomProviderIconCacheKey("https://api.example.com/openai/v1");
      expect(a).toBe(b);
    });
  });

  describe("private/local hosts", () => {
    it("detects localhost and private IPs", () => {
      expect(isPrivateOrLocalHost("localhost")).toBe(true);
      expect(isPrivateOrLocalHost("127.0.0.1")).toBe(true);
      expect(isPrivateOrLocalHost("192.168.1.1")).toBe(true);
      expect(isPrivateOrLocalHost("api.example.com")).toBe(false);
    });

    it("does not derive malformed root for private hosts", () => {
      expect(getRegistrableDomain("localhost")).toBeNull();
      expect(getRegistrableDomain("192.168.0.1")).toBeNull();
    });
  });

  describe("registrable domain", () => {
    it("handles compound TLD safely", () => {
      expect(getRegistrableDomain("api.service.co.uk")).toBe("service.co.uk");
      expect(getRegistrableDomain("service.co.uk")).toBeNull();
    });

    it("strips one subdomain label for simple TLD", () => {
      expect(getRegistrableDomain("api.deepinfra.com")).toBe("deepinfra.com");
    });
  });
});

describe("customProviderIcon usage graph scenarios", () => {
  beforeEach(() => {
    clearCustomProviderIconCache();
  });

  it("K — OpenRouter openai-compatible uses domain origin not OpenAI asset path", () => {
    const candidates = buildCustomProviderIconCandidates("https://openrouter.ai/api/v1");
    expect(candidates[0]).toMatch(/^https:\/\/openrouter\.ai\//);
    expect(getCompatibilityFallbackIconSrc("openai")).toBe("/providers/oai-cc.png");
    expect(candidates[0]).not.toBe(getCompatibilityFallbackIconSrc("openai"));
  });

  it("L — anthropic-compatible domain candidates precede anthropic fallback", () => {
    const candidates = buildCustomProviderIconCandidates("https://api.example.ai/v1/messages");
    expect(candidates[0]).toBe("https://api.example.ai/favicon.ico");
    expect(getCompatibilityFallbackIconSrc("anthropic")).toBe("/providers/anthropic-m.png");
  });

  it("P — rename does not change cache key (origin-based)", () => {
    const key1 = getCustomProviderIconCacheKey("https://openrouter.ai/api/v1");
    const key2 = getCustomProviderIconCacheKey("https://openrouter.ai/api/v1/");
    expect(key1).toBe(key2);
  });

  it("Q — missing provider metadata falls back without throw (G)", () => {
    expect(buildCustomProviderIconCandidates(null)).toEqual([]);
    expect(getCompatibilityFallbackIconSrc("openai")).toBeTruthy();
  });
});
