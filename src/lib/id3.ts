import { ID3Writer } from "browser-id3-writer";

export interface Id3Tags {
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  trackNumber?: string;
}

export function writeId3Tags(mp3: Uint8Array, tags: Id3Tags): Blob {
  // ID3Writer requires an ArrayBuffer.
  const buffer = mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength) as ArrayBuffer;
  const writer = new ID3Writer(buffer);

  if (tags.title) writer.setFrame("TIT2", tags.title);
  if (tags.artist) writer.setFrame("TPE1", [tags.artist]);
  if (tags.albumArtist) writer.setFrame("TPE2", tags.albumArtist);
  if (tags.album) writer.setFrame("TALB", tags.album);
  if (tags.trackNumber) writer.setFrame("TRCK", tags.trackNumber);

  writer.addTag();
  return writer.getBlob();
}
