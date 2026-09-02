# Development

Verified commands and layout for working on HAI-Router from source.

## Prerequisites

- **Node.js** ≥ 18 (22 recommended)
- **npm**
- **Go** ≥ 1.22 (to build `go-engine/bin/hai-worker`)
- Optional: **better-sqlite3** build tools (native SQLite driver; `sql.js` fallback works without them)

## First-time setup

```bash
cp .env.example .env
npm install
npm run build:go-engine
```

Edit `.env`: set `JWT_SECRET`, change `INITIAL_PASSWORD` from default, and optionally `HAI_ROUTER_DATA_DIR`.

## Run locally

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server, port **20127** |
| `npm run dev:webpack` | Same with explicit webpack flag |
| `npm run build` | Production Next.js build |
| `npm run start` | `custom-server.js`, port **20127** default |
| `npm run dev:bun` / `build:bun` / `start:bun` | Bun variants |

Dashboard: http://localhost:20127/dashboard  
API: http://localhost:20127/v1/

## Go Engine

```bash
npm run build:go-engine       # current platform
npm run build:go-engine:all   # cross-compile matrix
cd go-engine && go test ./...
cd go-engine && go test -race ./...
cd go-engine && go vet ./...
```

## Quality gates

```bash
npm run audit:egress          # must report 0 provider-facing Node egress
npx eslint .                  # lint (eslint.config.mjs)
node scripts/audit-product-identity.mjs   # legacy 9Router string audit
```

## Tests

Tests live in `tests/` as an independent Vitest package:

```bash
npm install                   # root deps first
cd tests && npm install
cd tests && npx vitest run --config vitest.config.js
```

Focused examples:

```bash
cd tests && npx vitest run --config vitest.config.js unit/product-identity.test.js
cd tests && npx vitest run --config vitest.config.js unit/request-detail-drawer-fetch.test.js
cd tests && npx vitest run --config vitest.config.js tests/translator/
```

Regression baselines: `tests/__baseline__/verify-*.mjs` after provider registry changes.

## CLI package

```bash
npm run cli:pack              # from repo root
cd cli && npm run dev         # nodemon watch
```

See [cli/README.md](./cli/README.md) and [COMPATIBILITY.md](./COMPATIBILITY.md).

## Project layout

| Path | Role |
|------|------|
| `src/` | Next.js app, dashboard, `/api` routes |
| `open-sse/` | Provider-agnostic routing/translation engine |
| `go-engine/` | Go transport worker (`hai-worker`) |
| `cli/` | Legacy-compatible global launcher |
| `tests/` | Vitest suite |
| `scripts/` | Build, audit, migration helpers |

## Conventions

- Plain JavaScript (ESM), `@/*` → `src/*`
- Config-driven constants in `open-sse/config/` — no hardcoded provider strings in engine code
- Read `open-sse/AGENTS.md` before editing the translation engine
- Read `CLAUDE.md` for agent/human coding rules

## Data directory (dev)

Default: `~/.hairouter/` (see `src/lib/db/paths.js`). Legacy `~/.9router/` migrates on first access.

## Ports

| Context | Default `PORT` |
|---------|----------------|
| `npm run dev` / `start` | 20127 (`package.json`) |
| Docker image | 20128 (`Dockerfile`) |
| CLI status helper | 20129 (`UPDATER_CONFIG.statusPort`) |

Override with environment variable `PORT`.
