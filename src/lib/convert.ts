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
  if (onLog) ff.on("log", ({ message }) => onLog(message));

  loadPromise = ff
    .load({
      coreURL: CORE_JS_URL,
      wasmURL: CORE_WASM_URL,
    })
    .then(() => {
      ffmpegInstance = ff;
      return ff;
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
