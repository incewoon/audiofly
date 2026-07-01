import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ConverterForm } from "@/components/ConverterForm";
import { Toaster } from "@/components/ui/sonner";
import { registerAppSW } from "@/lib/sw-register";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MP4 → MP3 Converter" },
      { name: "description", content: "브라우저에서 바로 MP4를 MP3로 변환하고 ID3 태그를 주입하는 오프라인 지원 웹앱." },
      { property: "og:title", content: "MP4 → MP3 Converter" },
      { property: "og:description", content: "브라우저에서 바로 MP4를 MP3로 변환하고 ID3 태그를 주입하는 오프라인 지원 웹앱." },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    registerAppSW();
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted flex items-start sm:items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <h1 className="sr-only">MP4 to MP3 Converter</h1>
        <ConverterForm />
      </div>
      <Toaster position="top-center" richColors />
    </main>
  );
}
