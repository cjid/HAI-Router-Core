# HAI-Router CLI (legacy npm package `9router`)

This directory is the **legacy-compatible global launcher**. npm package name and binary remain **`9router`** for backward compatibility. Product identity is **HAI-Router** — see [COMPATIBILITY.md](../COMPATIBILITY.md).

The dashboard/gateway source is the repository root (`hairouter-app`). For development from source, use root `npm run dev` / `npm run start`.

## Install (GitHub — canonical for HAI-Router)

Requires **read access** to the private repo. Authenticate first, then install:

```bash
gh auth login && gh auth setup-git
npm i -g github:cjid/HAI-Router-Core#main:cli
9router
```

Alternative (PAT with `repo` scope):

```bash
export GITHUB_TOKEN=ghp_your_token   # PowerShell: $env:GITHUB_TOKEN="ghp_..."
npm i -g github:cjid/HAI-Router-Core#main:cli
9router
```

Full deployment options (Docker, source, auth troubleshooting): **[DEPLOYMENT.md](../DEPLOYMENT.md)**.

There is no published npm package named `hairouter`. Do not document fictional package names.

## Legacy npm install

The upstream package [`9router`](https://www.npmjs.com/package/9router) on npm is the **historical upstream** distribution. HAI-Router updater installs from **this repository**, not from `decolua/9router` releases.

```bash
# Legacy upstream (attribution only — not HAI-Router default)
npm install -g 9router
```

## Commands

| Command | Description |
|---------|-------------|
| `9router` | Start server + optional tray |
| `9router update` | Reinstall from configured GitHub spec |

Runtime data: `~/.hairouter/` (legacy `~/.9router/` migrated automatically).

## Build / pack

From repository root:

```bash
npm run cli:pack
```

From this directory:

```bash
npm run build
npm run dev    # nodemon
```

## Docker

Build the gateway image from repository root — see [DOCKER.md](../DOCKER.md). Do not use `decolua/9router` images for HAI-Router deployments.

## License

MIT — see [LICENSE](./LICENSE).
