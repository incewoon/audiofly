
## Scope
UI/presentation-only changes across the two pages and their dialogs. No changes to conversion, ID3, whisper, service worker, or engine logic — only strings, layout, and preset button UI.

## 1. Shared "AudioFly" header + copyright footer

Create a small presentational component `src/components/AppShell.tsx` used by both routes so styling stays consistent:
- Top: `AudioFly` wordmark — large, tight tracking, gradient text (uses existing theme tokens, e.g. `bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent`), with a thin tagline underneath (e.g. "Offline audio toolkit").
- Middle: `{children}` for the page content (Card).
- Bottom: muted footer line `© 2026 Sungyeon In. All rights reserved.`

Update `src/routes/index.tsx` and `src/routes/tag-editor.tsx` to wrap their form in `<AppShell>` instead of the current bare `<main>` wrapper. Tighten vertical rhythm so the added header/footer don't push content down:
- Reduce outer padding: `p-4 sm:p-6` → `px-4 py-3 sm:py-4`.
- Reduce `CardHeader` padding and `CardContent` `space-y-*` by one step (e.g. `space-y-5` → `space-y-4`, form grid `gap-4` → `gap-3`) in `ConverterForm.tsx` and `TagEditorForm.tsx`.
- Remove the redundant `sr-only` H1 in each route (the AudioFly wordmark becomes the H1; card titles become H2 semantics via existing `CardTitle`).

## 2. Translate all UI copy to English

Replace every Korean string in user-facing UI. No logic changes. Files touched (strings only):

- `src/routes/index.tsx` — head meta (title/description/og).
- `src/routes/tag-editor.tsx` — head meta.
- `src/routes/__root.tsx` — meta description / og / twitter description.
- `src/components/ConverterForm.tsx` — labels, placeholders, button text, status messages, toast text, footer note.
  - e.g. `MP4 → MP3 변환` → `MP4 → MP3 Converter`; `MP3 태그 편집` → `Edit MP3 Tags`; `동영상 파일` → `Video file`; `MP4 파일 선택` → `Choose MP4 file`; `노래 제목` → `Title`; `노래 참여자 (Artist)` → `Artist`; `앨범 참여자 (Album Artist)` → `Album Artist`; `앨범명` → `Album`; `트랙 #` → `Track #`; `파일명` → `Filename`; `변환 & 다운로드` → `Convert & Download`; status → `Loading engine…`, `Converting… N%`, `Writing tags…`, `Done!`; success toast → `Download complete` / action `Open`; error toast → `Conversion failed. Check the console.`; footer note → `Everything runs in your browser. Files are never uploaded.`
- `src/components/TagEditorForm.tsx` — same treatment (`Edit MP3 Tags`, `Choose MP3 file`, `Genre`, `Edit lyrics`, `Album art`, `Save tags (overwrite source)`, save toasts, footer note, cover dialog title, `Choose image`, etc.).
- `src/components/LyricsDialog.tsx` — dialog title/description, mode toggle, module status ("Module: installed" / "Module: not installed ({size})"), language toggle labels (`Korean` / `English`), buttons (`Download module`, `Delete module`, `Auto-extract from audio`, `Save`, `Cancel`), toast messages, placeholder (`Paste lyrics here` / SYLT hint `[mm:ss.xx] lyric`), extraction success/failure copy.
- `src/lib/convert.ts` and `src/lib/whisper/transcribe.ts` — thrown `Error` messages surfaced via toast (e.g. `Failed to load conversion engine (…)`, `ffmpeg conversion failed (exit N)`, `This browser does not support offline model cache.`, `You are offline. Download the module while online first.`, `Model download failed (status)`, etc.). Comments left as-is (internal only).
- `public/offline.html` — translate the offline shell copy to English (title, badge, headline, paragraphs, button).

No new i18n framework — strings are simply rewritten in place.

## 3. Filename preset buttons redesign (ConverterForm only)

In `ConverterForm.tsx`:

- Change `Preset` type: `"1" | "2"` → `"1" | "2" | "3"`.
- Add preset 3 = title only. Update `buildFilename`:
  - `"1"` → `[artist, trackNumber, title]`
  - `"2"` → `[title, artist]`
  - `"3"` → `[title]`
- Replace the two large text buttons with three compact square number buttons showing only `1`, `2`, `3` (equal-width, ~44×44, same active/inactive styling as today).
- To the right of the buttons, show a live label: `Preset: Artist-Track-Title` (for 1), `Preset: Title-Artist` (2), or `Preset: Title` (3), truncating on overflow.
- Keep existing behavior: default `"1"`, remember last selection in `localStorage` under `PRESET_KEY`, `handlePresetChange` clears `filenameEdited` and re-derives filename.

Layout sketch:
```text
[ 1 ] [ 2 ] [ 3 ]   Preset: Artist-Track-Title
```

## Out of scope
- No changes to service worker, whisper model URLs/sizes, ffmpeg wiring, ID3 read/write logic, routing, or PWA manifest beyond what's needed for the header/footer wrapper.
- Manifest `name`/`short_name` stay as-is unless already `AudioFly`.

## Verification
- Visual check on both `/` and `/tag-editor`: AudioFly header at top, footer at bottom, no vertical overflow on mobile viewport, card content compacted.
- Confirm no remaining Korean characters in `src/` (`.ts`/`.tsx`) user-facing strings and in `public/offline.html`.
- Convert an MP4 end-to-end (unchanged behavior) and open the lyrics dialog to confirm English copy renders.
- Click each preset (1/2/3) and confirm the filename updates and the right-side "Preset: …" label matches.
