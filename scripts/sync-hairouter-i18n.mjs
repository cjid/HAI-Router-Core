#!/usr/bin/env node
/**
 * Add HAI-Router branded i18n keys derived from legacy 9router/9Router keys.
 * English source strings in UI use HAI-Router; literals must match exactly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const literalsDir = path.join(__dirname, "../public/i18n/literals");

/** @type {Array<{ old: string, neu: string }>} */
const KEY_MIGRATIONS = [
  {
    old: "Manual configuration is still available if 9router is deployed on a remote server.",
    neu: "Manual configuration is still available if HAI-Router is deployed on a remote server.",
  },
  {
    old: "Configure 9router as an OpenAI-compatible provider to route all jcode requests through 9router's optimization layer.",
    neu: "Configure HAI-Router as an OpenAI-compatible provider to route all jcode requests through HAI-Router's optimization layer.",
  },
  {
    old: "Administrator required — restart 9Router as Administrator to use MITM",
    neu: "Administrator required — restart HAI-Router as Administrator to use MITM",
  },
  {
    old: "Windows: Run terminal (9Router) as Administrator to enable MITM",
    neu: "Windows: Run terminal (HAI-Router) as Administrator to enable MITM",
  },
  {
    old: "Qwen Code supports multiple provider types (openai, anthropic, gemini) via modelProviders in settings.json. 9Router works as an OpenAI-compatible endpoint.",
    neu: "Qwen Code supports multiple provider types (openai, anthropic, gemini) via modelProviders in settings.json. HAI-Router works as an OpenAI-compatible endpoint.",
  },
  {
    old: "Any model available in 9Router can be used — not just Qwen models. Select from Qwen, Claude, Gemini, GPT, and more.",
    neu: "Any model available in HAI-Router can be used — not just Qwen models. Select from Qwen, Claude, Gemini, GPT, and more.",
  },
  {
    old: "Qwen OAuth free tier was discontinued on 2026-04-15. Use 9Router with alicode/openrouter/anthropic/gemini providers instead.",
    neu: "Qwen OAuth free tier was discontinued on 2026-04-15. Use HAI-Router with alicode/openrouter/anthropic/gemini providers instead.",
  },
  {
    old: "DeepSeek TUI uses ~/.deepseek/config.toml for configuration. 9Router will update the provider to 'openai' mode with your base_url, api_key, and model.",
    neu: "DeepSeek TUI uses ~/.deepseek/config.toml for configuration. HAI-Router will update the provider to 'openai' mode with your base_url, api_key, and model.",
  },
  {
    old: "Grok Build uses ~/.grok/config.toml. 9Router writes a [model.hairouter] custom model and sets it as the default.",
    neu: "Grok Build uses ~/.grok/config.toml. HAI-Router writes a [model.hairouter] custom model and sets it as the default.",
  },
  {
    old: "Use 9Router model aliases to keep Amp shorthand mappings stable across provider updates.",
    neu: "Use HAI-Router model aliases to keep Amp shorthand mappings stable across provider updates.",
  },
  {
    old: "Map Amp shorthand names such as g25p or cs45 to 9Router aliases in your local config.",
    neu: "Map Amp shorthand names such as g25p or cs45 to HAI-Router aliases in your local config.",
  },
  {
    old: "Alibaba Qwen Code CLI — supports OpenAI, Anthropic & Gemini providers via 9Router",
    neu: "Alibaba Qwen Code CLI — supports OpenAI, Anthropic & Gemini providers via HAI-Router",
  },
  {
    old: "3. Maps Antigravity models to any provider via 9Router",
    neu: "3. Maps Antigravity models to any provider via HAI-Router",
  },
  {
    old: "Intercepts Antigravity traffic via DNS redirect, letting you reroute models through 9Router.",
    neu: "Intercepts Antigravity traffic via DNS redirect, letting you reroute models through HAI-Router.",
  },
  {
    old: "Antigravity/Copilot IDE request → DNS redirect to localhost:443 → MITM proxy intercepts → 9Router → response to Antigravity/Copilot",
    neu: "Antigravity/Copilot IDE request → DNS redirect to localhost:443 → MITM proxy intercepts → HAI-Router → response to Antigravity/Copilot",
  },
  {
    old: "Use Antigravity IDE & GitHub Copilot → with ANY provider/model from 9Router",
    neu: "Use Antigravity IDE & GitHub Copilot → with ANY provider/model from HAI-Router",
  },
  {
    old: "9Router Base URL",
    neu: "HAI-Router Base URL",
  },
  {
    old: "traffic through 9Router via MITM.",
    neu: "traffic through HAI-Router via MITM.",
  },
];

function brandSwap(value) {
  return value
    .replace(/9Router/g, "HAI-Router")
    .replace(/9router/g, "HAI-Router");
}

for (const file of fs.readdirSync(literalsDir).filter((f) => f.endsWith(".json"))) {
  const fp = path.join(literalsDir, file);
  const data = JSON.parse(fs.readFileSync(fp, "utf8"));
  let changed = false;

  for (const { old, neu } of KEY_MIGRATIONS) {
    if (data[neu] !== undefined) continue;
    const legacy = data[old];
    data[neu] = typeof legacy === "string" ? brandSwap(legacy) : neu;
    changed = true;
  }

  if (changed) {
    const sorted = Object.fromEntries(
      Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
    );
    fs.writeFileSync(fp, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(`updated ${file}`);
  }
}

console.log("done");
