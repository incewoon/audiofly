// scripts/copy-ffmpeg-worker.mjs
//
// @ffmpeg/ffmpeg's package.json "exports" field does not expose
// dist/esm/worker.js as an importable subpath, so any deep import
// (import "@ffmpeg/ffmpeg/dist/esm/worker.js?url") is rejected by Vite/Node's
// module resolver ("is not exported under the conditions..."). Instead, copy
// the file into public/ffmpeg/ as a real static asset right after install,
// so it gets a stable same-origin URL that convert.ts can fetch + blob-URL
// (same trick already used for coreURL/wasmURL).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js");
const DEST_DIR = path.resolve(process.cwd(), "public/ffmpeg");
const DEST = path.join(DEST_DIR, "worker.js");

if (!existsSync(SRC)) {
  console.error("[copy-ffmpeg-worker] SKIP: source not found:", SRC);
  process.exit(0); // 패키지 버전이 바뀌어 경로가 달라져도 install 자체는 막지 않음
}

mkdirSync(DEST_DIR, { recursive: true });
copyFileSync(SRC, DEST);
console.log("[copy-ffmpeg-worker] copied worker.js ->", DEST);
