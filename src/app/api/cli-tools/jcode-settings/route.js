import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { parseTOML, stringifyTOML } from "confbox";
import {
  CLI_PROVIDER_SLUG,
  hasHairouterInMap,
  getProviderFromMap,
  setCanonicalProvider,
  removeHairouterProvider,
} from "@/lib/cliTools/providerConfig.js";

const execAsync = promisify(exec);

const PROVIDER_ENV_FILE = "provider-hairouter.env";
const LEGACY_PROVIDER_ENV_FILE = "provider-9router.env";
const API_KEY_ENV = "JCODE_HAIROUTER_API_KEY";
const LEGACY_API_KEY_ENV = "JCODE_9ROUTER_API_KEY";

const getJcodeConfigDir = () => path.join(os.homedir(), ".jcode");
const getConfigPath = () => path.join(getJcodeConfigDir(), "config.toml");

const getProviderEnvDir = () => {
  const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configDir, "jcode");
};

const getProviderEnvPath = () => path.join(getProviderEnvDir(), PROVIDER_ENV_FILE);
const getLegacyProviderEnvPath = () => path.join(getProviderEnvDir(), LEGACY_PROVIDER_ENV_FILE);

const checkJcodeInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where jcode" : "which jcode";
    await execAsync(command, { windowsHide: true });
    return true;
  } catch {
    try {
      await fs.access(getJcodeConfigDir());
      return true;
    } catch {
      return false;
    }
  }
};

const readConfig = async () => {
  try {
    const configPath = getConfigPath();
    const content = await fs.readFile(configPath, "utf-8");
    return parseTOML(content);
  } catch {
    return { providers: {} };
  }
};

const hasHairouterConfig = (config) => {
  if (!config?.providers) return false;
  if (hasHairouterInMap(config.providers)) return true;

  for (const provider of Object.values(config.providers)) {
    if (provider.base_url && provider.base_url.includes("localhost:20128")) {
      return true;
    }
  }

  return false;
};

const writeConfig = async (config) => {
  const configPath = getConfigPath();
  const content = stringifyTOML(config);
  await fs.writeFile(configPath, content, "utf-8");
};

const parseEnvFile = async (envPath) => {
  try {
    const content = await fs.readFile(envPath, "utf-8");
    const env = {};

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();

        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        env[key] = value;
      }
    }

    return env;
  } catch {
    return null;
  }
};

const readProviderEnv = async () => {
  const canonical = await parseEnvFile(getProviderEnvPath());
  if (canonical && Object.keys(canonical).length > 0) return canonical;
  return (await parseEnvFile(getLegacyProviderEnvPath())) || {};
};

const writeProviderEnv = async (env) => {
  const envPath = getProviderEnvPath();
  let content = "# jcode provider environment variables\n";

  for (const [key, value] of Object.entries(env)) {
    content += `${key}="${value}"\n`;
  }

  await fs.mkdir(getProviderEnvDir(), { recursive: true });
  await fs.writeFile(envPath, content, "utf-8");
};

export async function GET() {
  const isInstalled = await checkJcodeInstalled();

  if (!isInstalled) {
    return NextResponse.json({
      installed: false,
      message: "jcode not installed. Install via: curl -fsSL https://raw.githubusercontent.com/1jehuang/jcode/master/scripts/install.sh | bash",
    });
  }

  const config = await readConfig();

  return NextResponse.json({
    installed: true,
    config,
    hasHairouter: hasHairouterConfig(config),
    configPath: getConfigPath(),
  });
}

export async function POST(request) {
  try {
    const { baseUrl, apiKey, models } = await request.json();

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { error: "baseUrl and apiKey are required" },
        { status: 400 }
      );
    }

    const normalizedBaseUrl = baseUrl.endsWith("/v1")
      ? baseUrl
      : `${baseUrl}/v1`;

    let config = await readConfig();

    if (!config.providers) {
      config.providers = {};
    }

    setCanonicalProvider(config.providers, {
      type: "openai-compatible",
      base_url: normalizedBaseUrl,
      auth: "bearer",
      api_key_env: API_KEY_ENV,
      env_file: PROVIDER_ENV_FILE,
      default_model: models && models.length > 0 ? models[0] : "cc/claude-opus-4-7",
      requires_api_key: true,
    });

    const configDir = getJcodeConfigDir();
    await fs.mkdir(configDir, { recursive: true });

    await writeConfig(config);

    await fs.mkdir(getProviderEnvDir(), { recursive: true });

    const env = await readProviderEnv();
    delete env[LEGACY_API_KEY_ENV];
    env[API_KEY_ENV] = apiKey;
    await writeProviderEnv(env);

    return NextResponse.json({
      success: true,
      message: `jcode configured successfully. Use: jcode --provider-profile ${CLI_PROVIDER_SLUG}`,
      configPath: getConfigPath(),
    });
  } catch (error) {
    console.error("Error configuring jcode:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const config = await readConfig();

    if (!config.providers) {
      return NextResponse.json({ success: true, message: "No configuration to remove" });
    }

    removeHairouterProvider(config.providers);

    await writeConfig(config);

    const env = await readProviderEnv();
    delete env[API_KEY_ENV];
    delete env[LEGACY_API_KEY_ENV];
    await writeProviderEnv(env);

    return NextResponse.json({
      success: true,
      message: "HAI-Router configuration removed from jcode",
    });
  } catch (error) {
    console.error("Error removing jcode configuration:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
