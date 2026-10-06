# AWS 파일 전송 전환 — 준비된 코드와 활성화 절차

2026-10-06 현재 관리자 사진 추가·삭제·교체와 차등 저장은 Supabase에서도 동작합니다.
AWS 계정이 아직 없으므로 AWS 파일 저장·전송은 활성화하지 않습니다.
계정 연결, 실제 파일 전송, 기존 확장 검증까지 끝낸 뒤 아래 설정을 활성화하세요.

## 역할과 기존 확장 호환성

- GitHub Pages: 웹앱과 카카오 미리보기.
- Supabase: Auth, 게시물 DB, 관리자 확인, 파일 URL 접근권한 확인.
- S3: 이미지·영상 원본과 이미지 썸네일. 공개 버킷 사용 금지.
- CloudFront: 실제 파일 바이트를 기자에게 전달.
- 기존 확장: 버전 2.2.2와 소스를 그대로 유지.

기존 확장은 Supabase 파일 호스트만 허용합니다. 따라서 `originalUrl`에는
`https://bcqqokdehkfaiuquktag.supabase.co/functions/v1/media-redirect?...`를 반환합니다.
이 함수는 만료된 서명·삭제된 파일·만료된 배포를 검사한 뒤 CloudFront의 짧은 서명 URL로
HTTP 302만 반환합니다. 파일 내용을 다운로드하거나 중계하지 않습니다.
기존 확장이 리디렉션 뒤 파일을 받을 수 있도록 CloudFront의 GET 응답에
`Access-Control-Allow-Origin: *`가 반드시 필요합니다. 계정 연결 후 설치된 기존 확장의
실제 이미지 전달로 확인하기 전에는 호환성이 최종 검증된 것으로 간주하지 않습니다.

DB 경로는 기존 Supabase 파일을 그대로 보존하고 새 AWS 파일만 `s3:` 접두사를 사용합니다.
파일 저장소 두 개를 함께 읽을 수 있으므로 기존 배포 링크를 바꿀 필요가 없습니다.

## 계정 준비와 리소스 설정

1. 사용자가 AWS 계정 가입·본인 확인·결제수단 등록을 완료합니다.
2. AWS 콘솔에서 CloudFront **정액 Free 플랜**의 가입 가능 여부를 확인합니다.
   종량제 또는 유료 플랜으로 임의 전환하지 않습니다. Free 플랜도 S3 요청 등 별도
   청구 항목이 있을 수 있으므로 현재 요금 화면을 확인합니다.
3. 서울 리전에 S3 Standard 버킷을 만듭니다. Block Public Access를 모두 켜고
   기본 SSE-S3 암호화를 사용합니다. 불필요한 버전 관리는 켜지 않습니다.
4. `infra/aws/s3-cors.json`을 버킷의 CORS 설정에 적용합니다.
5. S3를 원본으로 사용하는 CloudFront 배포를 만들고 OAC를 연결합니다.
   S3 버킷 정책은 이 CloudFront 배포 ARN의 `s3:GetObject`만 허용합니다.
6. CloudFront 공개키·신뢰할 키 그룹을 등록하고 이미지 GET/HEAD 경로에
   서명 URL 필수 옵션을 켭니다. 개인키는 로컬 비공개 파일 및 Supabase Secrets에만 보관합니다.
7. GET/HEAD/OPTIONS를 허용합니다. 관리형 CORS 응답 정책을 선택합니다.
   `infra/aws/viewer-response.js`를 CloudFront Function으로 게시한 뒤 viewer-response에 연결합니다.
   원본의 캐시 헤더는 CDN 캐시에 사용하고 최종 브라우저 응답은 `no-store`로 보냅니다.
8. `infra/aws/iam-media-policy.json`의 버킷 이름을 바꾸어 업로드·삭제 전용 권한을 준비합니다.
   전체 AWS 관리자 키를 사용하지 않습니다. 서버용 키는 Supabase Secrets에만 저장합니다.
9. 사용량·비용 알림을 설정합니다. 파일 요청 비용, 저장 용량, CDN 전송량을 각각 확인합니다.

## 서버와 Pages 연결

1. `supabase/migrations/20261006000000_atomic_media_edit.sql`을 적용합니다.
2. `infra/aws/secrets.env.example`의 이름대로 값을 Supabase Secrets에 등록합니다.
3. 함수 `media-admin`, `media-redirect`, `public-distribution`을 배포합니다.
   `supabase/config.toml`의 설정대로 gateway JWT 검사를 끄되, `media-admin`은
   함수 내부에서 로그인 JWT와 관리자 프로필을 검사합니다.
4. 로컬 테스트에서만 `VITE_MEDIA_BACKEND=aws`로 실행합니다.
5. 한 장 추가·교체, 본문만 수정, 영상 업로드, 페이지 복사·다운로드,
   기존 확장 2.2.2로 각 SNS에 원본 전달, 모바일, CORS, 만료 URL을 검증합니다.
6. GitHub 저장소 Actions variable `VITE_MEDIA_BACKEND=aws`를 설정하고 Pages를 배포합니다.
   설정이 없으면 항상 `supabase`로 동작합니다.

## 현재 배포와 파일 이전

기존 자료는 먼저 그대로 둡니다. 새 업로드만 AWS로 저장하도록 전환하고 사용량 추이를 확인합니다.
기존 파일을 이전할 때에는 DB에 참조되는 원본·썸네일만 나열하고 동일한 S3 key로 복사합니다.
원본 체크섬과 크기를 검증한 뒤 하나의 DB 트랜잭션으로 `s3:` 경로를 바꿉니다.
이후 기자 페이지와 기존 확장에서 확인하고, 이전 Supabase 원본 정리는 별도로 진행합니다.
원본을 복사하는 작업 자체도 Supabase egress를 사용하므로 이미 만료된 배포를 옮기지 않습니다.

## 수정·삭제·실패 보호

- 수정 화면은 썸네일과 파일 메타데이터만 요청합니다. 기존 원본·영상은 내려받지 않습니다.
- 새로 추가·교체한 파일만 업로드하고 기존 파일은 ID와 경로를 그대로 유지합니다.
- `save_distribution`은 DB 저장 전체를 트랜잭션으로 처리합니다.
- 배포의 `updated_at`이 달라졌으면 덮어쓰기를 거부합니다.
- 저장 실패 시 새 업로드만 정리하며 실제 DB에 참조되는 파일은 삭제하지 않습니다.
- 삭제·교체로 필요 없어지는 파일은 DB 저장 성공 후 정리합니다.
- 파일 경로는 재사용하지 않아 수정 전 이미지 캐시와 섞이지 않습니다.
- Supabase에서 CloudFront로 발급한 URL은 최대 15분 유효합니다. 이미 발급된 URL은
  배포 삭제 후에도 만료 전까지 캐시에서 열릴 수 있습니다. 즉시 차단이 필요한 자료는
  CloudFront invalidation을 함께 수행합니다.
- 저장되지 않은 업로드의 정기 청소는 DB 참조를 대조한 목록을 검토한 뒤 진행합니다.
  보관 중인 세 배포를 일괄 삭제하는 S3 수명주기 규칙은 설정하지 않습니다.

## 롤백

신규 업로드 문제 발생 시 Actions variable을 `supabase`로 돌리고 Pages를 재배포합니다.
이 설정은 신규 업로드만 바꿉니다. 이미 AWS에 있는 파일은 AWS 함수를 유지해야 읽을 수 있습니다.
기존 확장 업데이트나 데이터 재업로드를 사용자에게 요구하지 않습니다.
