# 고대신문 SNS Upload Helper

고대신문 SNS 배포실에서 선택한 카드뉴스 이미지를 로컬 디스크에 저장하지 않고 Chrome 메모리의 `Blob`/`File`로 Instagram Web 게시물 입력에 전달하는 Manifest V3 확장 프로그램입니다.

## 무료 설치

Chrome 웹스토어를 사용하지 않는 사내용 확장이므로 비용은 들지 않지만, 각 PC에서 한 번 설치해야 합니다.

1. 배포실에서 `Chrome 확장 다운로드`를 눌러 ZIP을 받습니다.
2. ZIP을 원하는 폴더에 압축 해제합니다. 이 폴더는 확장 프로그램 코드 폴더이며 카드뉴스 이미지 저장 공간이 아닙니다.
3. Chrome 주소창에 `chrome://extensions`를 입력합니다.
4. 우측 상단 `개발자 모드`를 켭니다.
5. `압축해제된 확장 프로그램을 로드합니다`를 누르고, 압축을 푼 폴더 안에서 `manifest.json`이 보이는 폴더를 선택합니다.
6. 배포실 페이지를 한 번 새로고침합니다.

Chrome 148 이상에서만 동작합니다. Android/iPhone Chrome은 확장 프로그램을 지원하지 않으므로 모바일 기자는 기존 `순차 복사` 또는 `원본 저장`을 사용합니다.

## 사용

1. 기자용 배포 링크에서 게시물을 엽니다.
2. `Instagram에 바로 넣기`를 누릅니다.
3. Instagram 탭이 열리면, 자동으로 작성 창을 찾지 못한 경우 `만들기 → 게시물`을 직접 엽니다.
4. 이미지가 들어오면 크롭과 본문을 확인하고 최종 게시 버튼은 직접 누릅니다.

확장 아이콘을 누르면 1장/10장 메모리 파일 주입 fixture가 열립니다.

## 보안 및 데이터 경계

- 요청 권한: `storage.session`, 고대신문 배포실, Instagram, 해당 Supabase Storage 호스트만 사용
- 사용하지 않는 권한: `downloads`, `cookies`, `history`, `webRequest`, `<all_urls>`
- Storage에는 작업 번호·URL·파일명·상태만 최대 10분 동안 보관
- 이미지 바이너리는 디스크·`chrome.storage`·Base64에 저장하지 않고 RAM에서만 처리
- Supabase service role key와 Instagram 로그인 정보에 접근하지 않음
- 최종 게시 버튼을 자동으로 누르지 않음

## 구조

```text
background/service-worker.js  작업 상태·탭·fetch·File 전달
content/app-bridge.js          GitHub Pages와 확장 프로그램 연결
content/instagram.js           Instagram semantic selector와 FileList 주입
content/overlay.js             진행·대기·오류·취소 UI
shared/                        프로토콜·상태·보안 검증
fixture/                       1장/10장 자동 주입 테스트
```

Instagram의 화면 구조가 바뀌면 `content/instagram.js`의 `InstagramAdapter`만 조정합니다.
