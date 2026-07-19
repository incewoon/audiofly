import { fetchFile } from "@ffmpeg/util";
import createFFmpegCore from "@ffmpeg/core";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";

// ⚠️ 확인 필요: createFFmpegCore()가 받는 옵션 키 이름과 반환되는 Module의
// 메서드 이름(FS.writeFile / FS.readFile / exec / setLogger / setProgress)이
// 실제 설치된 버전과 정확히 일치하는지, 다음 파일을 열어서 대조해 주세요:
//   node_modules/@ffmpeg/core/dist/esm/types.d.ts
// (버전마다 옵션 키가 약간 다를 수 있습니다. 아래는 @ffmpeg/core 0.12.x 기준
// 가장 흔한 시그니처입니다.)

const LOAD_TIMEOUT_MS = 90_000;
const CONVERT_TIMEOUT_MS = 5 * 60_000;

let corePromise: ReturnType<typeof createFFmpegCore> | null = null;

const withTimeout = <T,>(p: Promise<T>, ms: number, tag: string) =>
  Promise.race<T>([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${tag} timed out after ${ms}ms`)), ms),
    ),
  ]);

async function getCore(onLog?: (msg: string) => void) {
  if (corePromise) return corePromise;

  corePromise = withTimeout(
    createFFmpegCore({
      mainScriptUrlOrBlob: coreURL,
      wasmBinaryUrl: wasmURL, // 실제 키 이름은 types.d.ts에서 재확인
    }),
    LOAD_TIMEOUT_MS,
    "ffmpeg core load()",
  ).then((core: any) => {
    core.setLogger?.(({ message }: { message: string }) => {
      onLog?.(message);
      console.log("[ffmpeg]", message);
    });
    return core;
  }).catch((err) => {
    corePromise = null;
    console.error("[ffmpeg] core load failed", err);
    throw new Error(
      `변환 엔진 파일을 불러오지 못했습니다. (${err instanceof Error ? err.message : String(err)})`,
    );
  });

  return corePromise;
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
  const core: any = await getCore(onLog);

  core.setProgress?.(({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(1, progress)));
  });

  const inputName = "input.mp4";
  const outputName = "output.mp3";

  core.FS.writeFile(inputName, await fetchFile(file));

  const exitCode = await withTimeout(
    core.exec(
      ["-i", inputName, "-vn", "-codec:a", "libmp3lame", "-q:a", "2", outputName],
      CONVERT_TIMEOUT_MS,
    ),
    CONVERT_TIMEOUT_MS + 5_000,
    "ffmpeg.exec()",
  );

  if (typeof exitCode === "number" && exitCode !== 0) {
    throw new Error(`ffmpeg 변환 실패 (exit ${exitCode})`);
  }

  const data = core.FS.readFile(outputName);
  try { core.FS.unlink(inputName); } catch {}
  try { core.FS.unlink(outputName); } catch {}

  return data as Uint8Array;
}
