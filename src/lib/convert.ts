// src/lib/convert.ts

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { CORE_JS_URL, CORE_WASM_URL } from "./engine-assets";

const LOAD_TIMEOUT_MS = 60_000;
const CONVERT_TIMEOUT_MS = 5 * 60_000;

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const withTimeout = <T,>(p: Promise<T>, ms: number, tag: string) =>
  Promise.race<T>([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${tag} timed out after ${ms}ms`)), ms),
    ),
  ]);

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  const ff = new FFmpeg();
  const log = (msg: string) => {
    onLog?.(msg);
    // Surface engine progress in DevTools for offline/hang diagnosis.
    console.log("[ffmpeg]", msg);
  };
  ff.on("log", ({ message }) => log(message));

  // Fail fast instead of hanging on "변환엔진 로드중" forever if the CDN/proxy
  // is unreachable (e.g. offline before the core wasm was ever cached).
  const assertReachable = async (url: string) => {
    const res = await fetch(url, { cache: "force-cache", credentials: "same-origin" });
    if (!res.ok) throw new Error(`${url} 로드 실패 (${res.status})`);
    // Consume a tiny slice so browser/SW cache has a concrete response to store.
    await res.clone().blob();
  };

  const toCachedBlobURL = async (url: string, type: string) => {
    const res = await fetch(url, { cache: "force-cache", credentials: "same-origin" });
    if (!res.ok) throw new Error(`${url} 로드 실패 (${res.status})`);
    const blob = await res.blob();
    return URL.createObjectURL(new Blob([blob], { type }));
  };

  loadPromise = Promise.resolve()
    .then(async () => {
      log("checking ffmpeg core files");
      await Promise.all([assertReachable(CORE_JS_URL), assertReachable(CORE_WASM_URL)]);
      log("loading ffmpeg core");
      // Vite dev/prod can reject direct dynamic imports from /public. ffmpeg.wasm
      // accepts Blob URLs, so we fetch the cached engine files first and import
      // those object URLs instead. This also keeps the path SW-cache friendly.
      const [coreURL, wasmURL] = await Promise.all([
        toCachedBlobURL(CORE_JS_URL, "text/javascript"),
        toCachedBlobURL(CORE_WASM_URL, "application/wasm"),
      ]);
      await withTimeout(
        ff.load({ coreURL, wasmURL }),
        LOAD_TIMEOUT_MS,
        "ffmpeg.load()",
      );
    })
    .then(() => {
      log("ffmpeg core loaded");
      ffmpegInstance = ff;
      return ff;
    })
    .catch((err) => {
      loadPromise = null; // allow retry
      try { ff.terminate(); } catch {}
      console.error("[ffmpeg] load failed", err);
      throw new Error(
        `변환 엔진 파일을 불러오지 못했습니다. 온라인에서 앱을 한 번 완전히 실행해 캐시한 뒤 다시 시도해 주세요. (${err instanceof Error ? err.message : String(err)})`,
      );
    });

  return loadPromise;
}

export interface ConvertOptions {
  file: File;
  onProgress?: (ratio: number) => void;
  onLog?: (msg: string) => void;
}

export async function convertMp4ToMp3({
  file,
  onProgress,
  onLog,
}: ConvertOptions): Promise<Uint8Array> {
  const ff = await getFFmpeg(onLog);

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(1, progress)));
  };
  ff.on("progress", progressHandler);

  const inputName = "input.mp4";
  const outputName = "output.mp3";

  try {
    await ff.writeFile(inputName, await fetchFile(file));
    const exitCode = await withTimeout(ff.exec([
      "-i", inputName,
      "-vn",
      "-codec:a", "libmp3lame",
      "-q:a", "2",
      outputName,
    ], CONVERT_TIMEOUT_MS), CONVERT_TIMEOUT_MS + 5_000, "ffmpeg.exec()");
    if (typeof exitCode === "number" && exitCode !== 0) {
      throw new Error(`ffmpeg 변환 실패 (exit ${exitCode})`);
    }
    const data = await ff.readFile(outputName);
    // clean up virtual FS
    try { await ff.deleteFile(inputName); } catch {}
    try { await ff.deleteFile(outputName); } catch {}
    return data as Uint8Array;
  } finally {
    ff.off("progress", progressHandler);
  }
}
