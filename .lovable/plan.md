
## 변경 요약
- 태그 편집 페이지 하단 버튼: "다운로드"가 아니라 **원본 MP3 파일 수정(덮어쓰기 저장)** 방식으로 동작
- 두 페이지 모두 하단 버튼 실행이 끝나면 **파일 선택 + 모든 입력 필드 + 프리셋을 초기화**
- 태그 편집 페이지에서 파일 선택 시 **기존 ID3 태그를 읽어 입력 필드를 자동 채움**

## 라우팅

```text
src/routes/
  index.tsx        → /            (MP4 → MP3 변환)
  tag-editor.tsx   → /tag-editor  (MP3 태그 편집)
```

- 각 페이지 카드 헤더 우측에 상대 페이지로 이동하는 `<Link>` 버튼
- 각 라우트에 고유 `head()` (title/description/og)

## 태그 편집 페이지 (`/tag-editor`)

### 레이아웃 (모바일 한 화면)

```text
┌──────────────────────────────────────────┐
│ 🎵 MP3 태그 편집        [MP4→MP3 변환 →] │
├──────────────────────────────────────────┤
│ [ MP3 파일 선택 ]  선택됨: song.mp3      │
├──────────────────────────────────────────┤
│ 노래 제목     [                       ]  │
│ 노래 참여자   [                       ]  │
│ 앨범 참여자   [                       ]  │
│ 앨범명        [           ] 트랙 # [  ]  │
│ 장르          [                       ]  │
│ [ 📝 가사 편집 ]  [ 🖼 앨범 아트 설정 ]  │
├──────────────────────────────────────────┤
│         [ 태그 저장 (원본 수정) ]        │
└──────────────────────────────────────────┘
```

### 파일 선택 시 기존 태그 자동 로드
- 라이브러리: `jsmediatags` (경량, ID3v1/v2 지원, 브라우저 번들 OK)
- 파싱 대상 프레임 → 매핑
  - `TIT2` → 노래 제목
  - `TPE1` → 노래 참여자
  - `TPE2` → 앨범 참여자
  - `TALB` → 앨범명
  - `TRCK` → 트랙 번호
  - `TCON` → 장르
  - `USLT` → 가사 (팝업 상태에 저장)
  - `APIC` → 앨범 아트 (미리보기 표시, 원본 그대로 유지)
- 파싱 실패/태그 없음 → 조용히 빈 상태 유지, toast 안내

### 가사(USLT) 팝업 (shadcn Dialog)
- 큰 `Textarea` (min-h ~ 40vh), 저장/취소, 언어 코드 기본 `kor`
- 파일에서 읽어온 가사 있으면 프리필

### 앨범 아트(APIC) 팝업 (shadcn Dialog)
- `accept="image/jpeg,image/png"`, 미리보기 썸네일, 제거 버튼
- 파일에서 읽어온 커버 있으면 프리필 (Blob URL로 미리보기)
- 안내: 권장 500×500~1000×1000 정사각, 최대 1MB 권장, JPEG/PNG
- 초과 시 경고 toast(차단은 안 함)

### "태그 저장 (원본 수정)" 동작
목표: **업로드된 원본 MP3 파일 자체를 수정**.

브라우저 보안상 사용자가 임의로 선택한 파일에 직접 쓰기는 File System Access API(`showOpenFilePicker` → `createWritable`)가 지원되는 환경에서만 가능. 안드로이드 Chrome은 현재 미지원. 따라서 다음 순서로 시도:

1. `showSaveFilePicker`가 있으면 → 원본 파일명으로 저장 대화상자 표시(사용자가 같은 위치·이름 선택 시 실질적으로 덮어쓰기)
2. 미지원(안드로이드 등) 폴백 → 원본과 **동일한 파일명**으로 자동 다운로드. OS/브라우저가 "같은 이름 파일 교체" 여부를 처리
3. 성공 후 toast: "태그가 저장되었습니다. 다운로드 폴더의 동일 이름 파일을 원본에 덮어써 주세요." (폴백일 때만 안내 문구 노출)

파이프라인:
- 업로드 MP3 → `ArrayBuffer`
- `browser-id3-writer`로 새 태그 프레임 세팅 후 앞쪽 ID3 태그를 새로 붙인 Blob 반환 (기존 ID3v2 헤더는 라이브러리가 스트립)
- 파일명은 원본 그대로 (`file.name`) 유지

## MP4→MP3 변환 페이지 (`/`)

- 헤더 우측에 `<Link to="/tag-editor">` "MP3 태그 편집" 버튼 추가
- 다운로드 성공 후 **폼 전체 초기화** (아래 공통 초기화 규칙 적용)

## 두 페이지 공통: 하단 버튼 완료 후 초기화 규칙

성공적으로 처리(변환+다운로드 / 태그 저장)가 끝나면 다음을 모두 리셋:
- 선택 파일: `null`, `<input type="file">` value도 `""`로 초기화
- 텍스트 입력: 제목, 아티스트, 앨범 아티스트, 앨범, 트랙 번호, 파일명, 장르
- 가사(USLT) 상태, 앨범 아트(APIC) 상태 및 Blob URL revoke
- 진행률 `0`, 상태 `idle`
- **파일명 프리셋 선택(1/2)도 기본값 "1"로 초기화**하고 localStorage에서 `audiofly:filename-preset` 제거 → "첫 실행 시 세팅은 1" 규칙과 일치
- 실패(에러) 시에는 초기화하지 않음(사용자가 수정 후 재시도할 수 있게 유지)

## 태그 라이브러리 확장

`src/lib/id3.ts`:
- `Id3Tags`에 `genre?: string`, `lyrics?: string`, `cover?: { data: ArrayBuffer; mime: "image/jpeg" | "image/png" }` 추가
- `writeId3Tags(mp3, tags)` — `TCON`, `USLT`(`{ language: 'kor', description: '', lyrics }`), `APIC`(`{ type: 3, data, description: '' }`) 프레임 추가
- 신규 `tagExistingMp3(buffer, tags): Blob` — 업로드 MP3에 태그만 다시 쓰는 편의 래퍼

`src/lib/id3-read.ts` (신규):
- `readId3Tags(file: File): Promise<ReadTags>` — `jsmediatags`로 파싱, 위 매핑 반환. APIC는 `{ data: ArrayBuffer, mime, previewUrl }` 형태로 반환

## 파일 변경 목록

- 추가: `src/routes/tag-editor.tsx`
- 추가: `src/components/TagEditorForm.tsx` (Dialog 2개 포함)
- 추가: `src/lib/id3-read.ts`
- 수정: `src/lib/id3.ts` (프레임 3종 추가, `tagExistingMp3` export)
- 수정: `src/components/ConverterForm.tsx` (헤더 우측 링크, 성공 후 전체 초기화 + 프리셋 리셋)
- 의존성 추가: `jsmediatags`
- shadcn `dialog`, `textarea` 미설치 시 추가

## 범위 외
- 앨범 아트 자동 리사이즈/압축
- ID3v1 전용 파일에 대한 v1 유지(모든 파일에 ID3v2 부여)
- 배치 편집, 태그 프리셋 저장
