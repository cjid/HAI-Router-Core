import fs from "node:fs";

const files = [
  "open-sse/handlers/ttsProviders/openai.js",
  "open-sse/handlers/ttsProviders/selfhostedTts.js",
  "open-sse/handlers/ttsProviders/openrouter.js",
  "open-sse/handlers/ttsProviders/xiaomi-mimo.js",
  "open-sse/handlers/ttsProviders/elevenlabs.js",
  "open-sse/handlers/ttsProviders/gemini.js",
  "open-sse/handlers/ttsProviders/minimax.js",
];

for (const rel of files) {
  let src = fs.readFileSync(rel, "utf8");
  if (!src.includes("modalityFetch")) {
    const importLine = 'import { modalityFetch } from "../modalityProxy.js";\n';
    const firstImport = src.match(/^import .+\n/m);
    if (firstImport) {
      src = src.replace(firstImport[0], firstImport[0] + importLine);
    } else {
      src = importLine + src;
    }
  }
  src = src.replace(/await fetch\(/g, "await modalityFetch(");
  src = src.replace(/return fetch\(/g, "return modalityFetch(");
  // Add credentials as third arg when missing
  src = src.replace(/await modalityFetch\(([\s\S]*?)\);/g, (match, inner) => {
    if (inner.includes(", credentials")) return match;
    return `await modalityFetch(${inner}, credentials);`;
  });
  src = src.replace(/return modalityFetch\(([\s\S]*?)\);/g, (match, inner) => {
    if (inner.includes(", credentials")) return match;
    return `return modalityFetch(${inner}, credentials);`;
  });
  fs.writeFileSync(rel, src);
  console.log("patched", rel);
}
