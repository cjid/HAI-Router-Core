# Go Provider Transport Engine — Migration Plan (4 Sessions)

## Baseline (Session 1 — this commit)

| Item | Value |
|------|-------|
| HEAD | `bde92c11` (pre go-engine scaffold) |
| Branch | `master` |
| Working tree | clean at session start |

## Architecture Rule

```
Node decides WHAT to request.
Go decides HOW bytes reach the provider.
Node decides WHAT provider bytes mean.
```

## Session Breakdown

### Session 1 — Foundation (THIS SESSION)
- [x] `go-engine/` module: protocol, generic HTTP transport, worker IPC
- [x] Node `workerManager` + `goTransport` bridge
- [x] Opt-in hook in `proxyAwareFetch` (`HAI_GO_ENGINE=1`)
- [x] Go + Node regression tests
- [x] Docker multi-stage build stub
- [ ] **NOT DONE:** zero provider bypass (majority still Node fetch)

### Session 2 — Generic Migration (THIS SESSION)
- [x] Egress generation + `enrichProxyOptions` (providerId, connectionId, generation)
- [x] Go worker relay mode (Vercel relay via `x-relay-target` / `x-relay-path`)
- [x] Go worker MITM DNS bypass mode (`bypassHost` + `bypassIp` from Node DNS resolve)
- [x] OAuth provider network calls already routed via `oauthFetch` → `proxyAwareFetch`
- [x] Strict Go transport when `HAI_GO_ENGINE=1` without `HAI_GO_ENGINE_FALLBACK=1`
- [x] Modality handlers use enriched proxy options via `modalityProxy.js`
- [x] Go + Node regression tests (relay, generation, strict mode)
- [ ] **NOT DONE:** Cursor HTTP/2 still Node-only; image URL prefetch SSRF fetch stays Node
- [ ] **NOT DONE:** zero forbidden egress audit (Session 4)

### Session 3 — Special Adapters + Multi-Worker (THIS SESSION)
- [x] Load shedding: `TryAcquire` → immediate 503 `hai_worker_overloaded` (no queue blocking)
- [x] Multi-worker affinity tests (`computeWorkerIndex` stable hash)
- [x] Proxy generation immutability stress (Go 32-gen + Node invalidate tests)
- [x] Special provider path validation (Cursor fetch → Go, HTTP/2 → Node; Kiro/Codex → BaseExecutor/proxyAwareFetch)
- [ ] **NOT DONE:** Cursor bidirectional HTTP/2 Go adapter (generic fetch path sufficient; HTTP/2 deferred)
- [ ] **NOT DONE:** Kiro/Codex live byte-pipe integration test (requires credentials)

### Session 4 — Hardening + Packaging + Final Audit (THIS SESSION)
- [x] Forbidden-egress audit script (`npm run audit:egress`) — 0 violations
- [x] Remaining open-sse raw `fetch` migrated (Edge TTS voices, image urlToBase64)
- [x] Global `fetch` patch opt-in: off by default when `HAI_GO_ENGINE=1` (`HAI_PATCH_GLOBAL_FETCH=1` for legacy)
- [x] Cross-platform worker build (`npm run build:go-engine:all`)
- [x] Go stress suite + `go test -race ./...` verified
- [x] Security scan (AgentShield A) + regression tests
- [ ] **NOT DONE:** Cursor HTTP/2 Go adapter (intentionally Node-only)
- [ ] **NOT DONE:** Ship prebuilt binaries in npm/cli release pipeline

## Final Verdict (Session 4)

```text
READY (opt-in)
```

Enable with `HAI_GO_ENGINE=1`, build worker, run `npm run audit:egress`. Strict transport without Node fallback when `HAI_GO_ENGINE_FALLBACK` is unset. Cursor agent HTTP/2 and SSRF image prefetch remain documented Node paths.

## Provider Egress Inventory (partial — open-sse)

| Area | Files with `proxyAwareFetch` | Move to Go? |
|------|------------------------------|-------------|
| Executors | base, default, cursor, kiro-path, antigravity, github, … | Yes |
| Token refresh | tokenRefresh.js, providers.js | Yes |
| Usage/quota | usage/*, projectId.js | Yes |
| Model discovery | *Models.js services | Yes |
| OAuth (src) | oauth/fetch.js | Yes (Session 2) |
| Dashboard fetch | src/app/* fetch("/api/…") | No (internal) |
| Model test ping | internal localhost | No |

**Total provider-facing call sites:** ~35+ files under `open-sse/` (see grep `proxyAwareFetch`).

## Enable Go Engine (dev)

```bash
# Build worker (requires Go 1.22+)
node scripts/build-go-engine.mjs
# All platforms (linux/darwin/windows amd64+arm64)
npm run build:go-engine:all

# Forbidden egress audit (must pass before release)
npm run audit:egress

# Enable
export HAI_GO_ENGINE=1
npm run dev
```

## IPC Contract

- Loopback HTTP only (`127.0.0.1`)
- Auth: `X-HAI-Worker-Token` (memory-only, spawned by Node)
- `POST /v1/execute` with `ExecutionSpec` JSON
- Response = upstream passthrough + `X-HAI-Transport-*` metadata

## Final Verdict (Session 1)

```text
NOT READY (superseded by Session 4)
```

Historical blockers at Session 1 — resolved through Sessions 2–4. See **Final Verdict (Session 4)** above.
