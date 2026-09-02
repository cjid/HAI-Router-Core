# HAI Go Provider Transport Engine

Worker process that owns **provider-facing HTTP transport** for HAI-Router.

## Build

```bash
# from repo root (Go 1.22+ required)
node scripts/build-go-engine.mjs
# or
cd go-engine && go build -o bin/hai-worker ./cmd/worker
```

## Run (standalone debug)

```bash
export HAI_WORKER_AUTH_TOKEN=$(openssl rand -hex 32)
./go-engine/bin/hai-worker
```

## Tests

```bash
cd go-engine
go test ./...
go vet ./...
```

### Windows — CGO / `-race`

Race detector requires CGO + GCC. Install once:

```powershell
winget install BrechtSanders.WinLibs.POSIX.UCRT --accept-package-agreements --accept-source-agreements
```

Restart terminal, then:

```powershell
$env:CGO_ENABLED = "1"
go test -race ./...
go test -short ./...   # skips stress_test.go
```

GCC path (WinGet): `%LOCALAPPDATA%\Microsoft\WinGet\Packages\...\mingw64\bin\gcc.exe`

## Packaging

```bash
npm run build:go-engine:all   # go-engine/bin/hai-worker-{platform}
npm run audit:egress          # must exit 0
```

## Node integration

Set `HAI_GO_ENGINE=1` and ensure `go-engine/bin/hai-worker` exists (or `HAI_GO_WORKER_PATH`).

See [docs/GO_ENGINE_MIGRATION.md](../docs/GO_ENGINE_MIGRATION.md).
