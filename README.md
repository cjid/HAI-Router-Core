# HAI-Router

**HAI-Router** is a local AI routing gateway and Next.js dashboard by **HarumAI**. It exposes one OpenAI-compatible API (`/v1/*`) and routes traffic across 40+ upstream providers with format translation, model combos, multi-account fallback, OAuth/API-key management, usage tracking, and optional cloud sync.

Provider-facing HTTP is executed by the **Go Engine** worker (`hai-worker`) under Node control-plane orchestration. **Provider-facing Node egress is zero** by design (verified via `npm run audit:egress`).

## What you get

- OpenAI-compatible `/v1/*` endpoint for CLI tools and custom clients
- Dashboard at `/dashboard` for providers, models, combos, proxy pools, Provider Safety, and usage
- Request Details observability (metadata + optional full payloads)
- SQLite persistence under `~/.hairouter/` (legacy `~/.9router/` migrated automatically)
- Optional global CLI launcher in `cli/` (legacy npm package name `9router` — see [COMPATIBILITY.md](./COMPATIBILITY.md))

## Architecture (short)

```
Client → HAI-Router Node (routing, translation, usage, dashboard)
      → Go Engine (provider HTTP/SSE transport)
      → Upstream providers
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [docs/GO_ENGINE.md](./docs/GO_ENGINE.md).

## Quick start

**Private repo:** you need GitHub access to https://github.com/cjid/HAI-Router-Core — full plug-and-play steps in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

**Fastest path (Docker Compose):**

```bash
git clone git@github.com:cjid/HAI-Router-Core.git
cd HAI-Router-Core
cp .env.example .env   # set JWT_SECRET and INITIAL_PASSWORD
docker compose up -d --build
```

Open http://localhost:20128/dashboard

**From source (development):** Node.js ≥ 18, npm, Go ≥ 1.22 for local engine build.

```bash
cp .env.example .env
npm install
npm run build:go-engine
npm run dev
```

| Mode | Command | Default port |
|------|---------|--------------|
| Development | `npm run dev` or `npm run dev:webpack` | **20127** |
| Production | `npm run build && npm run start` | **20127** (override with `PORT`) |
| Docker | see [DOCKER.md](./DOCKER.md) | **20128** (image default) |

Open: http://localhost:20127/dashboard (dev) or http://localhost:20128 (Docker default).

## Docker

Build and run locally (no separate registry image is published by default):

```bash
docker build -t hairouter:latest .
docker run -d -p 20128:20128 \
  -v "$HOME/.hairouter:/app/data" \
  -e HAI_ROUTER_DATA_DIR=/app/data \
  --name hairouter hairouter:latest
```

Details: [DOCKER.md](./DOCKER.md)

## Data directory

| Platform | Canonical path |
|----------|----------------|
| Linux/macOS | `~/.hairouter/` |
| Windows | `%APPDATA%\hairouter\` |

Override: `HAI_ROUTER_DATA_DIR`. Legacy `DATA_DIR` and `~/.9router/` are accepted for migration only — see [COMPATIBILITY.md](./COMPATIBILITY.md).

## Key scripts

From `package.json`:

```bash
npm run dev                 # Next.js dev server (port 20127)
npm run build               # Production build
npm run start               # custom-server.js (port 20127 default)
npm run build:go-engine     # Build hai-worker for current OS/arch
npm run build:go-engine:all # Cross-compile worker binaries
npm run audit:egress        # Assert zero provider-facing Node fetch
npm run cli:pack            # Build + pack CLI from cli/
```

Full developer guide: [DEVELOPMENT.md](./DEVELOPMENT.md)

## Documentation

| Document | Purpose |
|----------|---------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | **Install & deploy** (private repo, Docker, source, CLI) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design and request lifecycle |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Local setup, tests, conventions |
| [DOCKER.md](./DOCKER.md) | Container deployment |
| [SECURITY.md](./SECURITY.md) | Secrets, auth, egress model |
| [COMPATIBILITY.md](./COMPATIBILITY.md) | Legacy 9Router migration |
| [docs/GO_ENGINE.md](./docs/GO_ENGINE.md) | Go transport worker |
| [docs/PROVIDER_SAFETY.md](./docs/PROVIDER_SAFETY.md) | Concurrency / circuit controls |
| [docs/USAGE_AND_OBSERVABILITY.md](./docs/USAGE_AND_OBSERVABILITY.md) | Usage + Request Details |
| [CLAUDE.md](./CLAUDE.md) | Agent/coding guidelines |

## Legacy / attribution

HAI-Router evolved from the open-source [9Router](https://github.com/decolua/9router) project. The dashboard footer shows upstream attribution. Legacy CLI package name, data paths, and env aliases remain for compatibility — not as current product identity.

## License

See [LICENSE](./LICENSE). CLI package license: [cli/LICENSE](./cli/LICENSE).

## Repository

Canonical source: https://github.com/cjid/HAI-Router-Core
