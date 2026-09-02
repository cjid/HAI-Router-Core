# Compatibility — Legacy 9Router

HAI-Router is the canonical product identity. **9Router** names below are **compatibility inputs only** — not current branding, defaults, or install targets.

## Data directory

| Role | Path |
|------|------|
| **Canonical (read/write)** | `~/.hairouter/` · `%APPDATA%\hairouter\` |
| **Legacy (migration source)** | `~/.9router/` · `%APPDATA%\9router\` |

On first run, if legacy data exists and canonical does not, files are copied/migrated and a `.migrated-to-hairouter` marker is written under legacy. New writes never target `.9router`.

Environment:

- **Canonical:** `HAI_ROUTER_DATA_DIR`
- **Legacy alias:** `DATA_DIR` (deprecated; migrated to canonical layout when pointing at legacy paths)

## CLI package

The launcher in `cli/` is published historically as npm package **`9router`** with binary `9router`. HAI-Router does not claim a separate public npm package name unless published.

Current recommended install (from GitHub):

```bash
npm i -g github:cjid/HAI-Router-Core#main:cli
```

The `9router` command remains the executable name for backward compatibility. Product UI and docs use **HAI-Router**.

## HTTP headers (read aliases)

| Canonical | Legacy alias |
|-----------|--------------|
| `x-hai-router-connection-id` | `x-9router-connection-id` |
| `x-hai-router-token-saver` | `x-9router-token-saver` |

## Storage keys

Browser theme and related keys migrate once from legacy names (`9router-theme`, etc.) to `hairouter.*` — see `src/shared/constants/product.js`.

## Backup format

Exports use `product: "hairouter"`. Imports of backups with `product: "9router"` are accepted as legacy compatibility.

## SAML

Canonical issuer default: `urn:hairouter:sp`. Legacy `urn:9router:sp` accepted on read.

## MITM certificates

Legacy root CA common name `9Router MITM Root CA` and export basename `9router-root-ca.crt` remain recognized for existing installs.

## Runtime globals

In-process legacy global namespaces (e.g. `__9routerUsageStore`) are migrated once to `__haiRouter*` — see `open-sse/shared/runtimeGlobals.js`.

## Upstream attribution

Footer text may reference [9Router](https://github.com/decolua/9router) as the upstream project HAI-Router evolved from. This is **attribution**, not the update source.

**Updater:** HAI-Router installs from `github:cjid/HAI-Router-Core#main:cli`, not from `decolua/9router` releases or Docker images.

## Docker legacy

Do not use `decolua/9router` images for HAI-Router. Build from this repository with canonical names (`hairouter`, `hairouter-data`). A symlink inside the image may map `/root/.9router` → data home for legacy tools that still read that path.

## Developer sync (optional)

`scripts/sync-upstream.mjs` may pull selected changes from upstream 9Router — developer-only; not used by end-user auto-update.
