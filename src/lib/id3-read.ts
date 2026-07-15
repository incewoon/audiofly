// @ts-expect-error - jsmediatags has no bundled types
import jsmediatags from "jsmediatags/dist/jsmediatags.min.js";

export interface ReadCover {
  data: ArrayBuffer;
  mime: string;
  previewUrl: string;
}

export interface ReadTags {
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  trackNumber?: string;
  genre?: string;
  lyrics?: string;
  syncedLyrics?: { timeMs: number; text: string }[];
  cover?: ReadCover;
}

function pickString(v: unknown): string | undefined {
  if (typeof v === "string") return v || undefined;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.lyrics === "string") return o.lyrics;
    if (typeof o.text === "string") return o.text;
  }
  return undefined;
}

function pickSylt(raw: any): { timeMs: number; text: string }[] | undefined {
  const data = raw?.data ?? raw;
  const arr = data?.synchronisedText ?? data?.text ?? data?.lyrics;
  if (!Array.isArray(arr)) return undefined;
  const out: { timeMs: number; text: string }[] = [];
  for (const entry of arr) {
    if (Array.isArray(entry) && entry.length >= 2) {
      const text = String(entry[0] ?? "").trim();
      const timeMs = Number(entry[1] ?? 0);
      if (text) out.push({ timeMs, text });
    } else if (entry && typeof entry === "object") {
      const text = String(entry.text ?? "").trim();
      const timeMs = Number(entry.timestamp ?? entry.time ?? 0);
      if (text) out.push({ timeMs, text });
    }
  }
  return out.length > 0 ? out : undefined;
}

export function readId3Tags(file: File): Promise<ReadTags> {
  return new Promise((resolve) => {
    try {
      jsmediatags.read(file, {
        onSuccess: ({ tags }: any) => {
          const out: ReadTags = {
            title: pickString(tags.title),
            artist: pickString(tags.artist),
            albumArtist: pickString(tags["TPE2"]?.data) ?? pickString(tags.band),
            album: pickString(tags.album),
            trackNumber: pickString(tags.track),
            genre: pickString(tags.genre),
            lyrics: pickString(tags.lyrics) ?? pickString(tags["USLT"]?.data),
            syncedLyrics: pickSylt(tags["SYLT"]),
          };


          const picture = tags.picture;
          if (picture && picture.data) {
            const arr = new Uint8Array(picture.data.length);
            for (let i = 0; i < picture.data.length; i++) arr[i] = picture.data[i];
            const buf = arr.buffer;
            const mime = picture.format || "image/jpeg";
            const blob = new Blob([arr], { type: mime });
            out.cover = {
              data: buf,
              mime,
              previewUrl: URL.createObjectURL(blob),
            };
          }
          resolve(out);
        },
        onError: () => resolve({}),
      });
    } catch {
      resolve({});
    }
  });
}
