# HAI-Router Changelog

Canonical structured data lives in `src/shared/data/changelog.js` (dashboard `/dashboard/changelog`). Full release notes: [RELEASE_NOTES_0.1.0-init.md](./RELEASE_NOTES_0.1.0-init.md).

## 0.1.0-init — Pre-release

**Version:** `0.1.0-init` · **Architecture:** Node control-plane + Go Engine transport · **Status:** Pre-release

### Highlights

- OpenAI-compatible `/v1` gateway with multi-provider routing and format translation
- Provider-facing HTTP exclusively via Go Engine (zero Node provider egress)
- Provider-truthful SSE streaming (presentation smoother removed)
- Provider Safety concurrency controls
- Native offline Changelog & Verification gates UI
- Updated branding assets (`images/hai_router.png`, `docs/images/`)

### Verification (2026-09-02)

| Gate | Status |
|------|--------|
| Provider-facing Node egress | PASS |
| Go unit / race / vet | PASS |
| Vitest full unit regression | PASS (2113 passed, 0 failed) |
| Production build | PASS |
| Docker build (`hairouter:0.1.0-init`) | PASS |
| Provider-truthful streaming | PASS |
| CLI npm pack | PASS (not primary release artifact) |

### Compatibility

- Canonical data: `~/.hairouter/`; legacy `~/.9router/` migrated on first run
- Legacy 9Router identity retained only for migration, CLI compat, and footer attribution
- i18n literal files may still contain legacy strings (non-blocking)

### CLI

Legacy `9router@0.5.59` npm pack verified but **not** bundled as primary HAI-Router Core release artifact.

---

Upstream **9Router** release history (v0.5.x) is **not** HAI-Router history — see footer attribution and [COMPATIBILITY.md](./COMPATIBILITY.md).
