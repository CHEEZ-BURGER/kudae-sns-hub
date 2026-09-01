# 고대신문 SNS 배포실

부장이 카드뉴스 이미지·영상과 원고를 한 번 올리면, 기자가 배포 링크에서 게시물별 원본 미디어와 제목·본문을 바로 가져가는 내부 웹 도구입니다.

화면은 GitHub Pages에 정적으로 배포하고, 로그인·데이터베이스·비공개 이미지 저장·읽기 전용 링크 API는 Supabase가 담당합니다. 따라서 GitHub 저장소나 브라우저에 관리자 키가 들어가지 않습니다.

## 주요 기능

- 이미지·MP4/MOV/M4V/WebM, 폴더, ZIP, HWP/HWPX/TXT/DOCX 드래그 앤 드롭
- ZIP 브라우저 내 자동 해제, 폴더 재귀 읽기
- `2046호 석탑1` 같은 이름에서 그룹 추출 및 `1, 2, … 10` 자연 정렬
- HWP/HWPX 브라우저 직접 추출, DOCX/TXT 지원, 실패 시 원고 붙여넣기 대체 경로
- `[보도]`, `[포토뉴스]`, `[사설]`, `[주간 뉴스레터 석탑]` 헤더별 원고 분리
- 지속가능↔탄소중립, 포스트몽골↔북원 등 키워드·업무 규칙 기반 자동 매칭과 신뢰도 표시
- 관리자의 수동 연결, 제목·본문·URL 수정, 원고 크레딧의 본문 자동 포함, 게시물 추가/삭제, 미디어 드래그 재정렬
- 최근 배포 3개 보관, 기존 배포 수정(공개 링크 유지), 수동 삭제
- 공유·드래그·다운로드에는 변환하지 않은 원본 파일만 사용하며 이미지는 목록용 썸네일만 별도 생성
- 기자의 제목/본문 개별 복사, 원본 여러 개 묶음 드래그, 개별 복사/저장, 다중 파일 Web Share, 게시물별 ZIP 다운로드
- 로그인 없는 읽기 전용 토큰 링크, 만료일 지원, 비공개 Storage 서명 URL
- 관리자 ID/비밀번호 로그인과 관리자 화면의 추가 계정 발급
- 모바일 우선 기자 화면과 한국어 로딩·오류·빈 상태

## 구조

```text
src/                         GitHub Pages용 React 앱
  components/                관리자·기자 화면
  lib/workflow.ts            정렬·원고 분리·자동 매칭
  lib/document-parser.ts     ZIP/HWP/HWPX/DOCX/TXT 처리
  lib/publish.ts             Supabase 업로드·배포
supabase/
  migrations/                DB, RLS, 비공개 Storage 설정
  functions/public-distribution/  토큰 검증, 원본 서명 URL
  functions/admin-users/     관리자 인증, 계정 목록·추가
fixtures/                    2046호 테스트 원고
.github/workflows/           GitHub Pages 자동 배포
```

## 1. 로컬 실행

Node.js 20 이상이 필요합니다.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Supabase를 연결하기 전에도 `2046호 샘플로 체험`을 눌러 파일 분석·매칭·편집 흐름을 확인할 수 있습니다. 실제 배포만 비활성화됩니다.

품질 확인:

```powershell
npm test
npm run build
```

## 2. Supabase 프로젝트 준비

1. Supabase에서 새 프로젝트를 만듭니다.
2. Project Settings → API에서 Project URL과 Publishable key를 복사합니다. 구형 프로젝트의 anon key도 사용할 수 있습니다.
3. `.env.local`을 다음처럼 채웁니다. `service_role` 키는 절대로 여기에 넣지 않습니다.

```dotenv
VITE_SUPABASE_URL=https://프로젝트-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

4. Supabase CLI로 로그인하고 이 폴더에서 프로젝트를 연결합니다.

```powershell
npx supabase login
npx supabase link --project-ref 프로젝트-ref
npx supabase db push
npx supabase functions deploy public-distribution
npx supabase functions deploy admin-users
```

`supabase/config.toml`의 함수들은 내부에서 용도별 검증을 직접 수행합니다. 기자용 함수는 URL의 192비트 랜덤 토큰을 SHA-256으로 검증한 뒤 해당 배포만 읽고, 관리자 계정 함수는 로그인 토큰과 `is_admin` 권한을 모두 확인합니다. Storage 버킷은 공개가 아니며 함수가 1시간짜리 서명 URL을 발급합니다.

### 첫 관리자 지정

첫 계정에 한해서 Supabase Dashboard → Authentication → Users에서 사용자를 생성합니다. 앱의 관리자 ID가 `desk_editor`라면 이메일에는 `desk_editor@admin.kudae.invalid`를 입력하고 **Auto confirm user**를 켭니다. 이 주소는 메일 발송용이 아니라 Supabase Auth 내부 식별자입니다. 프로필은 자동 생성되므로 SQL Editor에서 아래 쿼리를 한 번 실행합니다.

```sql
update public.profiles
set is_admin = true
where username = 'desk_editor';
```

이후에는 앱 우측 상단의 **관리자 계정 관리**에서 ID와 초기 비밀번호를 입력해 관리자를 추가할 수 있습니다. 관리자만 계정을 발급하고 원본 업로드, 게시물 DB 변경, 비공개 Storage 접근을 할 수 있습니다. 기자 링크에서는 Edge Function이 토큰 범위 안의 배포 자료만 읽도록 허용합니다.

### Auth URL 설정

Authentication → URL Configuration에 다음을 등록합니다.

- Site URL: 실제 GitHub Pages 주소
- Redirect URLs: `http://localhost:5173/**`
- Redirect URLs: `https://계정.github.io/저장소/**`

## 3. GitHub Pages 배포

이 프로젝트를 GitHub 저장소의 루트로 올립니다. Settings → Secrets and variables → Actions에 아래 두 Repository secret을 추가합니다.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Settings → Pages → Build and deployment의 Source를 **GitHub Actions**로 선택합니다. `main` 브랜치에 push하면 테스트와 빌드를 통과한 결과만 Pages에 배포됩니다. 프로젝트 저장소와 `계정.github.io` 저장소 모두에 맞게 base path를 자동 계산합니다.

```powershell
git init
git add .
git commit -m "Build Korea University Newspaper SNS distribution tool"
git branch -M main
git remote add origin https://github.com/계정/저장소.git
git push -u origin main
```

## 실제 사용 흐름

### 부장

1. 관리자 ID와 비밀번호로 로그인
2. 필요하면 우측 상단의 관리자 계정 관리에서 다른 관리자를 추가
3. 카드뉴스 이미지·영상 폴더 또는 ZIP과 원고를 한꺼번에 드롭
4. 자동 매칭 신뢰도가 낮은 항목만 드롭다운으로 수정
5. 제목·본문·URL·크레딧과 미디어 순서를 확인
6. `배포하기` → 링크 복사 → 카카오톡 전달

### 기자

1. 링크 열기
2. 원본은 페이지의 임시 메모리에 자동 준비됨(브라우저 캐시에 별도 보관하지 않음)
3. 모바일에서 `전체 공유`로 다중 파일 공유, PC에서는 `전체 ZIP`으로 저장
4. 페이스북 웹은 브라우저 보안 정책으로 다른 페이지에서 만든 다중 파일 붙여넣기·드롭을 받지 않으므로 ZIP 압축 해제 후 선택
5. 지원되지 않는 환경에서는 `전체 공유` 또는 `전체 ZIP` 사용
6. `제목 복사`와 `본문 복사`를 각각 사용

## HWP 및 브라우저 제약

- HWP 5.0과 HWPX는 `@ssabrojs/hwpxjs`의 각 형식 전용 파서로 브라우저에서 직접 읽습니다. 암호화 문서, 배포용 ViewText, HWP 3.0 등은 추출할 수 없을 수 있으며 이때 앱은 멈추지 않고 TXT 업로드/원고 붙여넣기를 안내합니다.
- 한글 원본 파일명은 DB에 그대로 보존하지만 Supabase Storage key에는 확장자만 사용하는 ASCII 경로를 생성해 `Invalid key` 오류를 방지합니다.
- DOCX는 텍스트만 추출합니다. 문서의 시각적 서식은 SNS 본문에 필요하지 않아 보존하지 않습니다.
- 외부 SNS 작성창이 브라우저의 다중 파일 드롭을 받아야 묶음 드래그가 동작합니다. 페이스북 웹처럼 이를 차단하는 SNS에서는 다중 파일 Web Share 또는 ZIP 다운로드를 사용합니다.
- 이미지 여러 장을 클립보드의 독립 항목으로 복사하는 기능은 브라우저 표준상 안정적으로 지원되지 않습니다. 앱은 개별 이미지 복사만 제공하며 영상은 원본 저장·공유·드래그로 전달합니다.
- Web Share 동작은 모바일 OS와 Instagram 앱 버전에 따라 달라질 수 있습니다. `navigator.canShare({ files })`가 거부하면 ZIP 다운로드 안내가 표시됩니다.
- 마이그레이션의 버킷 개별 파일 제한은 500MB입니다. 실제 허용 크기는 Supabase 프로젝트 플랜의 전역 업로드 제한을 넘을 수 없습니다.

## 샘플과 테스트

- 앱의 `2046호 샘플로 체험`은 실제 파일명 규칙과 5개 원고 섹션을 즉석 생성합니다.
- `fixtures/2046호 카드뉴스.txt`는 TXT 업로드 테스트에 사용할 수 있습니다.
- `src/lib/workflow.test.ts`와 `src/lib/storage-path.test.ts`는 파일명 그룹화, 자연 정렬, 실제 HWP 줄바꿈 기반 원고 분할, 본문 내 크레딧, 5개 업무 예시 자동 매칭, 안전한 Storage 경로를 검증합니다.

## 운영 권장 사항

- 공유 링크는 업무 채널에서만 전달하고, 필요 시 `expires_at`을 사용해 만료시키세요.
- 관리자 계정에는 강한 비밀번호와 Supabase MFA를 사용하세요.
- 무료 플랜의 Storage 용량/대역폭과 Edge Function 한도를 정기적으로 확인하세요.
- 오래된 배포를 삭제할 때 DB 행뿐 아니라 해당 Storage 경로도 함께 정리하는 운영 작업을 두는 것이 좋습니다.
