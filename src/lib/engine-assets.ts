// src/lib/engine-assets.ts
//
// Single source of truth for large engine asset URLs.
// The Lovable assets integration re-hashes asset IDs on re-upload, so any
// hardcoded copy of these URLs will silently drift. Every runtime module and
// the service worker MUST import from this file — never inline the URL.
//
// The pointer JSON files (public/**/*.asset.json) are written by
// `lovable-assets create`; they are the authoritative source. Update ONE file
// (the pointer) and every consumer stays in sync automatically.

import ffmpegCoreWasm from "../../public/ffmpeg/ffmpeg-core.wasm.asset.json";
import whisperModel from "../../public/whisper-models/ggml-base-q5_1.bin.asset.json";

export const CORE_JS_URL = "/ffmpeg/ffmpeg-core.js";
export const CORE_WASM_URL = ffmpegCoreWasm.url;
export const FFMPEG_WORKER_URL = "/ffmpeg/worker.js";   // 추가
export const WHISPER_MODEL_URL = whisperModel.url;
export const SHOUT_WASM_JS_URL = "/whisper/shout.wasm.js";

export const ENGINE_CACHE_NAME = "audiofly-media-engines-v2";

export const ENGINE_CACHE_URLS: readonly string[] = [
  CORE_JS_URL,
  FFMPEG_WORKER_URL,   
  SHOUT_WASM_JS_URL,
  CORE_WASM_URL,
  WHISPER_MODEL_URL,
];
