# 작업 인계서 — 인스타그램 게시물 자동생성

기준일: **2026-10-08 (Asia/Seoul)**  
이관 준비 버전: **v2.6 / package 2.6.0**  
개발 대상: **instagram-localizer/**  
설치 절차: [README.md](README.md)

## 1. 다음 담당자가 먼저 알아야 할 것

사용자는 코딩 초보자이며 쉬운 한국어 안내를 원합니다. 목적은 해외 게시물을 분석·현지화하여 인스타그램용 이미지와 설명글을 만드는 회원제 앱입니다. 각 회원이 본인의 AI 키를 사용하며, 이메일 인증과 관리자 승인 후 접근합니다.

운영을 위해 기존 GitHub·Vercel·Supabase를 계속 사용합니다. 컴퓨터 변경은 서버나 회원 DB의 신규 설치를 뜻하지 않습니다. 실제 비밀번호·API 키·관리자 이메일은 이 문서에 넣지 않습니다. 현재 관리자는 Supabase members의 role 또는 앱의 회원 관리 화면에서 확인합니다.

저장소 상위 [CLAUDE.md](../CLAUDE.md)의 규칙을 확인합니다. 기능을 바꾸면 앱 버전을 0.1 올리고 src/version.ts·package.json·package-lock.json·README 제목·PR 제목을 함께 맞춥니다. 다른 앱의 코드에는 영향을 주지 않습니다.

## 2. 완료된 작업

| 구분 | 완료 내용 / 근거 |
| --- | --- |
| v2.4 회원제 | Supabase 회원가입·인증·로그인·비밀번호 재설정·승인 대기, 관리자 화면, 회원별 저장 분리 |
| 관리자·DB | RLS, 검증된 최초 관리자 등록, 승인·정지·거절·일일 한도·공지·점검·관리 기록. 기존 운영 DB 적용 완료 |
| 사용 편의 | 키 없는 직접 편집, PNG·ZIP, 실패 상태 구분, 성공한 결과를 보존하는 재시도, 영상 설명·자막 내보내기 |
| 경량화·보호 | 큰 사진 축소, 동일 사진 중복 저장 감소, AI SDK·ZIP·관리자 지연 로딩, 이미지 중계 주소·크기·시간 제한 |
| v2.5 모바일 | 키 누락 시 AI 실행 전 설정 안내, 모바일 붙여넣기 공백 정리, 기기 보관 선택, 연결 확인, 키·권한·한도 오류 구분 |
| 운영 배포 | [PR 16](https://github.com/laterior2024/youtube-finder/pull/16) v2.4와 [PR 17](https://github.com/laterior2024/youtube-finder/pull/17) v2.5 병합·배포 확인 |
| 이전 검증 | 2026-10-07 자동 검사 15개·빌드 통과. 320·360·390픽셀 화면, 운영 v2.5 표시·작업 복원·설명글 다시 쓰기의 키 누락 안내 확인 |
| 메일 설정 | 사용자가 Gmail 앱 비밀번호를 Supabase Custom SMTP에 직접 입력·저장했다고 확인함. 외부 일반 회원 실제 수신 완료는 아직 미확인 |
| v2.6 이관 준비 | README/HANDOFF, 비밀값 없는 .env.example, 환경 파일 제외 강화, Node 24 명시, 설정 파일 최초 복사, Vite 경로 기준 고정, 운영체제별 CI 추가 |

v2.5 배포 기준 커밋은 `62327dda1f29dd5cb7df43ccfa2346cd7246823d`입니다. 최신 이관 변경은 GitHub main의 이 문서와 커밋 기록을 기준으로 합니다. 위의 15개 통과는 **이전 실행 기록**이며 현재 커밋 검증은 Actions 결과를 확인합니다.

## 3. 미완료·미확인·범위 밖

| 상태 | 항목 | 다음 확인 방법 |
| --- | --- | --- |
| 미확인 | 사용자가 겪은 실제 휴대폰 API 오류의 정확한 문구·브라우저 | iPhone Safari / Android Chrome에서 기종·OS·브라우저·오류 문구를 기록. 키 자체는 기록 금지 |
| 미확인 | Gmail SMTP의 외부 일반 회원 가입 메일 도착 | 사용자 동의를 받은 별도 시험 이메일로 가입→수신→인증→승인 대기→관리자 승인→접속 확인 |
| 미확인 | 실제 Google 계정별 모델 권한·요금제·이미지 생성 | 해당 회원이 직접 키를 입력해 소량 확인. 키 연결 확인 성공만으로 생성 성공을 단정하지 않음 |
| 후속 개선 | 편집 프로젝트 전체 백업·가져오기 및 기기 간 동기화 | 현재 IndexedDB만 사용. PNG/ZIP은 편집 상태 복구 파일이 아님. 구현 범위·저장 비용을 먼저 정할 것 |
| 운영 확인 | 메일 발송량·실패, 서비스 사용량·비용 | Supabase·Gmail·Google·Apify 대시보드에서 확인. 무료 운영이 무제한이라는 보장은 없음 |
| 현재 범위 밖 | 인스타그램 자동 게시·DM 자동 발송·완성 영상 렌더링 | 아직 구현되지 않음. 영상은 분석·자막·장면 설명까지 지원 |

PC의 성공과 모바일 반응형 화면 검사를 실제 iOS/Android 실기기 성공으로 기록하지 마세요.

## 4. 서비스와 계정 연결 지도

| 서비스 | 기존 대상 / 역할 | 자격 증명 입력 위치 |
| --- | --- | --- |
| GitHub | laterior2024/youtube-finder. 소스·변경 기록 | 새 컴퓨터에서 정상 GitHub 로그인. 토큰을 코드에 저장하지 않음 |
| Vercel | 팀 laterior2024s-projects / 프로젝트 youtube-finder-dg2x / main 배포 | 기존 계정 로그인, Project Settings의 환경변수 |
| Supabase | 기존 프로젝트의 Auth·PostgreSQL·RLS·RPC | 앱은 공개 URL·Publishable key만 .env.local에 입력 |
| Google Gemini / AI Studio | 분석·번역·설명글·이미지·영상 분석 | 회원별 앱 ⚙️ 설정의 Gemini API 키 |
| Apify | 선택 사항. Instagram 원본 링크에서 자료 수집 | 회원별 앱 ⚙️ 설정의 Apify 토큰 |
| Gmail SMTP | Supabase 인증 메일 발송 | Supabase SMTP 설정. 앱 비밀번호는 여기만 입력 |
| Google Fonts / jsDelivr | 글꼴 다운로드 | 키 없음. 렌더링 시 네트워크·폰트 로딩 필요 |
| npm registry | 잠금 파일의 개발 라이브러리 설치 | 일반 공개 패키지 설치에 토큰 불필요 |

기존 관리 화면 바로가기:

- [Vercel 프로젝트](https://vercel.com/laterior2024s-projects/youtube-finder-dg2x)
- [Supabase 기존 프로젝트](https://supabase.com/dashboard/project/prexvsvjzxadpahacvxa)
- [Supabase SMTP](https://supabase.com/dashboard/project/prexvsvjzxadpahacvxa/auth/smtp)
- [Google AI Studio 키 화면](https://aistudio.google.com/apikey)
- [Apify 토큰 화면](https://console.apify.com/settings/integrations)

이 링크의 프로젝트 식별자는 비밀번호가 아닙니다. 접근 권한은 해당 서비스 계정에 따라 확인됩니다. 메일 발신 계정·관리자 이메일·실제 키 값은 대시보드에서 확인하고 문서에 복사하지 않습니다.

## 5. 중요한 설정

### 실행·배포

- Node: 24 계열. .nvmrc / .node-version / package.json engines에 기록.
- 앱 폴더: instagram-localizer. 개발 URL: http://127.0.0.1:5173.
- Vercel: Root Directory instagram-localizer, Vite, npm ci, npm run build, dist, Node 24.x.
- Production과 Preview: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY. 서버 별칭은 선택이며 프런트와 같은 프로젝트를 가리켜야 함.
- Supabase Site URL: https://youtube-finder-dg2x.vercel.app/.
- Redirect URLs: 개발·미리보기에서 실제 사용하는 정확한 주소를 허용. 운영 Site URL을 개발 주소로 덮어쓰지 않음.
- Gmail 소규모 운영의 기존 설정 방향: smtp.gmail.com / 465 / 발신 계정과 앱 비밀번호. 실제 저장값은 Supabase에서 확인. 이관만 할 때는 다시 설정할 필요 없음.
- 회원 기본 일일 한도: SQL 기본값 100. 한국 날짜(Asia/Seoul), 호출 시도 기준. 계정별 현재 값은 DB가 기준.
- 앱 한도는 외부 서비스의 결제 상한이 아님. Gemini·Apify는 회원 브라우저가 직접 해당 서비스에 요청함.

### 코드의 기본 AI 설정

현재 코드값이며 제공자의 계속된 지원·접근 권한을 보장하지 않습니다.

| 항목 | 기본값 / 선택값 |
| --- | --- |
| 텍스트 기본 | gemini-flash-latest |
| 텍스트 선택 | gemini-pro-latest, gemini-2.5-flash |
| 이미지 기본 | gemini-3.1-flash-image |
| 이미지 선택 | gemini-3-pro-image, gemini-2.5-flash-image |
| Apify 기본 액터 | apify~instagram-scraper |
| 시작 나라 | 한국 |
| 게시물 / 나라 | 최대 게시물 5개 / 지원 나라 10개 |
| 사진 | 장당 최대 20MB, 긴 변 1536px 이하 WebP로 축소 |
| 영상 | 입력 최대 100MB. 큰 영상은 Gemini 파일 API를 거쳐 분석 |
| 중계 보호 | HTTPS Instagram/Facebook CDN 허용 목록, 4MB 응답 제한, 10초 제한 |

모델 선택지는 src/lib/gemini.ts, 기본값은 src/lib/storage.ts, 파일 제한은 src/lib/files.ts와 입력 화면, 중계 제한은 server/imageProxy.ts에서 확인합니다.

## 6. 라이브러리

아래는 이관 기준 package-lock.json의 실제 해석 버전입니다. 범위만 적힌 package.json보다 **package-lock.json + npm ci**를 복구 기준으로 사용합니다.

| 라이브러리 | 잠금 버전 | 역할 |
| --- | --- | --- |
| react / react-dom | 19.3.0 | 화면 |
| @google/genai | 2.24.0 | Gemini SDK, 지연 로딩 |
| @supabase/supabase-js | 2.117.2 | 인증·DB RPC |
| jszip | 3.10.2 | 결과 ZIP, 지연 로딩 |
| vite | 8.3.1 | 개발 서버·빌드 |
| typescript | 7.0.2 | 타입 검사 |
| tailwindcss / @tailwindcss/vite | 4.3.3 | 스타일 |
| @vitejs/plugin-react | package-lock.json 참조 | React 빌드 |
| tsx | 4.23.15 | TypeScript 테스트 실행 |
| @electric-sql/pglite | 0.3.16 | 테스트용 PostgreSQL 호환 DB |
| fake-indexeddb | 6.2.5 | 브라우저 저장소 테스트 |
| @types/node / @types/react / @types/react-dom | package-lock.json 참조 | 개발용 타입 |

운영에 로컬 DB 서버는 필요하지 않습니다. Vite·TypeScript 등의 네이티브 모듈은 운영체제별로 다르므로 이전 PC의 node_modules를 복사하지 않습니다.

## 7. 코드 읽는 순서와 데이터 흐름

1. src/main.tsx → components/AccountGate.tsx: Supabase 로그인·승인·관리자 화면 진입.
2. src/lib/auth.ts → supabase/migrations/: get_access, reserve_request, RLS와 관리자 RPC.
3. src/App.tsx: 게시물 입력→분석→나라별 문구→이미지 생성→편집→내보내기.
4. components/InputScreen.tsx, CountryWorkspace.tsx, SlideEditor.tsx, SlideCanvas.tsx: 편집 화면.
5. src/lib/gemini.ts, credentials.ts, apify.ts: 외부 AI·가져오기와 오류 처리.
6. src/lib/persist.ts, storage.ts: 편집 자료·설정·키 저장. 사용자 분리 유지.
7. src/lib/render.ts, export.ts, files.ts: 이미지 압축·렌더링·ZIP.
8. api/image.ts → server/authorize.ts → server/imageProxy.ts: 승인·요청 한도 검사 후 이미지 중계.
9. tests/: 회원·저장·재시도·키·중계·내보내기 회귀 검사.

Supabase 테이블은 public.members, app_settings, daily_usage, admin_audit와 private.owner_bootstrap입니다. 초기 SQL의 예시 owner@example.com은 **새 프로젝트 설치용**입니다. 기존 프로젝트에 다시 실행하거나 기존 최초 관리자 값을 재설정하지 마세요.

회원 데이터는 Supabase에, 사진·편집 상태는 브라우저 IndexedDB에, 기본 키는 sessionStorage에, 사용자가 기억하기를 선택한 키는 localStorage에 보관합니다. 저장이 막힌 브라우저에서는 현재 화면 메모리로만 사용할 수 있습니다. 브라우저 저장소의 이름은 회원 ID별이며 설정 코드를 변경할 때 다른 회원에게 키가 섞이지 않도록 검사합니다.

## 8. 경로 의존성 점검과 변경

2026-10-08 GitHub v2.5 소스 47개 파일을 확인했습니다.

| 항목 | 결과 / 처리 |
| --- | --- |
| Windows 사용자·드라이브 절대경로, /Users, /home, 특정 임시 폴더 | 커밋된 앱 소스에서 발견하지 못함 |
| Vite의 process.cwd() 기준 .env 읽기 | 실행한 폴더에 따라 달라질 수 있어 vite.config.ts 자신의 위치(import.meta.url)로 변경. root·envDir도 같은 기준 |
| 설치·검사 명령 | 특정 컴퓨터의 내장 Node/npm 경로 대신 PATH의 node/npm과 npm scripts 사용 |
| 설정 파일 생성 | scripts/setup.mjs 자신의 위치 기준으로 .env.local 생성. 기존 파일은 배타적 복사로 보존 |
| 로그인 이메일 리디렉션 | window.location.origin 사용. 컴퓨터 경로가 아니라 Supabase 허용 주소 관리 필요 |
| /api/image | 사이트 기준 상대 URL 유지 |
| 개발 중계 내부 http://localhost | Request 객체를 만들기 위한 기준 URL이며 특정 PC의 원격 서버 주소가 아님. 네트워크 목적지는 요청의 검증된 이미지 URL |
| 테스트 SQL 파일 읽기 | import.meta.url 기준 상대 URL로 이미 구현됨 |
| 비밀 설정 제외 | .env와 .env.*를 제외하고 .env.example만 추적. .vercel·생성물도 제외 |

기존 작업 도구의 임시 폴더, 설치용 캐시, Codex에 내장된 Node 실행 파일은 복구 대상이 아닙니다. 이번 인계는 GitHub에 있는 소스·설정을 기준으로 하며 기존 컴퓨터의 미추적 파일이나 브라우저 개인 자료까지 백업한 것은 아닙니다.

## 9. 새 컴퓨터 이관 체크

1. 기존 컴퓨터에서 필요한 결과 ZIP과 원본 자료를 내려받습니다. 편집 상태 자체의 자동 이관은 지원되지 않습니다.
2. 기존 작업자가 올리지 않은 변경이 있다면 먼저 Git 상태를 확인하고 소스 변경만 커밋합니다. .env·키·개인 자료는 제외합니다.
3. 새 컴퓨터에서 Node 24·Git·편집기를 준비하고 README의 clone → setup → .env.local 직접 입력 → npm ci → npm run verify 순서를 따릅니다.
4. 기존 Supabase를 연결하고 기존 계정으로 로그인합니다. DB 설치 SQL 재실행 금지.
5. 관리자 화면과 키 없는 편집·다운로드를 확인합니다. 새 환경에서 키는 앱 설정에 직접 입력합니다.
6. 실제 휴대폰 오류와 외부 회원 메일 흐름을 우선 검증합니다.
7. 변경할 때 작업 브랜치→자동 검사·미리보기→병합·운영 확인 순서로 진행합니다. 사용자 지시와 CLAUDE.md를 따릅니다.
8. 수정 내역, 확인한 기기·브라우저, 아직 미확인인 항목을 이 문서에 갱신합니다.

## 10. 이번 이관 준비의 검증과 한계

이번 세션에서 기존 컴퓨터의 명령 실행 도구가 시작되지 않아 그 PC에서 새 npm 설치·검사를 실행하지 못했습니다. GitHub 소스 읽기와 정적 경로·환경변수 검토를 진행했으며, 새 CI는 Windows·macOS·Linux에서 npm ci → 자동 검사 → 빌드 → 기존 설정 파일 보존 → 저장소 루트에서의 빌드를 실행합니다. 실제 통과 여부는 해당 이관 PR의 Checks와 Actions 기록을 기준으로 합니다.

이관 자체는 유료 AI 호출, SMTP 비밀번호 복사, 운영 DB 초기화, 회원 권한 변경을 요구하지 않습니다. 서비스 계정 접근 권한과 공개 Supabase 설정값은 새 컴퓨터에서 직접 준비해야 합니다.
