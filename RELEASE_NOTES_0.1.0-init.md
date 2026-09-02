# HAI-Router 0.1.0-init

Initial HAI-Router Core release.

`0.1.0-init` establishes the first verified HAI-Router baseline after the
transition from the inherited 9Router codebase into the HarumAI ecosystem.

This release is published as a **pre-release** while broader real-world provider
and cross-platform validation continues.

## Release metadata

| Field | Value |
|---|---|
| Version | `0.1.0-init` |
| Git tag | `v0.1.0-init` → `b30a9c41` |
| Repository | [cjid/HAI-Router-Core](https://github.com/cjid/HAI-Router-Core) |
| Package version | `hairouter-app@0.1.0-init` |
| Published | 2026-09-02 |
| Channel | Pre-release |

## Highlights

- Native HAI-Router product identity (`~/.hairouter/`, version SSOT `0.1.0-init`)
- Node.js control plane with Go-based provider transport
- Canonical Go Engine for provider-facing network egress (verified **0** Node provider egress)
- Provider Safety with provider-global concurrency controls
- OpenAI-compatible `/v1` completion gateway
- Provider-truthful SSE streaming (presentation smoother removed)
- Multi-worker Go Engine lifecycle and health management
- Proxy and relay support
- Model catalog and model capability metadata
- Combo routing and fallback strategies
- Usage, token accounting, Request Details, and transport observability
- Local dashboard with offline first-party Changelog / Verification UI
- Docker production build support (`hairouter:0.1.0-init` verified during gate session)
- Repository governance: Dependabot version-update PRs disabled; operator-controlled dependency policy

## Architecture

HAI-Router follows a strict control-plane / transport-plane separation:

```
Client
→ HAI-Router Node Control Plane
→ Go Engine
→ Provider
```

### Node.js owns

- client authentication
- provider/model routing
- account selection
- Combo/Fallback/Fusion policy
- Provider Safety
- proxy assignment policy
- request/response translation
- usage and token accounting
- pricing and request history
- dashboard and management APIs
- error normalization

### Go Engine owns

- provider-facing network egress
- DNS / TCP / TLS
- HTTP/1.1 and HTTP/2
- SSE transport
- proxy / relay transport
- connection pooling
- backpressure
- cancellation
- transport-level metrics

Provider-facing network egress from Node is verified at: **0**

## Go Engine

Included functionality:

- automatic lifecycle integration with HAI-Router
- Start / Pause / Resume / Stop
- worker restart
- dynamic Add / Delete Worker
- worker health reporting
- active-request tracking
- protocol/version handshake
- IPC authentication
- request/worker correlation
- reusable HTTP transport pools
- HTTP/2 transport support
- flush-aware realtime SSE forwarding
- structured HAI-Router logging

## Provider Safety

Provider Safety is independent from worker count.

Supported concepts include:

- provider-global concurrency limits
- `providerMax`
- safe OpenCode shared/free-provider defaults
- Generic policy for compatible/custom providers
- isolated runtime lanes for individual custom providers
- factual Active / Limit / Queued state
- provider health status
- environment/config compatibility

Adding Go workers does not automatically increase upstream provider concurrency.

## Streaming

HAI-Router uses provider-truthful streaming.

The router does not artificially generate typing cadence or reconstruct model
content for cosmetic effects.

Current streaming behavior preserves:

- provider/model event ordering
- reasoning/thinking ordering
- tool calls
- finish events
- usage metadata
- backpressure
- cancellation
- realtime Go transport flushing

The experimental server-side presentation smoother was intentionally removed
after compatibility testing showed that presentation repacketization could
distort provider stream semantics.

## Models

The provider model management system supports:

- fetched provider model catalogs where available
- persistent fetched model data
- manual models
- model enable / disable
- reasoning capability metadata
- input/output modality metadata
- context limits
- pricing metadata
- model testing
- factual model-test process state

## Routing

Current routing capabilities include:

- direct provider routing
- fallback
- round robin
- fusion where configured
- Combo model routing
- Vision Adapter
- provider/account selection
- admission and concurrency controls

## Usage & Observability

Included:

- total requests
- input tokens
- output tokens
- cached tokens
- estimated cost
- Request Details
- provider latency
- TTFT / timing metadata
- Go worker/request correlation
- proxy/network information
- streaming state
- actual vs estimated usage distinction
- partial usage retention for abnormal stream termination

Transport framing, heartbeat data, or router-internal events are never treated
as model token usage.

## Proxy

HAI-Router supports:

- direct networking
- proxy-based provider access
- relay transport
- proxy pools
- proxy testing
- proxy latency visibility
- request-level proxy observability

Proxy assignment remains a Node control-plane responsibility.

## Dashboard

The HAI-Router dashboard includes:

- Dashboard
- Providers
- Models
- Combo & Vision Adapter
- Usage & Analytics
- Quota Tracker
- Token Saver
- CLI Tools
- Media Providers
- Go Engine
- Provider Safety
- Proxy Pools
- Skills
- Console Log
- Settings
- Changelog / Verification

## Reliability Improvements

This baseline includes fixes for:

- Request Details infinite-loading race
- stale asynchronous UI responses
- blocking/background polling behavior
- provider-truthful SSE forwarding
- Go streaming flush behavior
- provider usage persistence
- ResponseAborted usage handling
- worker lifecycle consistency
- provider-safety state isolation
- Windows production build environment handling (`build-production.mjs` LOCALAPPDATA isolation)
- HAI-Router version SSOT protection during CLI packaging (no reverse-sync to `0.5.59`)
- Turbopack dev regression avoided (`next dev --webpack`)

## Verification

Release gates verified on **2026-09-02**. Counts below re-confirmed on the release
publication date (Vitest re-run 2026-09-02 20:15 UTC+7).

| Gate | Status | Command / evidence |
|---|---|---|
| Provider-facing Node egress | PASS | `npm run audit:egress` — 0 provider-facing Node egress |
| Go unit tests | PASS | `cd go-engine && go test ./...` |
| Go race detector | PASS | `cd go-engine && go test -race ./...` — no data races |
| Go vet | PASS | `cd go-engine && go vet ./...` |
| Vitest full unit regression | PASS | `npx vitest run --config tests/vitest.config.js tests/unit/ --maxWorkers=2` |
| Production build | PASS | `npm run build` (gate session 2026-09-02) |
| Docker build | PASS | `docker build -t hairouter:0.1.0-init .` (gate session 2026-09-02) |
| Provider-truthful streaming | PASS | `tests/unit/provider-truthful-stream.test.js` — 5/5 |
| CLI npm pack | PASS | `npm run cli:pack` (gate session; not shipped as primary artifact) |

Full unit regression (2026-09-02 re-run):

- **2113** passed
- **0** failed
- **19** skipped
- **256** test files (253 passed, 3 skipped)
- exit code **0**

On Windows, use `--maxWorkers=2` for stable SQLite-backed unit tests under full-suite load.

Dashboard verification SSOT: `src/shared/data/changelog.js` → `VERIFICATION_GATES`.

## Security posture

| Control | Status |
|---|---|
| Hardcoded secrets in tracked source | None found (AgentShield secrets: 100/100) |
| Dependabot Alerts | **Enabled** — 18 open advisories (14 moderate, 4 low) |
| Dependabot Security Updates (auto PR) | **Disabled** — operator-controlled remediation |
| Dependabot version-update PRs | **Disabled** (`open-pull-requests-limit: 0`, monthly inspect only) |
| Docker publish workflow | Operator-only (`v*` tag or `workflow_dispatch`; blocks `dependabot[bot]`) |
| Default `INITIAL_PASSWORD` | `123456` — **must override** before production exposure |

AgentShield repo scan (2026-09-02): **Grade A (93/100)** — no critical findings; 1 high (local `CLAUDE.md` permissions on Windows checkout), 4 medium (editor/skill config hygiene).

## Compatibility

HAI-Router preserves selected legacy compatibility paths where required for
migration from older installations.

Legacy 9Router identity is **not** the canonical HAI-Router identity.

Legacy names remain only where required for:

- migration (`~/.9router/` → `~/.hairouter/`)
- backward compatibility (CLI package `9router@0.5.59`, Copilot entry name, SAML issuer read paths)
- upstream attribution (footer: 9Router v0.5.59)

New HAI-Router data and configuration should use canonical HAI-Router paths and
identifiers.

**Known non-blocking gaps:** i18n literal files and some internal comments still
contain legacy “9Router” strings; `scripts/audit-product-identity.mjs` tracks remaining cleanup.

## CLI

The inherited CLI packaging path (`cli/`, legacy npm name `9router`, version
`0.5.59`) has been verified via `npm run cli:pack` during the gate session.

The generated tarball is **not included** as a primary HAI-Router 0.1.0-init
release artifact because it still carries legacy 9Router package identity.

A canonical HAI-Router CLI distribution can follow separately.

## Release Status

**Pre-release**

`0.1.0-init` is the first clean HAI-Router Core baseline for continued
integration, provider validation, and HarumAI ecosystem development.

**Not included in this tag:** post-tag release-notes commits on `master` after
`b30a9c41` (documentation-only follow-ups).
