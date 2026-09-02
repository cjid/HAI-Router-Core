# Security

HAI-Router is a local gateway: it holds provider credentials, proxies AI traffic, and serves a dashboard. Treat the host running HAI-Router as trusted for credential storage.

## Secrets and environment

Required / sensitive variables (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Session cookie signing |
| `INITIAL_PASSWORD` | Default dashboard login (change before expose) |
| `API_KEY_SECRET` | API key derivation |
| `MACHINE_ID_SALT` | Stable machine identity salt |

Canonical data path: `HAI_ROUTER_DATA_DIR`. Do not commit `.env`, SQLite files, MITM private keys, or backup exports.

## Authentication

- Dashboard session via JWT cookie
- Optional `REQUIRE_API_KEY` for `/v1/*`
- SAML support with canonical issuer `urn:hairouter:sp`

## Egress model

**Invariant:** provider-facing HTTP from Node must be **zero**. Upstream calls go through the Go Engine worker except explicitly audited allowlist paths (loopback self-test, user-configured proxies, control-plane deploy APIs).

Verify before release:

```bash
npm run audit:egress
```

## MITM / CLI tools

MITM features install a local root CA for CLI interception. Requires elevated privileges on some platforms. Legacy CA filenames may reference 9Router for compatibility — see [COMPATIBILITY.md](./COMPATIBILITY.md).

## Request logs and observability

When enabled, Request Details store metadata and optionally truncated payloads under SQLite. List API redacts conversation bodies; full detail requires dashboard auth. Do not expose the dashboard without login on untrusted networks.

## Updates

In-app updater installs from `github:cjid/HAI-Router-Core#main:cli`, not upstream `decolua/9router` releases.

## Reporting

Report security issues through your organization's channel for this repository. Do not commit credentials or production database files to Git.
