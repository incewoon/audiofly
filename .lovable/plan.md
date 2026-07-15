
## 목표
가사 편집 팝업에 SYLT(동기 가사) 모드를 추가하고, 업로드한 MP3에서 Whisper WASM(오프라인)으로 무음 구간 단위 타임스탬프 가사를 추출한다. 저장 시 SYLT + USLT 모두 기록.

## 사용자 결정사항
- STT: **Whisper.cpp WASM 내장** (최초 1회 모델 다운로드 후 IndexedDB 캐시, 이후 완전 오프라인)
- 분할 단위: **무음 구간(약 0.6초, 임계값 조정) 기반**
- 저장: **SYLT + USLT 동시 저장**

## UX 흐름 (가사 편집 팝업)

```
┌───────────────────────────────────────────┐
│ 가사 편집                                  │
│ ○ USLT (일반)  ● SYLT (타임스탬프)         │
├───────────────────────────────────────────┤
│ [SYLT] [🎙 음성인식으로 자동 추출]         │
│         (모델 로드 진행률 / 인식 진행률)    │
│                                            │
│ ┌─────────────────────────────────────┐    │
│ │ [00:00.00] 첫 번째 문장              │    │
│ │ [00:03.42] 두 번째 문장              │    │
│ │ [00:07.10] ...                      │    │
│ └─────────────────────────────────────┘    │
│                                            │
│ [모드에 따라 편집기 형태 전환]              │
├───────────────────────────────────────────┤
│                       [취소]  [저장]        │
└───────────────────────────────────────────┘
```

- 좌하단 토글: USLT ↔ SYLT (Tabs). 초기값은 기존 가사 존재 여부에 따라 결정.
- SYLT 모드에서만 "음성인식으로 자동 추출" 버튼 노출. MP3 파일이 없으면 비활성화.
- 결과는 `[mm:ss.xx] 문장` 형태 라인으로 텍스트 박스에 채워지고 그대로 수동 편집 가능.
- 저장 클릭 시 라인을 파싱 → SYLT 프레임(타임스탬프 밀리초 + 텍스트 배열) + 같은 텍스트에서 타임스탬프만 제거한 문자열을 USLT로 함께 기록.

## 기술 설계

### 1. Whisper WASM 통합 (`src/lib/whisper/`)

- 패키지: `@transcribe/transcriber`(whisper.cpp WASM 래퍼, 0-dep, 브라우저 전용, 모델 로드/캐시 훅 노출) 사용.
  - 대안 검토됨: `@timur00kh/whisper.wasm`, `whisper-web-transcriber`. 선택 이유: 활발히 유지되고 API가 간단하며 커스텀 모델 URL/캐시 hook 지원.
- 모델: `ggml-base.q5_1.bin` 또는 `ggml-small.q5_1.bin` (한국어 정확도 확보). 기본 base(~57MB), 옵션 확장 여지만 남김.
- 모델 호스팅:
  - 첫 실행 시 Hugging Face `ggerganov/whisper.cpp` 리소스에서 fetch → IndexedDB(Cache Storage)에 저장.
  - 이후 실행은 캐시에서 즉시 로드(오프라인).
  - 다운로드 진행률 이벤트를 팝업 UI 진행 바에 반영.
- API 래퍼(`src/lib/whisper/transcribe.client.ts`, 클라이언트 전용):
  - `loadModel({ onProgress })` — 모델을 캐시 확인/다운로드 후 준비.
  - `transcribe(file, { language: 'ko', onProgress })` — 세그먼트 배열 반환: `{ startMs, endMs, text }[]`.
- 파일은 반드시 `use client`가 아닌 동적 `import()`로 로드(SSR에서 `window`/`Worker` 접근 방지). 서버 번들 유입 방지 위해 `.client.ts` 확장자 사용.

### 2. 무음 기반 재분할 (`src/lib/whisper/segment.ts`)

Whisper가 반환하는 세그먼트가 너무 길거나 문장이 뭉쳐질 수 있으므로 후처리:

- Web Audio API로 MP3 디코딩 → 모노 16kHz PCM.
- 프레임 단위 RMS 계산(예: 20ms 창).
- 임계값(예: -40dBFS)보다 낮은 상태가 0.6초 이상 지속되면 무음 구간으로 판정 → 세그먼트 경계로 사용.
- Whisper 세그먼트를 이 무음 경계와 교차 매칭:
  - 긴 Whisper 세그먼트 내부에 무음이 있으면 그 지점에서 분할.
  - 무음 다음에 오는 텍스트의 시작 시간을 정렬해 SYLT의 sync point로 사용.
- 최소 세그먼트 길이 0.8초, 최대 12초로 클램프.

### 3. SYLT/USLT 저장 (`src/lib/id3.ts` 확장)

`browser-id3-writer`는 `SYLT` 프레임을 지원(제한적). 옵션 구조:

```ts
interface SyltLine { time: number; /* ms */ text: string; }
interface Id3Tags {
  ...
  lyrics?: string;             // USLT (unchanged)
  syncedLyrics?: SyltLine[];   // NEW
}
```

`applyTags`에 추가:
- `syncedLyrics`가 있으면 `writer.setFrame("SYLT", { type: 1, timestampFormat: 2 /* ms */, language: "kor", description: "", synchronisedText: syncedLyrics })`.
- 라이브러리가 SYLT 미지원 버전이면 폴백으로 이미 존재하는 `USLT`만 저장 + 콘솔 경고 → 사전에 버전 확인해서 필요 시 최신으로 업그레이드.
- USLT 필드는 SYLT 라인의 텍스트만 개행으로 연결해 함께 기록해 호환성 보장.

### 4. 팝업 컴포넌트 리팩터 (`src/components/TagEditorForm.tsx`)

가사 다이얼로그 부분을 별도 파일로 분리:
- `src/components/LyricsDialog.tsx` — mode 토글, USLT/SYLT 각 편집 뷰, 음성인식 버튼/진행률, 라인 파서/직렬화.
- Props: `open`, `onOpenChange`, `mp3File`, `initialLyrics`, `initialSynced`, `onSave({ lyrics, syncedLyrics, mode })`.
- 부모(`TagEditorForm`)는 저장 콜백으로 상태 반영, `handleSave`에서 tags에 `syncedLyrics` 포함.
- 태그 읽기(`src/lib/id3-read.ts`)에도 SYLT 로드 시도 추가(jsmediatags가 SYLT를 파싱하지 못하면 무시하고 USLT만 채움).

### 5. 라인 포맷

- 표시/편집 라인 규격: `[mm:ss.xx] 텍스트` (10ms 단위). 정규식: `^\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$`.
- 저장 시 파서가 형식이 맞지 않는 라인은 이전 라인 뒤에 이어붙이거나(text 병합) 건너뜀(경고 토스트).

### 6. 성능/UX

- Whisper 실행은 Web Worker(패키지가 내부적으로 지원). UI 스레드 프리즈 방지.
- 진행률: 모델 로드(%) → 오디오 디코드 → 세그먼트 인식 순차 진행 바.
- 취소 버튼: 인식 중단 가능(`AbortController` 또는 라이브러리 취소 API).
- 파일 크기 큰 mp3(예: >20MB)는 인식 시간이 길다는 안내 툴팁 추가.

## 변경/추가 파일

- **추가** `src/lib/whisper/transcribe.client.ts` — 모델 로드/캐시/전사 API.
- **추가** `src/lib/whisper/segment.ts` — 무음 감지 및 세그먼트 후처리.
- **추가** `src/components/LyricsDialog.tsx` — USLT/SYLT 토글 팝업.
- **수정** `src/lib/id3.ts` — `syncedLyrics` 지원(SYLT 프레임 기록).
- **수정** `src/lib/id3-read.ts` — SYLT 있으면 라인 반환(선택, 실패 시 조용히 무시).
- **수정** `src/components/TagEditorForm.tsx` — 다이얼로그 분리, 새 저장 시그니처 반영.
- **수정** `package.json` — `@transcribe/transcriber` 및 필요한 whisper.cpp 모델 로더 의존성 추가(런타임 add).

## 의존성/에셋 노트

- WASM 바이너리(`@transcribe/transcriber`가 참조)는 `public/wasm/`에 배치하고 CDN 경로로 로드. 서버 번들 포함 금지(클라이언트 동적 import만).
- 모델 파일은 저장소에 커밋하지 않음: 최초 실행 시 사용자 브라우저가 Hugging Face 원본에서 fetch → Cache Storage 저장. 이후 오프라인 동작.
  - 원본 URL은 상수 파일에 배치하고 필요 시 자체 CDN으로 대체 가능하도록 인터페이스화.

## 한계/트레이드오프

- 첫 실행은 온라인 필요(모델 최초 다운로드). 이후 완전 오프라인.
- Whisper base 모델(~57MB) 기준 3분 곡 인식은 데스크톱에서 10~30초, 모바일은 그 이상 소요. UI에 명시.
- 자동 타임스탬프는 근사값이며 짧은 감탄사/후렴 반복은 오차 큼 → 사용자 수동 보정 전제.
