// Client-only Whisper.cpp WASM wrapper.
// Loaded via dynamic import so it never lands in the server bundle.

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

// Default: quantized base multilingual (~57MB). Good Korean support.
const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin";
// Cache Storage requires an http(s) or same-origin URL as the Request key —
// custom schemes like "whisper-model:" throw
// `Failed to execute 'put' on 'Cache': Request scheme 'whisper-model' is unsupported`.
// We use a stable same-origin URL that never needs to actually exist on the server.
const MODEL_CACHE_URL = "/whisper-models/ggml-base-q5_1.bin";

async function loadModelBlob(cb?: TranscribeCallbacks): Promise<File> {
  const cache = await caches.open("whisper-models-v1");
  const cacheKey = new Request(MODEL_CACHE_URL);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const buf = await cached.arrayBuffer();
    cb?.onModelProgress?.(buf.byteLength, buf.byteLength);
    return new File([buf], "model.bin", { type: "application/octet-stream" });
  }

  const res = await fetch(MODEL_URL);
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
  return new File([blob], "model.bin", { type: "application/octet-stream" });
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

  console.log("[whisper] importing transcriber+shout…");
  const [{ FileTranscriber }, shoutMod] = await Promise.all([
    import("@transcribe/transcriber"),
    import("@transcribe/shout"),
  ]);
  const createModule = (shoutMod as any).default;
  if (typeof createModule !== "function") {
    throw new Error("Whisper WASM 모듈 로드 실패: @transcribe/shout default export가 함수가 아님");
  }

  try {
    if (!cachedTranscriber) {
      console.log("[whisper] initializing FileTranscriber…");
      cachedTranscriber = new FileTranscriber({
        createModule,
        model: model as any,
        onProgress: (p: number) => {
          console.log("[whisper] progress", p);
          cb.onProgress?.(p);
        },
      });
      await withTimeout(cachedTranscriber.init(), 120_000, "FileTranscriber.init()");
      console.log("[whisper] init done");
    } else {
      cachedTranscriber.onProgress = (p: number) => {
        console.log("[whisper] progress", p);
        cb.onProgress?.(p);
      };
    }

    console.log("[whisper] transcribing…");
    const result = await withTimeout(
      cachedTranscriber.transcribe(file, {
        lang: "ko",
        token_timestamps: true,
        suppress_non_speech: true,
      }),
      10 * 60_000,
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
    cachedTranscriber = null;
    console.error("[whisper] failed", err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Offline verification (published site only — SW is disabled in preview):
//   1) Load app once online. Convert one MP4 → MP3 to precache ffmpeg-core.
//   2) Open lyrics editor → SYLT → "음성인식으로 자동추출" once online to
//      cache the Whisper model (~57MB) under the "whisper-models" cache.
//   3) DevTools → Application → Service Workers: /service-worker.js activated.
//   4) DevTools → Network → Offline, reload the app.
//   5) MP4→MP3 conversion should still work (ffmpeg-core cache hit).
//   6) SYLT auto-extract should still work (whisper-models cache hit).
// ─────────────────────────────────────────────────────────────
