# Docker

Run HAI-Router in a container. Build the image locally from this repository (no separate HAI-Router registry image is published yet).

**Private repository access, authentication, and full plug-and-play flow:** see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

---

# 👤 For Users

## Quick start (Docker Compose — recommended)

```bash
git clone git@github.com:cjid/HAI-Router-Core.git
cd HAI-Router-Core
cp .env.example .env   # edit JWT_SECRET, INITIAL_PASSWORD
docker compose up -d --build
```

Open http://localhost:20128/dashboard

## Quick start (single container)

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.hairouter:/app/data" \
  -e DATA_DIR=/app/data \
  --name hairouter \
  hairouter-app:local
```

App listens on port `20128`. Open: http://localhost:20128

## Manage container

```bash
docker logs -f hairouter        # view logs
docker stop hairouter           # stop
docker start hairouter          # start again
docker rm -f hairouter          # remove
```

## Data persistence

```bash
-v "$HOME/.hairouter:/app/data" \
-e DATA_DIR=/app/data
```

Without `DATA_DIR`, the app falls back to `~/.hairouter/` (macOS/Linux) or `%APPDATA%\hairouter\` (Windows). Legacy `~/.9router/` is migrated automatically when present. In the container, `DATA_DIR=/app/data` makes the bind mount work.

Data layout under `$DATA_DIR/`:

```text
$DATA_DIR/
├── db/
│   ├── data.sqlite       # main SQLite database
│   └── backups/          # auto backups
└── ...                   # certs, logs, runtime configs
```

Host path: `$HOME/.hairouter/db/data.sqlite`
Container path: `/app/data/db/data.sqlite`

## Optional env vars

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.hairouter:/app/data" \
  -e DATA_DIR=/app/data \
  -e PORT=20128 \
  -e HOSTNAME=0.0.0.0 \
  -e DEBUG=true \
  --name hairouter \
  hairouter-app:local
```

## Optional Headroom sidecar

The HAI-Router image does not bundle Python or Headroom. To use Headroom in Docker, run it as a separate service and point HAI-Router at that proxy:

```yaml
services:
  hairouter:
    image: hairouter-app:local
    ports:
      - "20128:20128"
    volumes:
      - "$HOME/.hairouter:/app/data"
    environment:
      DATA_DIR: /app/data
      HEADROOM_URL: http://headroom:8787
    depends_on:
      - headroom

  headroom:
    image: ghcr.io/chopratejas/headroom:latest
    ports:
      - "8787:8787"
```

In the dashboard, open `Endpoint` → `Token Saver` → `Headroom`, confirm the URL is `http://headroom:8787`, recheck status, then enable Headroom.

If Headroom runs on the Docker host instead of as a sidecar, use `http://host.docker.internal:8787` on macOS/Windows. On Linux, add `--add-host=host.docker.internal:host-gateway` or the equivalent compose `extra_hosts` entry.

## Update to latest

```bash
# Build locally: docker build -t hairouter-app .
docker rm -f hairouter
# re-run the quick start command
```

---

# 🛠 For Developers

## Build image locally (test)

```bash
docker build -t hairouter-app .

docker run --rm -p 20128:20128 \
  -v "$HOME/.hairouter:/app/data" \
  -e DATA_DIR=/app/data \
  hairouter-app:local
```

## Publish (upstream legacy CI)

The original upstream project publishes Docker images to `decolua/9router` and `ghcr.io/decolua/9router`. **HAI-Router does not publish a separate registry image yet** — build locally from this repository.

If you maintain a fork with CI, tag and push to your own registry. Example manual tag flow:

```bash
# Use scripts/release.js (recommended)
node scripts/release.js "Release title" "Notes"

# Or manually
git tag v0.4.x && git push origin v0.4.x
```

Workflow (upstream only): `.github/workflows/docker-publish.yml` — not used for HAI-Router distribution unless you configure your own registry.
