import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Upload, Music, FileText, Image as ImageIcon, ArrowLeftRight } from "lucide-react";
import { tagExistingMp3, type Id3Cover } from "@/lib/id3";
import { readId3Tags } from "@/lib/id3-read";

type Status = "idle" | "reading" | "saving";

export function TagEditorForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [albumArtist, setAlbumArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [trackNumber, setTrackNumber] = useState("");
  const [genre, setGenre] = useState("");

  const [lyrics, setLyrics] = useState("");
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyricsDraft, setLyricsDraft] = useState("");

  const [cover, setCover] = useState<Id3Cover | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);

  const busy = status !== "idle";

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  const resetAll = () => {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setTitle("");
    setArtist("");
    setAlbumArtist("");
    setAlbum("");
    setTrackNumber("");
    setGenre("");
    setLyrics("");
    setLyricsDraft("");
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCover(null);
    setCoverPreview(null);
    setStatus("idle");
  };

  const handleFile = async (f: File | null) => {
    if (!f) return;
    // clear previous cover preview
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCover(null);
    setCoverPreview(null);

    setFile(f);
    setStatus("reading");
    const tags = await readId3Tags(f);
    setTitle(tags.title ?? "");
    setArtist(tags.artist ?? "");
    setAlbumArtist(tags.albumArtist ?? "");
    setAlbum(tags.album ?? "");
    setTrackNumber(tags.trackNumber ?? "");
    setGenre(tags.genre ?? "");
    setLyrics(tags.lyrics ?? "");
    setLyricsDraft(tags.lyrics ?? "");
    if (tags.cover) {
      setCover({ data: tags.cover.data, mime: tags.cover.mime });
      setCoverPreview(tags.cover.previewUrl);
    }
    setStatus("idle");
    toast.success("기존 태그를 불러왔습니다.");
  };

  const handleCoverPick = async (f: File | null) => {
    if (!f) return;
    if (!["image/jpeg", "image/png"].includes(f.type)) {
      toast.error("JPEG 또는 PNG 이미지만 지원됩니다.");
      return;
    }
    if (f.size > 1024 * 1024) {
      toast.warning("이미지가 1MB를 초과합니다. 재생기 호환성이 낮아질 수 있어요.");
    }
    const buf = await f.arrayBuffer();
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCover({ data: buf, mime: f.type });
    setCoverPreview(URL.createObjectURL(f));
  };

  const clearCover = () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCover(null);
    setCoverPreview(null);
  };

  const handleSave = async () => {
    if (!file) {
      toast.error("MP3 파일을 먼저 선택해 주세요.");
      return;
    }
    try {
      setStatus("saving");
      const buffer = await file.arrayBuffer();
      const blob = tagExistingMp3(buffer, {
        title: title || undefined,
        artist: artist || undefined,
        albumArtist: albumArtist || undefined,
        album: album || undefined,
        trackNumber: trackNumber || undefined,
        genre: genre || undefined,
        lyrics: lyrics || undefined,
        cover: cover ?? undefined,
      });

      const originalName = file.name;
      // Try File System Access API for real overwrite
      const anyWin = window as any;
      let saved = false;
      if (typeof anyWin.showSaveFilePicker === "function") {
        try {
          const handle = await anyWin.showSaveFilePicker({
            suggestedName: originalName,
            types: [{ description: "MP3 Audio", accept: { "audio/mpeg": [".mp3"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          saved = true;
          toast.success("태그가 저장되었습니다.");
        } catch (err: any) {
          if (err?.name !== "AbortError") console.warn("showSaveFilePicker failed", err);
        }
      }
      if (!saved) {
        // Fallback: download with original filename
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = originalName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("태그가 저장되었습니다. 다운로드 폴더의 동일 이름 파일을 원본에 덮어써 주세요.");
      }
      resetAll();
    } catch (err) {
      console.error(err);
      setStatus("idle");
      toast.error("태그 저장에 실패했습니다.");
    }
  };

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Music className="h-5 w-5" /> MP3 태그 편집
          </CardTitle>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            MP4 → MP3 변환
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,audio/mp3,.mp3"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full min-h-11 justify-start"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <Upload className="mr-2 h-4 w-4" />
          {file ? file.name : "MP3 파일 선택"}
          {status === "reading" && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
        </Button>

        <div className="space-y-2.5">
          <div className="space-y-1">
            <Label htmlFor="t-title" className="text-xs">노래 제목</Label>
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-artist" className="text-xs">노래 참여자 (Artist)</Label>
            <Input id="t-artist" value={artist} onChange={(e) => setArtist(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-albumArtist" className="text-xs">앨범 참여자 (Album Artist)</Label>
            <Input id="t-albumArtist" value={albumArtist} onChange={(e) => setAlbumArtist(e.target.value)} className="h-9" />
          </div>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <div className="space-y-1 min-w-0">
              <Label htmlFor="t-album" className="text-xs">앨범명</Label>
              <Input id="t-album" value={album} onChange={(e) => setAlbum(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="t-track" className="text-xs">트랙 #</Label>
              <Input id="t-track" inputMode="numeric" value={trackNumber} onChange={(e) => setTrackNumber(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-genre" className="text-xs">장르 (Genre)</Label>
            <Input id="t-genre" value={genre} onChange={(e) => setGenre(e.target.value)} className="h-9" />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => { setLyricsDraft(lyrics); setLyricsOpen(true); }}
            >
              <FileText className="mr-1.5 h-4 w-4" />
              가사 편집{lyrics ? " ✓" : ""}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setCoverOpen(true)}
            >
              <ImageIcon className="mr-1.5 h-4 w-4" />
              앨범 아트{cover ? " ✓" : ""}
            </Button>
          </div>
        </div>

        <Button
          type="button"
          className="w-full min-h-12 text-base"
          onClick={handleSave}
          disabled={busy || !file}
        >
          {status === "saving" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {status === "saving" ? "저장 중…" : "태그 저장 (원본 수정)"}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          모든 편집은 브라우저 안에서 이루어집니다. 파일은 어떤 서버로도 전송되지 않습니다.
        </p>
      </CardContent>

      {/* 가사 팝업 */}
      <Dialog open={lyricsOpen} onOpenChange={setLyricsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>가사 편집 (USLT)</DialogTitle>
            <DialogDescription>일반 가사(USLT) 프레임에 저장됩니다. 언어 코드: kor</DialogDescription>
          </DialogHeader>
          <Textarea
            value={lyricsDraft}
            onChange={(e) => setLyricsDraft(e.target.value)}
            placeholder="가사를 붙여넣으세요"
            className="min-h-[40vh]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLyricsOpen(false)}>취소</Button>
            <Button onClick={() => { setLyrics(lyricsDraft); setLyricsOpen(false); }}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 앨범 아트 팝업 */}
      <Dialog open={coverOpen} onOpenChange={setCoverOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>앨범 아트 (APIC)</DialogTitle>
            <DialogDescription>
              권장 500×500 ~ 1000×1000 px 정사각 · 최대 1MB · JPEG 또는 PNG
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => handleCoverPick(e.target.files?.[0] ?? null)}
            />
            {coverPreview ? (
              <div className="flex items-center gap-3">
                <img src={coverPreview} alt="cover preview" className="h-24 w-24 rounded object-cover border" />
                <div className="flex flex-col gap-2">
                  <Button size="sm" variant="outline" onClick={() => coverInputRef.current?.click()}>이미지 변경</Button>
                  <Button size="sm" variant="ghost" onClick={clearCover}>제거</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full min-h-11" onClick={() => coverInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> 이미지 선택
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCoverOpen(false)}>완료</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
