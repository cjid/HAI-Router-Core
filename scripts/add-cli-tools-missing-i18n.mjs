#!/usr/bin/env node
/**
 * Register CLI Tools strings missing from locale catalogs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const literalsDir = path.join(__dirname, "../public/i18n/literals");

/** @type {Record<string, Partial<Record<string, string>>>} */
const CATALOG = {
  "After Apply, run grok (or /model hairouter) to use the routed model. Switch back anytime with /model grok-build.": {
    "zh-CN": "应用后，运行 grok（或 /model hairouter）以使用路由模型。随时可用 /model grok-build 切换回来。",
    id: "Setelah Apply, jalankan grok (atau /model hairouter) untuk memakai model yang diarahkan. Kembali kapan saja dengan /model grok-build.",
  },
  "Checking Grok Build...": {
    "zh-CN": "正在检查 Grok Build...",
    id: "Memeriksa Grok Build...",
  },
  "Cognition Devin CLI — local binary called by the Devin CLI provider via ACP/stdio": {
    "zh-CN": "Cognition Devin CLI — 由 Devin CLI 提供商通过 ACP/stdio 调用的本地二进制",
    id: "Cognition Devin CLI — binary lokal yang dipanggil oleh penyedia Devin CLI melalui ACP/stdio",
  },
  "Config path: Linux/macOS ~/.deepseek/config.toml • Windows %USERPROFILE%\\.deepseek\\config.toml": {
    "zh-CN": "配置路径：Linux/macOS ~/.deepseek/config.toml • Windows %USERPROFILE%\\.deepseek\\config.toml",
    id: "Path konfigurasi: Linux/macOS ~/.deepseek/config.toml • Windows %USERPROFILE%\\.deepseek\\config.toml",
  },
  "Config path: Linux/macOS ~/.grok/config.toml • Windows %USERPROFILE%\\.grok\\config.toml": {
    "zh-CN": "配置路径：Linux/macOS ~/.grok/config.toml • Windows %USERPROFILE%\\.grok\\config.toml",
    id: "Path konfigurasi: Linux/macOS ~/.grok/config.toml • Windows %USERPROFILE%\\.grok\\config.toml",
  },
  "Config path: Linux/macOS ~/.qwen/settings.json • Windows %USERPROFILE%\\.qwen\\settings.json": {
    "zh-CN": "配置路径：Linux/macOS ~/.qwen/settings.json • Windows %USERPROFILE%\\.qwen\\settings.json",
    id: "Path konfigurasi: Linux/macOS ~/.qwen/settings.json • Windows %USERPROFILE%\\.qwen\\settings.json",
  },
  "Context window": {
    "zh-CN": "上下文窗口",
    id: "Jendela konteks",
  },
  "Cursor IDE with MITM": {
    "zh-CN": "带 MITM 的 Cursor IDE",
    id: "Cursor IDE dengan MITM",
  },
  "Exa MCP": { "zh-CN": "Exa MCP", id: "Exa MCP" },
  "Go to Settings → Models": {
    "zh-CN": "前往 设置 → 模型",
    id: "Buka Pengaturan → Model",
  },
  "Google Gemini CLI": {
    "zh-CN": "Google Gemini CLI",
    id: "Google Gemini CLI",
  },
  "Grok Build not detected locally": {
    "zh-CN": "未在本地检测到 Grok Build",
    id: "Grok Build tidak terdeteksi secara lokal",
  },
  "Install Amp": { "zh-CN": "安装 Amp", id: "Instal Amp" },
  "Install Devin CLI": { "zh-CN": "安装 Devin CLI", id: "Instal Devin CLI" },
  "Install the Devin CLI and run `devin auth login` — without it, the provider returns a spawn error on first request.": {
    "zh-CN": "安装 Devin CLI 并运行 `devin auth login` — 否则提供商在首次请求时会返回 spawn 错误。",
    id: "Instal Devin CLI dan jalankan `devin auth login` — tanpa itu, penyedia mengembalikan error spawn pada permintaan pertama.",
  },
  "Install the plugin": { "zh-CN": "安装插件", id: "Instal plugin" },
  "Install via the official installer at cli.devin.ai.": {
    "zh-CN": "通过 cli.devin.ai 的官方安装程序安装。",
    id: "Instal melalui installer resmi di cli.devin.ai.",
  },
  "Install: curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash": {
    "zh-CN": "安装：curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash",
    id: "Instal: curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash",
  },
  "Invoke OpenDesign from your agent:": {
    "zh-CN": "从您的代理调用 OpenDesign：",
    id: "Panggil OpenDesign dari agen Anda:",
  },
  "Invoke with /opendesign <brief>. Covers decks, wireframes, interactive prototypes, design-system extraction, and brand systems, with a verifier subagent that checks output against the brief.": {
    "zh-CN": "使用 /opendesign <brief> 调用。涵盖演示文稿、线框图、交互原型、设计系统提取和品牌系统，并带有根据简报验证输出的验证子代理。",
    id: "Panggil dengan /opendesign <brief>. Mencakup deck, wireframe, prototipe interaktif, ekstraksi design system, dan brand system, dengan subagen verifikator yang memeriksa output terhadap brief.",
  },
  "Leave blank to inherit Main Model. Each override keeps its own context window.": {
    "zh-CN": "留空以继承主模型。每个覆盖项保留自己的上下文窗口。",
    id: "Biarkan kosong untuk mewarisi Model Utama. Setiap override mempertahankan jendela konteksnya sendiri.",
  },
  "Log in once so the binary stores its own credentials.": {
    "zh-CN": "登录一次，以便二进制文件存储自己的凭据。",
    id: "Masuk sekali agar binary menyimpan kredensialnya sendiri.",
  },
  MCP: { "zh-CN": "MCP", id: "MCP" },
  "No config needed": { "zh-CN": "无需配置", id: "Tidak perlu konfigurasi" },
  "Open Config": { "zh-CN": "打开配置", id: "Buka Konfigurasi" },
  "OpenDesign runs inside your host agent and uses its model config. If the host already routes through HAI-Router, /opendesign traffic does too.": {
    "zh-CN": "OpenDesign 在宿主代理内运行并使用其模型配置。如果宿主已通过 HAI-Router 路由，/opendesign 流量也会如此。",
    id: "OpenDesign berjalan di dalam agen host dan memakai konfigurasi modelnya. Jika host sudah diarahkan melalui HAI-Router, lalu lintas /opendesign juga demikian.",
  },
  "OpenDesign ships as a plugin/skills pack installed into Claude Code, Cursor, OpenAI Codex, Gemini CLI, or OpenCode. It inherits the host agent's model config, so once your host points at HAI-Router, /opendesign design sessions route through HAI-Router automatically — no extra env vars needed.": {
    "zh-CN": "OpenDesign 作为插件/技能包安装到 Claude Code、Cursor、OpenAI Codex、Gemini CLI 或 OpenCode。它继承宿主代理的模型配置，因此一旦宿主指向 HAI-Router，/opendesign 设计会话会自动通过 HAI-Router 路由 — 无需额外环境变量。",
    id: "OpenDesign hadir sebagai plugin/paket skill yang diinstal ke Claude Code, Cursor, OpenAI Codex, Gemini CLI, atau OpenCode. Ia mewarisi konfigurasi model agen host, jadi setelah host mengarah ke HAI-Router, sesi desain /opendesign otomatis diarahkan melalui HAI-Router — tanpa env var tambahan.",
  },
  "OpenDesign — claude.ai/design open-sourced! Agent-native design skills pack": {
    "zh-CN": "OpenDesign — claude.ai/design 开源！面向代理的原生设计技能包",
    id: "OpenDesign — claude.ai/design open source! Paket skill desain native untuk agen",
  },
  "Pick any Devin CLI model under the Providers tab — no API key field needed.": {
    "zh-CN": "在提供商选项卡下选择任意 Devin CLI 模型 — 无需 API 密钥字段。",
    id: "Pilih model Devin CLI apa pun di tab Penyedia — tidak perlu kolom API key.",
  },
  "Pick your host below and run the matching install command from the matrix.": {
    "zh-CN": "在下方选择宿主并运行矩阵中对应的安装命令。",
    id: "Pilih host di bawah dan jalankan perintah instal yang sesuai dari matriks.",
  },
  "Start designing": { "zh-CN": "开始设计", id: "Mulai mendesain" },
  "Subagent model overrides": {
    "zh-CN": "子代理模型覆盖",
    id: "Override model subagen",
  },
  "This is a local dependency, not a routed CLI. The Devin CLI provider spawns `devin acp --agent-type summarizer` and relays its output.": {
    "zh-CN": "这是本地依赖，不是路由 CLI。Devin CLI 提供商会启动 `devin acp --agent-type summarizer` 并转发其输出。",
    id: "Ini dependensi lokal, bukan CLI yang diarahkan. Penyedia Devin CLI menjalankan `devin acp --agent-type summarizer` dan meneruskan outputnya.",
  },
  "Use the provider": { "zh-CN": "使用提供商", id: "Gunakan penyedia" },
  "chatLanguageModels.json": {
    "zh-CN": "chatLanguageModels.json",
    id: "chatLanguageModels.json",
  },
  "curl -fsSL https://app.factory.ai/cli | sh": {
    "zh-CN": "curl -fsSL https://app.factory.ai/cli | sh",
    id: "curl -fsSL https://app.factory.ai/cli | sh",
  },
  "curl -fsSL https://x.ai/cli/install.sh | bash": {
    "zh-CN": "curl -fsSL https://x.ai/cli/install.sh | bash",
    id: "curl -fsSL https://x.ai/cli/install.sh | bash",
  },
  "docs.cline.bot": { "zh-CN": "docs.cline.bot", id: "docs.cline.bot" },
  "kilocode.ai": { "zh-CN": "kilocode.ai", id: "kilocode.ai" },
  "npm install -g @anthropic-ai/claude-code": {
    "zh-CN": "npm install -g @anthropic-ai/claude-code",
    id: "npm install -g @anthropic-ai/claude-code",
  },
  "npm install -g @openai/codex": {
    "zh-CN": "npm install -g @openai/codex",
    id: "npm install -g @openai/codex",
  },
  "npm install -g @qwen-code/qwen-code": {
    "zh-CN": "npm install -g @qwen-code/qwen-code",
    id: "npm install -g @qwen-code/qwen-code",
  },
  "npm install -g deepseek-tui": {
    "zh-CN": "npm install -g deepseek-tui",
    id: "npm install -g deepseek-tui",
  },
  "npm install -g opencode-ai": {
    "zh-CN": "npm install -g opencode-ai",
    id: "npm install -g opencode-ai",
  },
  "xAI Grok Build TUI coding agent": {
    "zh-CN": "xAI Grok Build TUI 编程代理",
    id: "Agen coding xAI Grok Build TUI",
  },
  "~/.codex/config.toml": {
    "zh-CN": "~/.codex/config.toml",
    id: "~/.codex/config.toml",
  },
  "sk_hairouter (default)": {
    "zh-CN": "sk_hairouter（默认）",
    id: "sk_hairouter (default)",
  },
};

for (const file of fs.readdirSync(literalsDir).filter((f) => f.endsWith(".json"))) {
  const locale = file.replace(/\.json$/, "");
  const fp = path.join(literalsDir, file);
  const data = JSON.parse(fs.readFileSync(fp, "utf8"));
  let changed = false;

  for (const [key, translations] of Object.entries(CATALOG)) {
    if (data[key] !== undefined) continue;
    const value = translations[locale] || translations["zh-CN"] || key;
    data[key] = value;
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
