import { ID3Writer } from "browser-id3-writer";

export interface Id3Cover {
  data: ArrayBuffer;
  mime: string; // "image/jpeg" | "image/png"
}

export interface Id3Tags {
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  trackNumber?: string;
  genre?: string;
  lyrics?: string;
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
