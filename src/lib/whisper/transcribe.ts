// src/lib/whisper/transcribe.ts

// Client-only Whisper.cpp WASM wrapper.
// Loaded via dynamic import so it never lands in the server bundle.

import { toBlobURL } from "@ffmpeg/util";

export interface WhisperSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface TranscribeCallbacks {
  onModelProgress?: (loaded: number, total: number) => void;
  onProgress?: (percent: number) => void;
  onSegment?: (seg: WhisperSegment) => void;
}

// Asset URLs come from src/lib/engine-assets.ts (single source of truth backed by
// the Lovable asset pointer JSON). Never hardcode `/__l5e/...` here — it drifts.
import {
  WHISPER_MODEL_URL,
  SHOUT_WASM_JS_URL,
  ENGINE_CACHE_NAME,
} from "../engine-assets";

const MODEL_URL = WHISPER_MODEL_URL;
// Cache Storage requires an http(s) or same-origin URL as the Request key —
// custom schemes like "whisper-model:" throw
// `Failed to execute 'put' on 'Cache': Request scheme 'whisper-model' is unsupported`.
const MODEL_CACHE_URL = MODEL_URL;
const MODEL_CACHE_NAME = ENGINE_CACHE_NAME;
const INIT_TIMEOUT_MS = 120_000;
const TRANSCRIBE_TIMEOUT_MS = 10 * 60_000;

function makeAbortableTimeout(ms: number, tag: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(`${tag} timed out after ${ms}ms`), ms);
  return { controller, clear: () => window.clearTimeout(timeout) };
}

async function loadModelBlob(cb?: TranscribeCallbacks): Promise<File> {
  if (!("caches" in globalThis)) {
    throw new Error("이 브라우저는 오프라인 모델 캐시를 지원하지 않습니다.");
  }

  const cache = await caches.open(MODEL_CACHE_NAME);
  const cacheKey = new Request(MODEL_CACHE_URL);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const buf = await cached.arrayBuffer();
    cb?.onModelProgress?.(buf.byteLength, buf.byteLength);
    return new File([buf], "model.bin", { type: "application/octet-stream" });
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("음성인식 모델이 아직 캐시되지 않았습니다. 최초 1회는 온라인 상태에서 자동추출을 실행해 주세요.");
  }

  const modelFetch = makeAbortableTimeout(120_000, "Whisper model download");
  const res = await fetch(MODEL_URL, {
    cache: "force-cache",
    credentials: "same-origin",
    signal: modelFetch.controller.signal,
  }).finally(modelFetch.clear);
  if (!res.ok || !res.body) throw new Error(`모델 다운로드 실패 (${res.status})`);
  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      cb?.onModelProgress?.(loaded, total || loaded);
    }
  }
  const blob = new Blob(chunks as BlobPart[], { type: "application/octet-stream" });
  await cache.put(
    cacheKey,
    new Response(blob, {
      headers: { "content-type": "application/octet-stream", "content-length": String(blob.size) },
    }),
  );
  return new File([blob], "ggml-base-q5_1.bin", { type: "application/octet-stream" });
}

let cachedTranscriber: any = null;


function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${tag} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function assertAudioDecodable(file: File) {
  const AudioCtx = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
  if (!AudioCtx) throw new Error("이 브라우저는 오디오 디코딩을 지원하지 않습니다.");
  const ctx = new AudioCtx({ sampleRate: 16000 });
  try {
    const buf = await file.arrayBuffer();
    await withTimeout(ctx.decodeAudioData(buf.slice(0)), 60_000, "AudioContext.decodeAudioData()");
  } catch (err) {
    throw new Error(`MP3 오디오를 해석하지 못했습니다. 다른 MP3 파일로 시도해 주세요. (${err instanceof Error ? err.message : String(err)})`);
  } finally {
    ctx.close?.();
  }
}

// Do NOT wrap the shout module in a blob: URL. Its default export creates a
// pthread WASM instance that internally does `new URL(import.meta.url)` to
// spawn workers, which throws "Failed to construct 'URL': Invalid URL" when
// the module was loaded from a blob: URL. Import the real same-origin path
// directly; the SW's CacheFirst rule already caches it for offline use.

async function resetTranscriber() {
  const current = cachedTranscriber;
  cachedTranscriber = null;
  try { await current?.cancel?.(); } catch {}
  try { current?.destroy?.(); } catch {}
}

export async function transcribeMp3(
  file: File,
  cb: TranscribeCallbacks = {},
): Promise<WhisperSegment[]> {
  if (!(globalThis as any).crossOriginIsolated) {
    throw new Error(
      "음성인식을 위해 페이지가 cross-origin isolated 상태여야 합니다. 페이지를 새로고침 후 다시 시도해 주세요.",
    );
  }

  console.log("[whisper] loading model…");
  const model = await loadModelBlob(cb);
  console.log("[whisper] model ready:", model.size, "bytes");

  console.log("[whisper] validating audio decode…");
  await assertAudioDecodable(file);

  console.log("[whisper] importing transcriber + local shout wasm module…");
  const [{ FileTranscriber }, shoutMod] = await Promise.all([
    import("@transcribe/transcriber"),
    import(/* @vite-ignore */ SHOUT_WASM_JS_URL),
  ]);
  const rawCreateModule = (shoutMod as any).default;
  if (typeof rawCreateModule !== "function") {
    throw new Error("Whisper WASM 모듈 로드 실패: @transcribe/shout default export가 함수가 아님");
  }

  // shout.wasm.js는 실제 연산 시작 시 pthread 워커를 하나 더 스폰하는데,
  // Module["mainScriptUrlOrBlob"]을 안 주면 실제 네트워크 경로
  // (new URL("shout.wasm.js", import.meta.url))로 새 Worker를 띄운다.
  // 이 정적 파일 응답엔 COOP/COEP 헤더가 안 붙어있어(Cloudflare Static
  // Assets가 Worker fetch 핸들러를 안 거치고 직접 서빙) 그 워커가 조용히
  // 차단된다(ffmpeg의 classWorkerURL과 동일한 문제). 같은 파일을 우리가
  // 미리 fetch해서 blob: URL로 만들어 mainScriptUrlOrBlob으로 넘기면,
  // 네트워크 경로를 아예 안 타므로 이 COEP 제약을 우회한다.
  const shoutBlobURL = await toBlobURL(SHOUT_WASM_JS_URL, "text/javascript");
  console.log("[whisper] pthread worker will use blob URL", shoutBlobURL);
  const createModule = (moduleArg: Record<string, unknown> = {}) =>
    rawCreateModule({ ...moduleArg, mainScriptUrlOrBlob: shoutBlobURL });

  try {
    if (!cachedTranscriber) {
      console.log("[whisper] initializing FileTranscriber…");
      cachedTranscriber = new FileTranscriber({
        createModule,
        model: model as any,
        print: (message: string) => console.log("[whisper:stdout]", message),
        printErr: (message: string) => console.warn("[whisper:stderr]", message),
        onAbort: () => console.warn("[whisper] wasm aborted"),
        onExit: (status: unknown) => console.warn("[whisper] wasm exited", status),
        onComplete: (result: unknown) => console.log("[whisper] complete callback", result),
        onSegment: (segment: unknown) => {
          console.log("[whisper] segment", segment);
          const seg = (segment as any)?.segment;
          if (seg?.text) {
            cb.onSegment?.({
              startMs: Math.max(0, Math.round(seg.offsets?.from ?? 0)),
              endMs: Math.max(0, Math.round(seg.offsets?.to ?? 0)),
              text: String(seg.text).trim(),
            });
          }
        },
        onProgress: (p: number) => {
          console.log("[whisper] progress", p);
          cb.onProgress?.(p);
        },
      });
      await withTimeout(cachedTranscriber.init(), INIT_TIMEOUT_MS, "FileTranscriber.init()");
      console.log("[whisper] init done");
    } else {
      cachedTranscriber.onProgress = (p: number) => {
        console.log("[whisper] progress", p);
        cb.onProgress?.(p);
      };
    }

    console.log("[whisper] transcribing…");
    const result: any = await withTimeout(
      cachedTranscriber.transcribe(file, {
        lang: "ko",
        threads: 1,
        token_timestamps: true,
        suppress_non_speech: true,
      }),
      TRANSCRIBE_TIMEOUT_MS,
      "FileTranscriber.transcribe()",
    );
    console.log("[whisper] transcribe done", result);

    const segments: WhisperSegment[] = (result.transcription ?? [])
      .map((s: any) => ({
        startMs: Math.max(0, Math.round(s.offsets?.from ?? 0)),
        endMs: Math.max(0, Math.round(s.offsets?.to ?? 0)),
        text: (s.text ?? "").trim(),
      }))
      .filter((s: WhisperSegment) => s.text.length > 0);

    return segments;
  } catch (err) {
    // Drop the cached instance so the next attempt gets a fresh worker.
    await resetTranscriber();
    console.error("[whisper] failed", err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Offline verification (published site only — SW is disabled in preview):
//   1) Load app once online and wait for engine warm-up logs.
//   2) Convert one MP4 → MP3 to verify ffmpeg-core cache.
//   3) Open lyrics editor → SYLT → "음성인식으로 자동추출" once online to
//      verify the Whisper model (~57MB) under "audiofly-media-engines-v2".
//   4) DevTools → Application → Service Workers: /sw.js activated.
//   5) DevTools → Network → Offline, reload the app.
//   6) MP4→MP3 conversion should still work (ffmpeg-core cache hit).
//   7) SYLT auto-extract should still work (model + shout.wasm.js cache hit).
// ─────────────────────────────────────────────────────────────
