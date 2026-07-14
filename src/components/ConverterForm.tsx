import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { convertMp4ToMp3 } from "@/lib/convert";
import { writeId3Tags } from "@/lib/id3";
import { pickFileNative } from "@/lib/pick-file";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Upload, Music, Tag } from "lucide-react";
import { cn } from "@/lib/utils";


function stripExt(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

type Status = "idle" | "loading" | "converting" | "tagging" | "done";
type Preset = "1" | "2";

const PRESET_KEY = "audiofly:filename-preset";

function buildFilename(preset: Preset, opts: { title: string; artist: string; trackNumber: string; fallback: string }) {
  const { title, artist, trackNumber, fallback } = opts;
  const parts = preset === "1"
    ? [artist, trackNumber, title]
    : [title, artist];
  const joined = parts.map((s) => s.trim()).filter(Boolean).join("-");
  return joined || fallback;
}

export function ConverterForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);

  const [filename, setFilename] = useState("");
  const [filenameEdited, setFilenameEdited] = useState(false);
  const [preset, setPreset] = useState<Preset>("1");

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [albumArtist, setAlbumArtist] = useState("");
  const [trackNumber, setTrackNumber] = useState("");
  const [album, setAlbum] = useState("");

  // Load saved preset on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PRESET_KEY);
      if (saved === "1" || saved === "2") setPreset(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Auto-fill filename when preset or source fields change (unless user has manually edited)
  useEffect(() => {
    if (!file) return;
    if (filenameEdited) return;
    const fallback = stripExt(file.name);
    setFilename(buildFilename(preset, { title, artist, trackNumber, fallback }));
  }, [preset, title, artist, trackNumber, file, filenameEdited]);

  const busy = status === "loading" || status === "converting" || status === "tagging";

  const statusLabel = useMemo(() => {
    switch (status) {
      case "loading": return "변환 엔진 로드 중…";
      case "converting": return `변환 중… ${Math.round(progress * 100)}%`;
      case "tagging": return "태그 주입 중…";
      case "done": return "완료!";
      default: return "";
    }
  }, [status, progress]);

  const handleFile = (f: File | null) => {
    if (!f) return;
    setFile(f);
    const base = stripExt(f.name);
    setTitle(base);
    setFilename(base);
    setFilenameEdited(false);
    setStatus("idle");
    setProgress(0);
  };

  const handlePresetChange = (p: Preset) => {
    setPreset(p);
    setFilenameEdited(false);
    try {
      localStorage.setItem(PRESET_KEY, p);
    } catch {
      /* ignore */
    }
  };

  const handleConvert = async () => {
    if (!file) {
      toast.error("MP4 파일을 먼저 선택해 주세요.");
      return;
    }
    try {
      setStatus("loading");
      setProgress(0);
      const mp3 = await convertMp4ToMp3({
        file,
        onProgress: (r) => {
          setStatus("converting");
          setProgress(r);
        },
      });
      setStatus("tagging");
      const blob = writeId3Tags(mp3, {
        title: title || undefined,
        artist: artist || undefined,
        albumArtist: albumArtist || undefined,
        album: album || undefined,
        trackNumber: trackNumber || undefined,
      });
      const outName = `${(filename || stripExt(file.name)).trim() || "output"}.mp3`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus("done");
      setProgress(1);
      toast.success("다운로드가 완료되었습니다", {
        action: {
          label: "바로가기",
          onClick: () => {
            // Web has no API to open the OS Downloads folder; open the file itself in a new tab.
            window.open(url, "_blank", "noopener");
          },
        },
        // Revoke after the toast disappears so the "바로가기" action still works.
        onAutoClose: () => URL.revokeObjectURL(url),
        onDismiss: () => URL.revokeObjectURL(url),
        duration: 10000,
      });
      // Full reset after successful download
      resetAll();
    } catch (err) {
      console.error(err);
      setStatus("idle");
      toast.error("변환에 실패했습니다. 콘솔을 확인해 주세요.");
    }
  };

  const resetAll = () => {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setTitle("");
    setArtist("");
    setAlbumArtist("");
    setAlbum("");
    setTrackNumber("");
    setFilename("");
    setFilenameEdited(false);
    setPreset("1");
    try { localStorage.removeItem(PRESET_KEY); } catch { /* ignore */ }
    setProgress(0);
    setStatus("idle");
  };

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Music className="h-5 w-5" /> MP4 → MP3 변환
          </CardTitle>
          <Link
            to="/tag-editor"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
          >
            <Tag className="h-3.5 w-3.5" />
            MP3 태그 편집
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>동영상 파일</Label>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full min-h-12 justify-start"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <Upload className="mr-2 h-4 w-4" />
            {file ? file.name : "MP4 파일 선택"}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">노래 제목</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="artist">노래 참여자 (Artist)</Label>
            <Input id="artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="albumArtist">앨범 참여자 (Album Artist)</Label>
            <Input id="albumArtist" value={albumArtist} onChange={(e) => setAlbumArtist(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="album">앨범명</Label>
              <Input id="album" value={album} onChange={(e) => setAlbum(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="track">트랙 #</Label>
              <Input id="track" inputMode="numeric" value={trackNumber} onChange={(e) => setTrackNumber(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filename">파일명</Label>
            <Input
              id="filename"
              value={filename}
              onChange={(e) => {
                setFilename(e.target.value);
                setFilenameEdited(true);
              }}
              placeholder="output"
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => handlePresetChange("1")}
                className={cn(
                  "flex-1 min-h-11 rounded-md border text-sm font-medium transition-colors px-3 text-left",
                  preset === "1"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
                )}
                aria-pressed={preset === "1"}
              >
                <span className="font-bold mr-2">1</span>
                <span className="text-xs opacity-90">아티스트-트랙-제목</span>
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange("2")}
                className={cn(
                  "flex-1 min-h-11 rounded-md border text-sm font-medium transition-colors px-3 text-left",
                  preset === "2"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
                )}
                aria-pressed={preset === "2"}
              >
                <span className="font-bold mr-2">2</span>
                <span className="text-xs opacity-90">제목-아티스트</span>
              </button>
            </div>
          </div>
        </div>

        <Button
          type="button"
          className="w-full min-h-12 text-base"
          onClick={handleConvert}
          disabled={busy || !file}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy ? statusLabel : "변환 & 다운로드"}
        </Button>

        {(status === "converting" || status === "tagging" || status === "done") && (
          <div className="space-y-2">
            <Progress value={Math.round(progress * 100)} />
            <p className="text-xs text-muted-foreground text-center">{statusLabel}</p>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          변환은 전부 브라우저 안에서 이루어집니다. 파일은 어떤 서버로도 전송되지 않습니다.
        </p>
      </CardContent>
    </Card>
  );
}
