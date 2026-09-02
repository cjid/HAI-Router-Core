# Go Engine

The **Go Engine** (`go-engine/`, binary `hai-worker`) performs provider-facing HTTP/SSE transport. The Node control plane owns routing, translation, auth, usage, and dashboard APIs.

## Responsibility split

| Layer | Owns |
|-------|------|
| **Node** | `/v1/*`, format translation, combos, account fallback, Provider Safety policy, proxy selection, usage, Request Details |
| **Go Engine** | DNS/TCP/TLS, HTTP/1.1 & HTTP/2, SSE byte streaming, flush-aware copy, connection pools, backpressure, cancellation |

**Hard rule:** Node must not call upstream providers directly (see `npm run audit:egress`).

## Worker lifecycle

Node spawns and manages `hai-worker` processes:

- Start / Pause / Resume / Stop from dashboard (Go Engine UI)
- Add / Delete worker instances
- Minimum worker count and health checks
- Dynamic worker pool for concurrent provider traffic

Worker logs and transport metrics surface in the dashboard.

## Transport behavior

Current implementation (`go-engine/transport/`):

- Flush-after-write on streaming responses
- Header-only timeouts for long-lived SSE (stall handled separately in Node)
- HTTP client pooling and reuse
- Proxy-aware dialer when proxy policy is set in Node

## Build

```bash
npm run build:go-engine
# or
cd go-engine && go build -o bin/hai-worker ./cmd/worker
```

## Tests

```bash
cd go-engine && go test ./...
cd go-engine && go test -race ./...
cd go-engine && go vet ./...
```

## Provider Safety

Provider Safety (concurrency limits, circuits) is enforced in Node policy before dispatch; workers execute transport only. See [PROVIDER_SAFETY.md](./PROVIDER_SAFETY.md).

## Configuration

Go worker reads IPC/config from Node — do not document experimental flags not present in `go-engine/worker/`.
