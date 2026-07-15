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
const MODEL_CACHE_KEY = "whisper-model:ggml-base-q5_1.bin";

async function loadModelBlob(cb?: TranscribeCallbacks): Promise<File> {
  // IndexedDB Cache Storage
  const cache = await caches.open("whisper-models-v1");
  const cached = await cache.match(MODEL_CACHE_KEY);
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
    MODEL_CACHE_KEY,
    new Response(blob, {
      headers: { "content-type": "application/octet-stream", "content-length": String(blob.size) },
    }),
  );
  return new File([blob], "model.bin", { type: "application/octet-stream" });
}

let cachedTranscriber: any = null;

export async function transcribeMp3(
  file: File,
  cb: TranscribeCallbacks = {},
): Promise<WhisperSegment[]> {
  if (!(globalThis as any).crossOriginIsolated) {
    throw new Error(
      "음성인식을 위해 페이지가 cross-origin isolated 상태여야 합니다. 페이지를 새로고침 후 다시 시도해 주세요.",
    );
  }

  const model = await loadModelBlob(cb);

  const [{ FileTranscriber }, shoutMod] = await Promise.all([
    import("@transcribe/transcriber"),
    import("@transcribe/shout"),
  ]);
  const createModule = (shoutMod as any).default;

  if (!cachedTranscriber) {
    cachedTranscriber = new FileTranscriber({
      createModule,
      model: model as any,
      onProgress: (p: number) => cb.onProgress?.(p),
    });
    await cachedTranscriber.init();
  } else {
    cachedTranscriber.onProgress = (p: number) => cb.onProgress?.(p);
  }

  const result = await cachedTranscriber.transcribe(file, {
    lang: "ko",
    token_timestamps: true,
    suppress_non_speech: true,
  });

  const segments: WhisperSegment[] = (result.transcription ?? []).map((s: any) => ({
    startMs: Math.max(0, Math.round(s.offsets?.from ?? 0)),
    endMs: Math.max(0, Math.round(s.offsets?.to ?? 0)),
    text: (s.text ?? "").trim(),
  })).filter((s: WhisperSegment) => s.text.length > 0);

  return segments;
}
