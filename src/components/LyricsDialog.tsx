import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Mic } from "lucide-react";
import {
  serializeSylt,
  parseSylt,
  formatSyltTime,
  type SyltLine,
} from "@/lib/id3";

type Mode = "uslt" | "sylt";

export interface LyricsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mp3File: File | null;
  initialLyrics: string;
  initialSynced: SyltLine[];
  initialMode?: Mode;
  onSave: (payload: { lyrics: string; syncedLyrics: SyltLine[]; mode: Mode }) => void;
}

export function LyricsDialog({
  open,
  onOpenChange,
  mp3File,
  initialLyrics,
  initialSynced,
  initialMode,
  onSave,
}: LyricsDialogProps) {
  const [mode, setMode] = useState<Mode>(initialMode ?? (initialSynced.length > 0 ? "sylt" : "uslt"));
  const [usltDraft, setUsltDraft] = useState(initialLyrics);
  const [syltDraft, setSyltDraft] = useState(serializeSylt(initialSynced));
  const [busy, setBusy] = useState<null | "model" | "transcribe">(null);
  const [modelPct, setModelPct] = useState(0);
  const [asrPct, setAsrPct] = useState(0);

  useEffect(() => {
    if (open) {
      setUsltDraft(initialLyrics);
      setSyltDraft(serializeSylt(initialSynced));
      setMode(initialMode ?? (initialSynced.length > 0 ? "sylt" : "uslt"));
      setBusy(null);
      setModelPct(0);
      setAsrPct(0);
    }
  }, [open, initialLyrics, initialSynced, initialMode]);

  const runTranscription = async () => {
    if (!mp3File) {
      toast.error("MP3 파일을 먼저 선택해 주세요.");
      return;
    }
    setBusy("model");
    setModelPct(0);
    setAsrPct(0);
    try {
      const [{ transcribeMp3 }, { detectSilenceGaps, splitOnSilence, normalizeSegments }] = await Promise.all([
        import("@/lib/whisper/transcribe"),
        import("@/lib/whisper/segment"),
      ]);

      const gapsPromise = detectSilenceGaps(mp3File).catch(() => []);

      const raw = await transcribeMp3(mp3File, {
        onModelProgress: (loaded, total) => {
          setBusy("model");
          setModelPct(total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0);
        },
        onProgress: (p) => {
          setBusy("transcribe");
          setAsrPct(Math.min(100, Math.round(p)));
        },
      });

      const gaps = await gapsPromise;
      const merged = normalizeSegments(splitOnSilence(raw, gaps));
      const syltLines: SyltLine[] = merged.map((s) => ({ timeMs: s.startMs, text: s.text }));
      setSyltDraft(serializeSylt(syltLines));
      setMode("sylt");
      toast.success(`${syltLines.length}개 라인이 추출되었습니다.`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "음성인식에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const handleSave = () => {
    const parsed = mode === "sylt" ? parseSylt(syltDraft) : [];
    const usltFromSylt = parsed.map((l) => l.text).join("\n");
    onSave({
      lyrics: mode === "sylt" ? usltFromSylt : usltDraft,
      syncedLyrics: parsed,
      mode,
    });
    onOpenChange(false);
  };

  const insertTimestampAtCursor = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    const now = formatSyltTime(0);
    const s = el.selectionStart;
    const before = syltDraft.slice(0, s);
    const after = syltDraft.slice(s);
    setSyltDraft(before + now + " " + after);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>가사 편집</DialogTitle>
          <DialogDescription>
            {mode === "uslt"
              ? "일반 가사(USLT) 프레임에 저장됩니다."
              : "타임스탬프 가사(SYLT + USLT)를 저장합니다. 라인 형식: [mm:ss.xx] 가사"}
          </DialogDescription>
        </DialogHeader>

        {mode === "uslt" ? (
          <Textarea
            value={usltDraft}
            onChange={(e) => setUsltDraft(e.target.value)}
            placeholder="가사를 붙여넣으세요"
            className="min-h-[38vh]"
          />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={runTranscription}
                disabled={!mp3File || busy !== null}
              >
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mic className="mr-1.5 h-4 w-4" />}
                음성인식으로 자동 추출
              </Button>
              {busy === "model" && (
                <div className="flex-1 flex items-center gap-2">
                  <Progress value={modelPct} className="h-2" />
                  <span className="text-[11px] text-muted-foreground w-14 text-right">모델 {modelPct}%</span>
                </div>
              )}
              {busy === "transcribe" && (
                <div className="flex-1 flex items-center gap-2">
                  <Progress value={asrPct} className="h-2" />
                  <span className="text-[11px] text-muted-foreground w-14 text-right">인식 {asrPct}%</span>
                </div>
              )}
            </div>
            <Textarea
              value={syltDraft}
              onChange={(e) => setSyltDraft(e.target.value)}
              onDoubleClick={(e) => insertTimestampAtCursor(e.currentTarget)}
              placeholder="[00:00.00] 첫 번째 문장&#10;[00:03.42] 두 번째 문장"
              className="min-h-[34vh] font-mono text-[13px]"
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              최초 실행 시 Whisper 모델(약 57MB)이 브라우저에 캐시됩니다. 이후에는 오프라인으로 작동합니다. 인식은
              시간이 걸릴 수 있으며 결과는 편집 가능합니다.
            </p>
          </div>
        )}

        <DialogFooter className="!justify-between">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="uslt">USLT</TabsTrigger>
              <TabsTrigger value="sylt">SYLT</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={busy !== null}>
              저장
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
