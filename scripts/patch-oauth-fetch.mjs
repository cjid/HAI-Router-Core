import fs from "fs";
import path from "path";

const roots = ["src/lib/oauth/providers", "src/lib/oauth/services"];
const extra = ["src/lib/oauth/providerHelpers.js", "src/lib/oauth/kiroExternalIdp.js"];

function relImport(file) {
  const dir = path.dirname(file);
  const targetDir = path.dirname(path.join("src/lib/oauth/fetch.js"));
  let rel = path.relative(dir, targetDir).replace(/\\/g, "/");
  if (!rel || rel === ".") return "./fetch.js";
  return `${rel}/fetch.js`;
}

const files = [...extra];
for (const root of roots) {
  for (const f of fs.readdirSync(root)) {
    if (!f.endsWith(".js") || f === "index.js") continue;
    files.push(path.join(root, f));
  }
}

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  if (!/\bfetch\s*\(/.test(src)) continue;
  if (src.includes("oauthFetch as fetch")) continue;
  const importLine = `import { oauthFetch as fetch } from "${relImport(file)}";\n`;
  fs.writeFileSync(file, importLine + src);
  console.log("patched", file);
}
