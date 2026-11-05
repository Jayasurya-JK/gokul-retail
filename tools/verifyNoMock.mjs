// Fails if the preview mock reached a production bundle. Run after `npm run build:ui`
// (part of `npm run check`). Scans every file under apps/*/dist for the mock's marker string and
// for the mock file names, and insists the bundles exist and contain real app code.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKERS = ["__GOKUL_PREVIEW_MOCK_7f3a9c__", "api.mock", "PREVIEW MOCK", "gokul-preview-mock"];
const REAL_CODE = "startup_status"; // the real api.ts command name must be present

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let bad = 0;
for (const app of ["pos", "office"]) {
  const dist = join(root, "apps", app, "dist");
  if (!existsSync(dist)) {
    console.error(`verify:bundle: ${dist} is missing - run "npm run build:ui" first`);
    bad++;
    continue;
  }
  const files = walk(dist);
  let sawReal = false;
  for (const f of files) {
    const text = readFileSync(f, "latin1");
    if (text.includes(REAL_CODE)) sawReal = true;
    for (const m of MARKERS) {
      if (text.includes(m)) {
        console.error(`verify:bundle: "${m}" found in ${f}`);
        bad++;
      }
    }
  }
  if (!sawReal) {
    console.error(`verify:bundle: ${app} bundle has no real api code ("${REAL_CODE}"); the check cannot be trusted`);
    bad++;
  }
}
if (bad > 0) process.exit(1);
console.log("verify:bundle: no preview mock in the production bundles");
