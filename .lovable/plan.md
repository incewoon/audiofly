## 수정 계획

### 1) 상단 헤더 버튼 줄바꿈 + 파일명 오버플로우
두 페이지(`ConverterForm.tsx`, `TagEditorForm.tsx`) 카드 헤더에서:
- 제목(`CardTitle`)에 `min-w-0 truncate` 추가, 폰트 크기 소폭 축소(`text-lg`)
- 오른쪽 링크 버튼에 `whitespace-nowrap shrink-0` 추가하여 "MP3 태그 편집" / "MP4 → MP3 변환" 텍스트가 한 줄로 유지
- 파일 선택 버튼(`<Button variant="outline">`)의 파일명 span을 별도 요소로 감싸 `block overflow-x-auto whitespace-nowrap` 처리하여 긴 파일명이 박스를 넘지 않고 가로 스크롤

### 2) 변환 완료 토스트 문구 + 바로가기
- 문구를 `"다운로드가 완료되었습니다"`로 변경
- `sonner`의 `toast.success(..., { action: { label: "바로가기", onClick: ... } })`로 오른쪽 액션 버튼 추가
- **웹 표준 한계 안내**: 순수 브라우저에서는 임의의 로컬 폴더(다운로드 폴더)를 여는 API가 없음. 대신 다음 전략 사용:
  - `showSaveFilePicker` 지원 브라우저(데스크톱 Chrome/Edge): 이 API로 저장 후 반환된 `FileSystemFileHandle`을 메모리에 보관 → "바로가기" 클릭 시 저장된 파일을 새 탭에서 열기(`handle.getFile()` → `URL.createObjectURL`)
  - 미지원(모바일 Chrome 등): 기존 `<a download>` 방식 유지, "바로가기" 클릭 시 방금 만든 blob URL을 새 탭으로 여는 것으로 대체(파일 자체를 재생/미리보기)
- 진짜 "다운로드 폴더 열기"는 웹 앱에서 불가능하다는 점을 계획 노트로 남김

### 3) 동영상 선택 시 노래 제목/파일명에 임의 숫자 표시
원인: Android Chrome이 `accept="video/mp4,video/*"` + 갤러리에서 선택 시 MediaStore의 숫자 ID(예: `13952.mp4`)를 `file.name`으로 반환.
조치:
- `<input>` `accept`를 `".mp4,.m4v,.mov,video/mp4"`로 좁혀 시스템 파일 선택기(Documents/Files) 유도
- `showOpenFilePicker` 지원 시 우선 사용(`types: [{accept:{'video/mp4':['.mp4']}}]`) → 파일 시스템에서 진짜 파일명 획득
- 두 경로 모두 실패해도 최소한 사용자에게 문서 선택기가 뜨도록 유도. 완전 해결은 OS 정책상 불가능하므로 안내 툴팁 추가

### 4) MP3 태그 편집 파일 선택이 사진/미디어 선택기로 이동
원인: `TagEditorForm.tsx`의 mp3 input `accept`가 `audio/mpeg` 또는 유사값이라 Android가 미디어 피커를 띄움.
조치:
- `accept=".mp3"` 만 지정(오디오 MIME 제거)하여 Documents(다운로드 폴더 포함) 파일 매니저로 열리도록
- `showOpenFilePicker` 지원 시 `types: [{accept:{'audio/mpeg':['.mp3']}}]`로 우선 호출
- 커버 이미지 input은 그대로 둠

### 변경 파일
- `src/components/ConverterForm.tsx` — 헤더 레이아웃, 파일명 스크롤, accept 조정, showOpenFilePicker 도입, 성공 토스트 문구/액션, blob URL 유지
- `src/components/TagEditorForm.tsx` — 헤더 레이아웃, 파일명 스크롤, mp3 accept=".mp3" 및 showOpenFilePicker
- (선택) `src/lib/pick-file.ts` 신규 — showOpenFilePicker 래퍼 공통화

### 기술 노트
- `showSaveFilePicker` / `showOpenFilePicker`는 secure context에서만 동작, iOS Safari 미지원 → 항상 try/catch 후 hidden `<input>` fallback
- 브라우저에서 "파일 탐색기에서 위치 열기"는 표준 API 부재 — 요청 2의 "바로가기"는 파일 재열람으로 대체
