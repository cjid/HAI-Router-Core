# Usage and Observability

How HAI-Router records tokens, latency, and request history.

## Usage sources

| Source | When |
|--------|------|
| **Provider-reported** | Upstream includes `usage` in response (preferred) |
| **Estimated** | Provider omits usage — router computes approximation |

Dashboard labels estimated usage where applicable. Estimated values are **not** provider-official billing numbers.

## Persistence

- **Usage aggregates:** usage DB under data directory (`usage.json` / related)
- **Request Details:** SQLite `requestDetails` table (`src/lib/db/repos/requestDetailsRepo.js`)
- **Request logs:** optional text log when `ENABLE_REQUEST_LOGS` is on

Canonical data root: `~/.hairouter/` (see [COMPATIBILITY.md](../COMPATIBILITY.md)).

## Request Details

Dashboard **Usage → Details** shows:

- List view: metadata only (payloads redacted in list API)
- Drawer: summary from list row immediately; full payloads fetched via `GET /api/usage/request-details/:id`
- Streaming requests: background poll while drawer open; stops at terminal status

Large JSON fields are truncated per `observabilityMaxJsonSize` settings.

## Stream termination

Partial usage on client abort / `ResponseAborted` is preserved where the provider or semantic layer reports partial output. Chunk boundaries do not change final token accounting for identical semantic content.

## Network metadata

Request detail records may include Go worker id, proxy label, and egress mode when available from the transport layer.

## Debugging

Enable debug stream logging via existing `DEBUG` / observability settings in runtime config — avoid permanent INFO spam on hot paths.

## Privacy

Full request/response bodies in Request Details may contain user prompts. Restrict dashboard access on shared machines.
