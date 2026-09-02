# Deployment

Plug-and-play guide for **HAI-Router** from the private GitHub repository  
https://github.com/cjid/HAI-Router-Core

You need **read access** to that repository. Choose one access method below, then one deployment method.

---

## Prerequisites

| Requirement | Version | Used for |
|-------------|---------|----------|
| **Git** | any recent | clone / npm GitHub installs |
| **Node.js** | ≥ 18 (22 recommended) | source install, CLI |
| **npm** | bundled with Node | install / build |
| **Docker + Compose** | recent | recommended production path |
| **Go** | ≥ 1.22 | only if building engine locally outside Docker |

Optional but helpful: [GitHub CLI](https://cli.github.com/) (`gh`) for authentication.

---

## Step 0 — Get repository access

Pick **one** method. All following commands assume the repo URL  
`git@github.com:cjid/HAI-Router-Core.git` (SSH) or HTTPS equivalent.

### A. SSH (recommended)

1. Add an SSH key to your GitHub account: https://github.com/settings/keys  
2. Test:

```bash
ssh -T git@github.com
git clone git@github.com:cjid/HAI-Router-Core.git
cd HAI-Router-Core
```

### B. HTTPS + Personal Access Token (PAT)

1. Create a classic PAT with **`repo`** scope: https://github.com/settings/tokens  
2. Clone (replace `YOUR_TOKEN`):

```bash
git clone https://YOUR_TOKEN@github.com/cjid/HAI-Router-Core.git
cd HAI-Router-Core
```

Or use Git credential manager / `gh auth login` so you are not embedding the token in shell history.

### C. GitHub CLI

```bash
gh auth login
gh repo clone cjid/HAI-Router-Core
cd HAI-Router-Core
```

### Windows (PowerShell)

Same commands work in PowerShell. Default data directory: `%APPDATA%\hairouter\`.

---

## Step 1 — Configure environment (all methods)

```bash
cp .env.example .env
```

Edit `.env` — **minimum required before first run:**

| Variable | Action |
|----------|--------|
| `JWT_SECRET` | Set a long random string (session signing) |
| `INITIAL_PASSWORD` | Set dashboard login password (default in example is placeholder) |
| `HAI_ROUTER_DATA_DIR` | Optional locally; Docker compose sets `/app/data` inside container |

Recommended for Docker (already in `.env.example`):

```env
PORT=20128
NODE_ENV=production
HAI_ROUTER_DATA_DIR=/var/lib/hairouter
BASE_URL=http://localhost:20128
NEXT_PUBLIC_BASE_URL=http://localhost:20128
```

**Do not commit `.env`.** It is gitignored.

---

## Method 1 — Docker Compose (recommended, plug-and-play)

Builds the image, starts HAI-Router + optional Headroom sidecar, persists data in a named volume.

```bash
git clone git@github.com:cjid/HAI-Router-Core.git
cd HAI-Router-Core
cp .env.example .env
# edit JWT_SECRET and INITIAL_PASSWORD in .env

docker compose up -d --build
```

| Item | Value |
|------|-------|
| Dashboard | http://localhost:20128/dashboard |
| API | http://localhost:20128/v1/ |
| Container | `hairouter` |
| Data volume | `hairouter-data` → `/app/data` in container |
| Logs | `docker compose logs -f hairouter` |
| Stop | `docker compose down` |
| Rebuild after pull | `git pull && docker compose up -d --build` |

Headroom sidecar (token compression proxy) listens on port **8787**. Disable it by removing the `headroom` service and `depends_on` from `docker-compose.yml` if not needed.

---

## Method 2 — Docker (single container)

```bash
git clone git@github.com:cjid/HAI-Router-Core.git
cd HAI-Router-Core
cp .env.example .env
# edit secrets in .env

docker build -t hairouter:latest .
docker run -d \
  --name hairouter \
  -p 20128:20128 \
  --env-file .env \
  -e HAI_ROUTER_DATA_DIR=/app/data \
  -e DATA_DIR=/app/data \
  -v hairouter-data:/app/data \
  hairouter:latest
```

**Linux/macOS** bind mount instead of named volume:

```bash
docker run -d \
  --name hairouter \
  -p 20128:20128 \
  --env-file .env \
  -e HAI_ROUTER_DATA_DIR=/app/data \
  -v "$HOME/.hairouter:/app/data" \
  hairouter:latest
```

**Windows (PowerShell):**

```powershell
docker run -d `
  --name hairouter `
  -p 20128:20128 `
  --env-file .env `
  -e HAI_ROUTER_DATA_DIR=/app/data `
  -v "${env:APPDATA}\hairouter:/app/data" `
  hairouter:latest
```

Helper script (build + run with `.env`):

```bash
chmod +x start.sh
./start.sh
```

More detail: [DOCKER.md](./DOCKER.md)

---

## Method 3 — From source (no Docker)

```bash
git clone git@github.com:cjid/HAI-Router-Core.git
cd HAI-Router-Core
cp .env.example .env
# edit JWT_SECRET and INITIAL_PASSWORD

npm install
npm run build:go-engine
npm run build
npm run start
```

| Mode | Command | Port |
|------|---------|------|
| Development | `npm run dev` | **20127** |
| Production | `npm run start` | **20127** (override with `PORT`) |

Dashboard: http://localhost:20127/dashboard

Data defaults to `~/.hairouter/` (or `%APPDATA%\hairouter\` on Windows). Legacy `~/.9router/` migrates automatically on first run.

Developer details: [DEVELOPMENT.md](./DEVELOPMENT.md)

---

## Method 4 — Global CLI launcher (optional)

Installs the legacy-compatible npm package **`9router`** from this GitHub repo (subpath `cli/`). Requires Git access to the private repo.

### Authenticate npm/Git for private GitHub

**Option A — GitHub CLI (easiest):**

```bash
gh auth login
gh auth setup-git
npm i -g github:cjid/HAI-Router-Core#main:cli
```

**Option B — environment token (CI / scripts):**

```bash
# bash
export GITHUB_TOKEN=ghp_your_pat_with_repo_scope
npm i -g github:cjid/HAI-Router-Core#main:cli
```

```powershell
# PowerShell
$env:GITHUB_TOKEN = "ghp_your_pat_with_repo_scope"
npm i -g github:cjid/HAI-Router-Core#main:cli
```

**Option C — `~/.netrc` (Linux/macOS):**

```text
machine github.com
login YOUR_GITHUB_USERNAME
password YOUR_PAT
```

Then:

```bash
npm i -g github:cjid/HAI-Router-Core#main:cli
9router
```

| Command | Description |
|---------|-------------|
| `9router` | Start server (+ optional system tray) |
| `9router update` | Reinstall CLI from configured GitHub spec |

There is **no** public npm package named `hairouter`. See [cli/README.md](./cli/README.md) and [COMPATIBILITY.md](./COMPATIBILITY.md).

---

## First login

1. Open the dashboard URL (port **20128** Docker, **20127** source dev).
2. Log in with the password from `INITIAL_PASSWORD` in `.env`.
3. Change the password in dashboard settings after first login if the UI exposes it, or rotate `INITIAL_PASSWORD` and restart for a fresh install.

---

## Verify deployment

```bash
# Container running
docker ps --filter name=hairouter

# HTTP responds (401/403 without API key is OK — means server is up)
curl -s -o /dev/null -w "%{http_code}" http://localhost:20128/v1/models

# Egress invariant (from clone, optional)
npm install
npm run audit:egress
```

Expected: `audit:egress` reports **0 provider-facing Node egress** (Go Engine handles upstream HTTP).

---

## Update to latest

```bash
cd HAI-Router-Core
git pull origin main

# Docker Compose
docker compose up -d --build

# Or single container
docker build -t hairouter:latest .
docker stop hairouter && docker rm hairouter
# re-run docker run / ./start.sh

# Source
npm install
npm run build:go-engine
npm run build
npm run start

# CLI
9router update
```

In-app updater (dashboard) installs from `github:cjid/HAI-Router-Core#main:cli` — same private-repo auth as Method 4.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Permission denied (publickey)` on clone | Configure SSH key or use HTTPS + PAT / `gh auth login` |
| `npm ERR! 404` / `git clone` failed for `github:…` install | Export `GITHUB_TOKEN` or run `gh auth setup-git`; PAT needs **`repo`** scope for private repos |
| Container exits immediately | `docker logs hairouter` — usually missing/invalid `.env` or port conflict on 20128 |
| Cannot log in | Confirm `INITIAL_PASSWORD` in `.env` matches; restart container after changing `.env` |
| Empty providers | Expected on fresh install — add providers in dashboard |
| Legacy data | Place old data in `~/.9router/` before first start; migration copies to `~/.hairouter/` |

---

## Security checklist (production)

- [ ] Strong `JWT_SECRET` and non-default `INITIAL_PASSWORD`
- [ ] Set `AUTH_COOKIE_SECURE=true` behind HTTPS reverse proxy
- [ ] Set `REQUIRE_API_KEY=true` if exposing `/v1` to untrusted networks
- [ ] Do not commit `.env`, SQLite DBs, MITM keys, or backups
- [ ] Restrict network access to dashboard and `/v1` as needed

See [SECURITY.md](./SECURITY.md).

---

## Quick reference

| Path | Purpose |
|------|---------|
| [README.md](./README.md) | Product overview |
| [DOCKER.md](./DOCKER.md) | Docker details + Headroom |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Local dev + tests |
| [COMPATIBILITY.md](./COMPATIBILITY.md) | Legacy 9Router migration |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design |
