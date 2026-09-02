# HAI-Router 0.1.0-init

Initial HAI-Router Core release.

`0.1.0-init` establishes the first verified HAI-Router baseline after the
transition from the inherited 9Router codebase into the HarumAI ecosystem.

This release is published as a pre-release while broader real-world provider
and cross-platform validation continues.

## Highlights

- Native HAI-Router product identity and documentation baseline
- Node.js control plane with Go-based provider transport
- Canonical Go Engine for provider-facing network egress
- Provider Safety with provider-global concurrency controls
- OpenAI-compatible completion gateway
- Provider-truthful SSE streaming
- Multi-worker Go Engine lifecycle and health management
- Proxy and relay support
- Model catalog and model capability metadata
- Combo routing and fallback strategies
- Usage, token accounting, Request Details, and transport observability
- Local dashboard with offline first-party Changelog
- Docker production build support

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

Adding Go workers does not automatically increase upstream provider
concurrency.

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
- Windows production build environment handling
- HAI-Router version SSOT protection during CLI packaging

## Verification

Release verification completed on **2026-09-02**.

| Gate | Status |
|---|---|
| Provider-facing Node egress | PASS |
| Go unit tests | PASS |
| Go race detector | PASS |
| Go vet | PASS |
| Vitest full unit regression | PASS |
| Production build | PASS |
| Docker build | PASS |
| Provider-truthful streaming | PASS |
| CLI npm pack | PASS (verified path; not shipped as primary artifact) |

Full unit regression:

- **2113** passed
- **0** failed
- **19** skipped
- **256** files
- exit code 0

> **Note:** On Windows, run Vitest with `--maxWorkers=2` if default parallel
> workers hit SQLite setup timeouts under load.

Go race detector reported no data races.

## Compatibility

HAI-Router preserves selected legacy compatibility paths where required for
migration from older installations.

Legacy 9Router identity is not the canonical HAI-Router identity.

Legacy names may remain only where required for:

- migration
- backward compatibility
- upstream attribution

New HAI-Router data and configuration should use canonical HAI-Router paths and
identifiers.

## CLI

The inherited CLI packaging path has been successfully verified.

However, the current generated package still carries legacy 9Router package
identity (`9router@0.5.59`).

For that reason, the legacy CLI tarball is **not included as a primary
HAI-Router 0.1.0-init release artifact**.

A canonical HAI-Router CLI distribution can follow separately.

## Release Status

**Pre-release**

`0.1.0-init` is intended as the first clean HAI-Router Core baseline for
continued integration, provider validation, and HarumAI ecosystem development.
