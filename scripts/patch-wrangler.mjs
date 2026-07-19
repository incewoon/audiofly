// scripts/patch-wrangler.mjs
//
// Cloudflare Workers Static Assets does not honor public/_headers. To make
// COOP/COEP apply to every response (including static assets like
// @ffmpeg/ffmpeg's internal worker chunks), we force `assets.run_worker_first`
// so the Worker's fetch() handler runs for every request and can attach the
// isolation headers.
//
// This script edits nitro's generated .output/server/wrangler.json in place.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const target = path.resolve(process.cwd(), ".output/server/wrangler.json");
if (!existsSync(target)) {
  console.log("[patch-wrangler] skip: .output/server/wrangler.json not found");
  process.exit(0);
}

const raw = await readFile(target, "utf8");

// nitro may emit JSONC (comments / trailing commas). Strip them before parse.
const stripped = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'])\/\/.*$/gm, "$1")
  .replace(/,\s*([}\]])/g, "$1");

let cfg;
try {
  cfg = JSON.parse(stripped);
} catch (err) {
  console.error(
    "[patch-wrangler] FAILED to parse wrangler.json:",
    err?.message ?? err,
  );
  console.error("[patch-wrangler] raw content follows ─────");
  console.error(raw);
  process.exit(1);
}

if (typeof cfg !== "object" || cfg === null) {
  console.error("[patch-wrangler] FAILED: wrangler.json root is not an object");
  process.exit(1);
}

cfg.assets = { ...(cfg.assets ?? {}), run_worker_first: true };
await writeFile(target, JSON.stringify(cfg, null, 2));
console.log("[patch-wrangler] OK: assets.run_worker_first = true");
