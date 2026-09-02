---
name: hairouter
description: Entry point for HAI-Router — local/remote AI gateway with OpenAI-compatible REST for chat, image, TTS, embeddings, web search, web fetch. Use when the user mentions HAI-Router, HAI_ROUTER_URL, or wants AI without writing provider boilerplate. This skill covers setup + indexes capability skills; fetch the relevant capability SKILL.md from the URLs below when needed.
---

# HAI-Router

Local/remote AI gateway exposing OpenAI-compatible REST. One key, many providers, auto-fallback.

## Setup

```bash
export HAI_ROUTER_URL="http://localhost:20128"      # or VPS / tunnel URL
export HAI_ROUTER_KEY="sk-..."                      # from Dashboard → Keys (only if requireApiKey=true)
```

All requests: `${HAI_ROUTER_URL}/v1/...` with header `Authorization: Bearer ${HAI_ROUTER_KEY}` (omit if auth disabled).

Verify: `curl $HAI_ROUTER_URL/api/health` → `{"ok":true}`

## Discover models

```bash
curl $HAI_ROUTER_URL/v1/models                  # chat/LLM (default)
curl $HAI_ROUTER_URL/v1/models/image            # image-gen
curl $HAI_ROUTER_URL/v1/models/tts              # text-to-speech
curl $HAI_ROUTER_URL/v1/models/embedding        # embeddings
curl $HAI_ROUTER_URL/v1/models/web              # web search + fetch (entries have `kind` field)
curl $HAI_ROUTER_URL/v1/models/stt              # speech-to-text
curl $HAI_ROUTER_URL/v1/models/image-to-text    # vision
```

Use `data[].id` as `model` field in requests. Combos appear with `owned_by:"combo"`.

Response shape:
```json
{ "object": "list", "data": [
  { "id": "openai/gpt-5", "object": "model", "owned_by": "openai", "created": 1735000000 },
  { "id": "tavily/search", "object": "model", "kind": "webSearch", "owned_by": "tavily", "created": 1735000000 }
]}
```

## Capability skills

When the user needs a specific capability, fetch that skill's `SKILL.md` from its raw URL:

| Capability | Raw URL |
|---|---|
| Chat / code-gen | https://raw.githubusercontent.com/cjid/HAIRouter/refs/heads/master/skills/hairouter-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/cjid/HAIRouter/refs/heads/master/skills/hairouter-image/SKILL.md |
| Video generation | https://raw.githubusercontent.com/cjid/HAIRouter/refs/heads/master/skills/hairouter-video/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/cjid/HAIRouter/refs/heads/master/skills/hairouter-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/cjid/HAIRouter/refs/heads/master/skills/hairouter-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/cjid/HAIRouter/refs/heads/master/skills/hairouter-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/cjid/HAIRouter/refs/heads/master/skills/hairouter-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/cjid/HAIRouter/refs/heads/master/skills/hairouter-web-fetch/SKILL.md |

## Errors

- 401 → set/refresh `HAI_ROUTER_KEY` (Dashboard → Keys)
- 400 `Invalid model format` → check `model` exists in `/v1/models/<kind>`
- 503 `All accounts unavailable` → wait `retry-after` or add another provider account
