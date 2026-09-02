# Provider Safety

Provider Safety is a **global control-plane policy** in the HAI-Router dashboard that limits concurrent upstream load per provider and protects the local runtime from overload.

## Scope

- Applies at **provider** granularity (including generic/custom OpenAI-compatible providers)
- Independent of Go worker **count** — workers are transport capacity; Provider Safety is admission policy
- Configured via dashboard **Provider Safety** card (global provider policies)

## Controls (current)

| Control | Purpose |
|---------|---------|
| **providerMax** | Maximum concurrent in-flight requests per provider |
| **Circuit / health** | Reduce traffic to unhealthy providers when implemented in policy layer |
| **Runtime lanes** | Isolate provider execution lanes where configured |

Exact field names and defaults live in dashboard settings repos — verify in `src/` Provider Safety components before documenting new knobs.

## Interaction with routing

1. Client request enters Node `/v1/*`
2. Model/combo/account selection runs
3. Provider Safety admission check
4. Approved request → Go Engine transport → upstream

Rejected requests fail fast without opening provider connections.

## Not in scope

- Per-model pricing or usage caps (see Usage observability)
- Client-side rate limits (use API keys / reverse proxy separately)

## Testing

Provider Safety behavior is covered by dashboard and integration tests where present. After policy changes, run focused vitest suites touching provider admission and concurrent routing.
