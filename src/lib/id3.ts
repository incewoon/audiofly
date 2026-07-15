import { ID3Writer } from "browser-id3-writer";

export interface Id3Cover {
  data: ArrayBuffer;
  mime: string; // "image/jpeg" | "image/png"
}

export interface SyltLine {
  /** Time in milliseconds from start of file */
  timeMs: number;
  text: string;
}

export interface Id3Tags {
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  trackNumber?: string;
  genre?: string;
  lyrics?: string;
  syncedLyrics?: SyltLine[];
  cover?: Id3Cover | null;
}

function applyTags(writer: ID3Writer, tags: Id3Tags) {
  if (tags.title) writer.setFrame("TIT2", tags.title);
  if (tags.artist) writer.setFrame("TPE1", [tags.artist]);
  if (tags.albumArtist) writer.setFrame("TPE2", tags.albumArtist);
  if (tags.album) writer.setFrame("TALB", tags.album);
  if (tags.trackNumber) writer.setFrame("TRCK", tags.trackNumber);
  if (tags.genre) writer.setFrame("TCON", [tags.genre]);
  if (tags.lyrics) {
    writer.setFrame("USLT", {
      language: "kor",
      description: "",
      lyrics: tags.lyrics,
    });
  }
  if (tags.syncedLyrics && tags.syncedLyrics.length > 0) {
    try {
      writer.setFrame("SYLT", {
        type: 1, // Lyrics
        timestampFormat: 2, // Milliseconds
        language: "kor",
        description: "",
        text: tags.syncedLyrics.map((l) => [l.text, Math.max(0, Math.round(l.timeMs))] as [string, number]),
      } as any);
    } catch (e) {
      console.warn("SYLT frame write failed:", e);
    }
  }
  if (tags.cover) {
    writer.setFrame("APIC", {
      type: 3,
      data: tags.cover.data,
      description: "",
    });
  }
}

export function writeId3Tags(mp3: Uint8Array, tags: Id3Tags): Blob {
  const buffer = mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength) as ArrayBuffer;
  const writer = new ID3Writer(buffer);
  applyTags(writer, tags);
  writer.addTag();
  return writer.getBlob();
}

export function tagExistingMp3(buffer: ArrayBuffer, tags: Id3Tags): Blob {
  const writer = new ID3Writer(buffer);
  applyTags(writer, tags);
  writer.addTag();
  return writer.getBlob();
}

/** Format ms → [mm:ss.xx] */
export function formatSyltTime(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const cs = Math.floor((clamped % 1000) / 10);
  return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}]`;
}

/** Serialize SYLT lines → editable "[mm:ss.xx] text" multiline string. */
export function serializeSylt(lines: SyltLine[]): string {
  return lines.map((l) => `${formatSyltTime(l.timeMs)} ${l.text}`).join("\n");
}

const SYLT_RE = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/;

/** Parse an edited "[mm:ss.xx] text" multiline string back into SYLT lines. */
export function parseSylt(text: string): SyltLine[] {
  const out: SyltLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = SYLT_RE.exec(line);
    if (!m) {
      if (out.length > 0) out[out.length - 1].text += " " + line;
      continue;
    }
    const [, mm, ss, hs, body] = m;
    const centis = hs ? Number(hs.padEnd(2, "0").slice(0, 2)) : 0;
    const timeMs = Number(mm) * 60000 + Number(ss) * 1000 + centis * 10;
    out.push({ timeMs, text: (body ?? "").trim() });
  }
  return out;
}
