## 목표
어제 small-q5_1로 올린 뒤 속도가 크게 느려졌음. 정확도 재평가 전까지 **모델만 base-q5_1로 회귀**하고, 어제 함께 도입한 언어 토글/suppress_non_speech는 유지. 추가로 실측 근거가 있는 속도 최적화를 함께 적용.

## 변경 사항

### 1) 모델 회귀 (base-q5_1)
- `src/lib/engine-assets.ts`
  - `WHISPER_MODEL_URL`을 다시 `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin` 으로 교체.
  - 나머지(주석의 "약 190MB", `ENGINE_CACHE_URLS` 제외 정책)는 유지, 크기 표기만 base 기준(~57MB)으로 되돌림.
- `src/components/LyricsDialog.tsx`
  - 다운로드 버튼 문구 "음성인식 모듈 다운로드(약 190MB)" → "약 60MB"로만 수정.
  - 그 외 상태 배지/토글/삭제 로직은 그대로 유지.
- 캐시 키가 URL이므로 기존에 small을 받아뒀던 사용자는 자동으로는 지워지지 않지만, 새 URL(base) 기준으로는 "미설치"로 표시되어 다시 다운로드하면 base가 캐시됨. 기존 small 캐시는 사용자가 "삭제" 버튼으로 정리 가능(안전).

### 2) 언어 토글 / 무음 환각 억제 유지
- `transcribeMp3`의 `lang: "ko" | "en"` 파라미터, `suppress_non_speech: true`, LyricsDialog의 한국어/English 토글은 어제 그대로 유지.

### 3) 실제 속도 저하 요인 정리 (`src/lib/whisper/transcribe.ts`)
조사 결과 `@transcribe/transcriber@…`의 `FileTranscribeOptions`가 노출하는 옵션은 다음뿐:
`lang, threads, translate, max_len, split_on_word, suppress_non_speech, token_timestamps`.
- **beam_size는 라이브러리 옵션으로 노출되어 있지 않음** → 사용자가 우려한 "숨은 beam search"는 이 래퍼에서 우리가 켜고 끌 수 있는 스위치가 없음(whisper.cpp WASM 빌드가 내부적으로 greedy를 쓰도록 고정돼 있는 형태). 따라서 이번엔 손대지 않음. (근거는 index.d.ts의 `transcribe(...)` 시그니처.)
- **token_timestamps: true → false 로 변경**.
  - 우리는 세그먼트 단위의 `offsets.from/to`만 사용(코드상 `seg.offsets?.from/to`). 토큰 단위 타임스탬프는 UI/저장 어디에서도 쓰지 않음.
  - whisper.cpp에서 token_timestamps는 세그먼트 디코딩 뒤 토큰별 재정렬/보정을 돌리므로 켜면 순수한 오버헤드. 세그먼트 offsets는 이 옵션과 무관하게 정상 제공됨.
- 스레드 상한 `Math.min(navigator.hardwareConcurrency || 4, 4)` 유지(WASM SIMD + pthread 환경에서 4 초과는 실측상 이득이 거의 없고 모바일에서 오히려 손해).

### 4) 손대지 않는 것
- SW / ffmpeg / convert 관련 코드, prewarm 정책, offline 라우팅.
- `_headers`, `vite.config.ts`, `generate-sw.mjs`, `patch-wrangler.mjs`.
- LyricsDialog의 UI 배치(토글, 상태 배지, 진행률, 삭제 버튼).

## 변경 파일
```text
src/lib/engine-assets.ts        WHISPER_MODEL_URL을 base-q5_1로 되돌림
src/lib/whisper/transcribe.ts   token_timestamps: false 로 변경 (그 외 유지)
src/components/LyricsDialog.tsx 다운로드 버튼 크기 표기만 60MB로 수정
```

## 검증
1. "삭제" → 새 URL 기준으로 "미설치" 표시 확인 → "모듈 다운로드" 클릭 → 60MB 근처에서 완료.
2. 3분짜리 곡을 한국어/English 각각으로 자동추출 → 어제 대비 처리시간이 눈에 띄게 줄어드는지 확인(모델 회귀 + token_timestamps off의 합산 효과).
3. 세그먼트 시작/끝 시간이 여전히 정상 표시되는지 확인(SYLT 미리보기).
4. 오프라인 재실행: 캐시된 base 모델로 자동추출이 정상 동작하는지 확인.

## 후속(이번엔 하지 않음)
- 정확도가 base에서도 견딜 만하면 이대로 유지. 부족하면 `small` 대신 **`ggml-small.en-q5_1`(영어 전용, ~180MB) + `ggml-base-q5_1`(한글용)**을 언어 토글로 분리 로딩하는 방식을 다음 라운드에서 검토(속도-정확도 균형이 더 좋음).
