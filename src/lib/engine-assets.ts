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

export const CORE_JS_URL = "/ffmpeg/ffmpeg-core.js";
export const CORE_WASM_URL = ffmpegCoreWasm.url;
// Whisper 모델은 사용자가 SYLT 화면에서 언어별로 수동 1회 다운로드한다.
// 앱 최초 접속/SW prewarm에서는 절대 자동 다운로드하지 않는다.
// - ko: 다국어 base-q5_1 (~57MB) — 한국어 인식용 (속도 우선)
// - en: 영어 전용 small.en-q5_1 (~181MB) — 영어 정확도 극대화
export const WHISPER_MODEL_URLS = {
  ko: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin",
  en: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin",
} as const;
export const WHISPER_MODEL_SIZE_LABELS = {
  ko: "약 60MB",
  en: "약 180MB",
} as const;
export const SHOUT_WASM_JS_URL = "/whisper/shout.wasm.js";

export const ENGINE_CACHE_NAME = "audiofly-media-engines-v2";

// SW prewarm 대상 — Whisper 모델은 여기에 포함하지 않는다.
export const ENGINE_CACHE_URLS: readonly string[] = [
  CORE_JS_URL,
  SHOUT_WASM_JS_URL,
  CORE_WASM_URL,
];
