/**
 * Smoke checks after a production build. Use: npm run test:netlify-smoke
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function mustExist(rel, hint) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error(`FAIL: missing ${rel}${hint ? ` (${hint})` : ""}`);
    process.exit(1);
  }
}

mustExist("netlify.toml");
const toml = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
if (!toml.includes("@netlify/plugin-nextjs")) {
  console.error("FAIL: netlify.toml must include @netlify/plugin-nextjs");
  process.exit(1);
}
if (!toml.includes("npm run build")) {
  console.error("FAIL: netlify.toml build should run npm run build");
  process.exit(1);
}

mustExist(".next/BUILD_ID", "run npm run build first");
mustExist(".next/required-server-files.json");

console.log("OK: Netlify-oriented build smoke checks passed.");
