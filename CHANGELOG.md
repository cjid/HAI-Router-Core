# HAI-Router Changelog

Canonical structured data lives in `src/shared/data/changelog.js` (bundled in the dashboard at `/dashboard/changelog`). This file is a short human-readable summary aligned with that source.

## 0.1.0-init — Development

**Build:** `248d88e7` · **Channel:** Development · **Architecture:** Node control-plane + Go Engine transport

### Highlights

- OpenAI-compatible `/v1` gateway with multi-provider routing and format translation
- Provider-facing HTTP exclusively via Go Engine (zero Node provider egress)
- Provider-truthful SSE streaming (presentation smoother removed)
- Request Details drawer fetch race fixed
- Provider Safety concurrency controls
- Native offline Changelog & capability status page

### Completed (selected)

- Go Engine: IPC, lifecycle, dynamic workers, HTTP/1.1 + HTTP/2 + SSE, proxy relay
- Usage: token accounting, cached tokens, Request Details observability
- Model catalog: fetch models, enable/disable, model test UI
- Combos: Fallback, Round Robin, Fusion + vision capacity adapter
- Identity: `~/.hairouter` SSOT, legacy `~/.9router` migration, docs rebuild

### In progress

- Active 9Router identity cleanup (compat layer retained; audit script still flags stragglers)

### Known limitations

- Some i18n literal files still contain legacy “9Router” strings in translations
- Full vitest suite not all-green on plain checkout (inherited baseline failures)
- Cross-platform Go worker matrix and CLI e2e install need verification gates

### Deprecated / removed

- **Adaptive presentation smoother** — removed (`f705cdc`); provider-truthful SSE is current behavior

### Verification (spot checks)

| Gate | Status | Command |
|------|--------|---------|
| Provider-facing Node egress | PASS | `npm run audit:egress` |
| Go unit tests | PASS | `cd go-engine && go test ./...` |
| Provider-truthful streaming | PASS | `tests/unit/provider-truthful-stream.test.js` |
| Production build | Not run this cycle | `npm run build` |

---

Upstream **9Router** release history (v0.5.x) is **not** HAI-Router history — see footer attribution and [COMPATIBILITY.md](./COMPATIBILITY.md).
