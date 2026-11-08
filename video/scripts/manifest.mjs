// Scans public/ and writes src/assets.json so components know which optional
// assets (footage, VO, music, captions) are present without filesystem access.
import { readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const PUBLIC = path.resolve("public");
const files = [];
function walk(dir, prefix = "") {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
    else files.push(`${prefix}${entry.name}`);
  }
}
if (existsSync(PUBLIC)) walk(PUBLIC);
mkdirSync("src", { recursive: true });
writeFileSync("src/assets.json", JSON.stringify(files.sort(), null, 1));
console.log(`${files.length} assets in manifest`);
