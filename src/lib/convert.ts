import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// Local (public/ffmpeg/ffmpeg-core.js) + externalized Lovable big-asset wasm.
const CORE_JS_URL = "/ffmpeg/ffmpeg-core.js";
const CORE_WASM_URL = "/__l5e/assets-v1/1e85a9aa-a971-4415-8081-e3c4f925c47d/ffmpeg-core.wasm";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

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
  const withTimeout = <T,>(p: Promise<T>, ms: number, tag: string) =>
    Promise.race<T>([
      p,
      new Promise<T>((_, rej) =>
        setTimeout(() => rej(new Error(`${tag} timed out after ${ms}ms`)), ms),
      ),
    ]);

  loadPromise = withTimeout(
    ff.load({ coreURL: CORE_JS_URL, wasmURL: CORE_WASM_URL }),
    60_000,
    "ffmpeg.load()",
  )
    .then(() => {
      ffmpegInstance = ff;
      return ff;
    })
    .catch((err) => {
      loadPromise = null; // allow retry
      console.error("[ffmpeg] load failed", err);
      throw err;
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
    await ff.exec([
      "-i", inputName,
      "-vn",
      "-codec:a", "libmp3lame",
      "-q:a", "2",
      outputName,
    ]);
    const data = await ff.readFile(outputName);
    // clean up virtual FS
    try { await ff.deleteFile(inputName); } catch {}
    try { await ff.deleteFile(outputName); } catch {}
    return data as Uint8Array;
  } finally {
    ff.off("progress", progressHandler);
  }
}
