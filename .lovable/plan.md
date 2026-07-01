
## 목표
안드로이드 모바일에 최적화된 MP4→MP3 변환 웹앱. 브라우저 내에서 ffmpeg.wasm으로 변환하고, ID3 태그를 주입한 뒤 다운로드. Service Worker로 오프라인 동작(PWA).

## 화면 구성 (단일 페이지, `/`)

```text
┌──────────────────────────────┐
│  MP4 → MP3 Converter         │
├──────────────────────────────┤
│  [ MP4 파일 선택 ]           │
│  선택됨: my_video.mp4        │
├──────────────────────────────┤
│  파일명       [my_video    ] │
│  제목         [my_video    ] │
│  아티스트     [            ] │
│  앨범 아티스트[            ] │
│  트랙 번호    [            ] │
│  앨범         [            ] │
├──────────────────────────────┤
│  [ 변환 & 다운로드 ]         │
│  진행률: ████████░░ 80%      │
└──────────────────────────────┘
```

- 모바일 우선, 세로 스택, 큰 터치 타깃(min-h-12), 카드 컨테이너 1개
- 파일 선택 시 확장자 제외한 basename을 파일명/제목 인풋에 자동 입력
- 변환 중 버튼 비활성화 + 진행률 표시(ffmpeg progress 콜백)

## 변환/태그 파이프라인 (클라이언트 전용)

1. `@ffmpeg/ffmpeg` + `@ffmpeg/util`로 mp4 → mp3 (`-vn -codec:a libmp3lame -q:a 2`)
2. 반환된 mp3 Uint8Array에 `browser-id3-writer`로 ID3v2 태그 삽입
   - TIT2(제목), TPE1(아티스트), TPE2(앨범 아티스트), TRCK(트랙), TALB(앨범)
3. Blob → `<a download="{파일명}.mp3">` 트리거

서버 로직/Lovable Cloud 사용하지 않음. 전 과정 브라우저에서 처리.

## PWA & 오프라인

- `vite-plugin-pwa` (`generateSW`, `registerType: "autoUpdate"`)
- Registration wrapper로 Lovable preview/iframe/dev에서는 등록 금지 (스킬 규정 준수), `?sw=off` 킬스위치
- 매니페스트: name, short_name, theme_color, display: standalone, 아이콘(192/512)
- 캐싱 전략:
  - HTML 네비게이션: NetworkFirst
  - 앱 셸 해시 자산: CacheFirst (precache)
  - ffmpeg core (`ffmpeg-core.js`, `ffmpeg-core.wasm`) — `public/ffmpeg/`에 정적 배치하여 precache에 포함 → 첫 방문 이후 오프라인 동작 가능
- ffmpeg 로드 시 `coreURL`/`wasmURL`을 `/ffmpeg/...` 로컬 경로로 지정 (CDN 미사용)

## 기술 세부

- 의존성: `@ffmpeg/ffmpeg`, `@ffmpeg/util`, `browser-id3-writer`, `vite-plugin-pwa`
- ffmpeg core 파일은 `bun add`한 뒤 postinstall 없이 수동으로 `node_modules/@ffmpeg/core/dist/umd/*` 를 `public/ffmpeg/`에 복사 (빌드 스크립트 1회, 또는 vite 플러그인으로 자동 복사)
- SharedArrayBuffer 필요 → `vite.config.ts` dev/preview 헤더 및 배포용 `_headers`에 COOP/COEP 추가:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- 단일 라우트 `src/routes/index.tsx`에 UI + 변환 훅 구현 (서버 함수 없음)
- 컴포넌트 분리: `src/components/ConverterForm.tsx`, `src/lib/convert.ts` (ffmpeg 래퍼), `src/lib/id3.ts`

## 향후 Capacitor
- PWA 매니페스트/아이콘이 갖춰지므로 이후 `npx cap add android` → `bun run build` → `cap sync`만으로 APK 래핑 가능 (이번 스코프에는 포함하지 않음)

## 스코프 제외
- 백엔드/DB/인증 없음 (Lovable Cloud 미사용)
- 배치 변환, 트리밍, 앨범 커버 이미지 (요청 시 확장)
