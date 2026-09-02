import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p);
    else if (name.name === "route.js") {
      const c = fs.readFileSync(p, "utf8");
      if (c.startsWith('"use server";')) {
        fs.writeFileSync(p, c.replace(/^"use server";\r?\n\r?\n/, ""));
        console.log("fixed", p);
      }
    }
  }
}

walk("src/app/api");
