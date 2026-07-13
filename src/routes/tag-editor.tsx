import { createFileRoute } from "@tanstack/react-router";
import { TagEditorForm } from "@/components/TagEditorForm";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/tag-editor")({
  head: () => ({
    meta: [
      { title: "MP3 태그 편집 — AudioFly" },
      { name: "description", content: "브라우저에서 MP3 파일의 ID3 태그(제목, 아티스트, 앨범, 장르, 가사, 앨범 아트)를 편집합니다." },
      { property: "og:title", content: "MP3 태그 편집 — AudioFly" },
      { property: "og:description", content: "브라우저에서 MP3 ID3 태그를 편집합니다." },
    ],
  }),
  component: TagEditorPage,
});

function TagEditorPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted flex items-start sm:items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <h1 className="sr-only">MP3 태그 편집</h1>
        <TagEditorForm />
      </div>
      <Toaster position="top-center" richColors />
    </main>
  );
}
