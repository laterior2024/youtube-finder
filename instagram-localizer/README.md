# 인스타그램 게시물 자동생성 (v2.7)

해외 게시물의 사진·설명글을 분석하고 10개 나라용 게시물을 편집하는 웹 앱입니다. 회원가입 → 이메일 인증 → 관리자 승인 후 사용합니다. AI 없이 직접 편집하고 PNG·ZIP으로 내려받을 수도 있습니다.

- 운영 사이트: [youtube-finder-dg2x.vercel.app](https://youtube-finder-dg2x.vercel.app/)
- 개발 저장소: [laterior2024/youtube-finder](https://github.com/laterior2024/youtube-finder)
- **개발 대상 폴더는 `instagram-localizer/`입니다.** 저장소 최상위의 App.tsx와 shopping-shorts-finder는 다른 앱입니다.
- 완료 내역·남은 작업·설정·다음 순서: [HANDOFF.md](HANDOFF.md)
- 환경변수 이름: [.env.example](.env.example)

## Windows 최종 이관 패키지

새 Windows PC의 자세한 복구 절차는 **[SETUP_WINDOWS.md](SETUP_WINDOWS.md)**를 따라 진행하세요.

- Node.js 24 설치 → 압축 해제 → **setup.ps1** → .env.local의 Supabase 공개 설정 직접 입력 → **start.ps1**.
- 의존성 파일은 **package.json과 package-lock.json**입니다. Python 프로젝트가 아니므로 requirements.txt는 만들지 않습니다.
- [PROJECT_MANIFEST.md](PROJECT_MANIFEST.md): 필요한 전체 파일·폴더와 제외 항목.
- [MEDIA_ASSETS.md](MEDIA_ASSETS.md): 대용량 자료와 개인 작업자료 별도 보관 목록.
- [SECURITY_REVIEW.md](SECURITY_REVIEW.md): 보안·경로 점검 범위와 한계.
- 배포 패키지는 필수 소스만 포함합니다. 실제 키·로그인 상태·브라우저 편집 자료·node_modules는 포함하지 않습니다.
- 소스에서 `npm run package`로 release/에 이관 ZIP과 SHA-256 파일을 다시 만들 수 있습니다.
- 패키지의 PACKAGE_CHECKSUMS.json은 모든 필수 소스의 해시와 빌드 기준 커밋을 기록합니다. setup.ps1이 설치 전에 검사합니다. 개발 중 소스를 변경하면 원본 패키지와 달라지므로 Git 기록과 테스트로 검증하세요.
- GitHub Actions 아티팩트 보관 기간은 90일로 설정했습니다. 장기 보관하려면 완성된 ZIP을 직접 내려받아 보관합니다. 소스·패키지 생성기는 GitHub에 남습니다.

## 새 컴퓨터에서 시작하기

### 1. 필요한 프로그램

| 프로그램 | 용도 |
| --- | --- |
| [Node.js 24 LTS](https://nodejs.org/en/download) 및 함께 설치되는 npm | 실행·설치·검사·빌드. Node 24 계열을 사용합니다. |
| Git | 소스 내려받기·변경사항 저장. ZIP 다운로드만 할 경우 필수는 아닙니다. |
| 코드 편집기 | VS Code, Claude Code, Codex 등 원하는 편집기를 사용합니다. 특정 도구 전용 경로가 필요하지 않습니다. |
| 웹 브라우저 | Chrome·Edge·Safari 등. 실제 휴대폰 검사는 별도로 합니다. |

Docker, 로컬 PostgreSQL, Python, 전역 Vite·TypeScript, Supabase CLI, Vercel CLI는 기본 개발에 필요하지 않습니다. 테스트용 DB는 설치되는 PGlite가 메모리에서 실행합니다.

GitHub·Supabase·Vercel에 기존 프로젝트를 볼 수 있는 계정으로 로그인할 수 있어야 합니다. AI 기능을 시험하려면 본인의 Google AI Studio 키가, 링크 가져오기를 시험하려면 Apify 토큰이 추가로 필요합니다.

### 2. 소스 내려받기

원하는 작업 폴더에서 실행합니다. 폴더 위치·사용자 이름·드라이브 문자는 자유입니다.

```sh
git clone https://github.com/laterior2024/youtube-finder.git
cd youtube-finder/instagram-localizer
node --version
npm --version
npm run setup
```

GitHub의 **Code → Download ZIP**으로 받아도 됩니다. 압축을 푼 뒤 `instagram-localizer` 폴더에서 같은 명령을 실행하세요. ZIP에는 Git 기록이 없으므로 계속 개발할 때는 Git clone을 권장합니다.

`npm run setup`은 .env.example을 .env.local로 복사합니다. **이미 있는 .env.local은 덮어쓰지 않습니다.** 패키지를 설치하기 전에도 실행할 수 있습니다. Node 버전 관리자 사용자는 .nvmrc 또는 .node-version의 24를 적용하세요.

Windows PowerShell에서 npm.ps1 실행이 차단되면 아래 명령의 `npm`을 `npm.cmd`로 바꾸거나 명령 프롬프트에서 실행하세요.

### 3. 기존 서비스 연결하기

새 컴퓨터로 옮기는 경우 **기존 Supabase 프로젝트를 그대로 사용합니다. 회원 DB를 새로 만들거나 초기 SQL을 다시 실행하지 않습니다.**

Supabase 대시보드에서 기존 프로젝트의 **Project URL**과 **Publishable key**를 확인해 .env.local의 다음 두 항목만 채우세요. 값은 채팅·README·Git에 기록하지 않습니다.

| 이름 | 입력할 값 |
| --- | --- |
| VITE_SUPABASE_URL | 기존 Supabase 프로젝트 URL |
| VITE_SUPABASE_PUBLISHABLE_KEY | 같은 프로젝트의 공개용 Publishable key |
| SUPABASE_URL | 선택. 서버 별칭이 필요할 때만 위와 동일한 URL |
| SUPABASE_PUBLISHABLE_KEY | 선택. 서버 별칭이 필요할 때만 위와 동일한 공개 키 |

서버 별칭은 비워두면 VITE_ 값으로 대체됩니다. 프런트와 서버에 서로 다른 프로젝트를 지정하지 마세요. `service_role`·Supabase secret key·DB 비밀번호는 앱에 필요하지 않습니다. **VITE_로 시작하는 값은 브라우저에 포함되므로 비밀 키를 넣으면 안 됩니다.**

Gemini·Apify 키는 .env.local에서 읽지 않습니다. 앱에 로그인한 후 **⚙️ 설정**에서 회원 본인이 입력합니다. SMTP 비밀번호는 Supabase 대시보드에만 설정합니다. .env.example 하단에는 이 자격 증명의 이름과 입력 위치만 주석으로 적었습니다.

### 4. 설치·검사·실행

.env.local을 저장한 후 앱 폴더에서 실행합니다.

```sh
npm ci
npm run verify
npm run dev
```

브라우저에서 [http://127.0.0.1:5173](http://127.0.0.1:5173)을 엽니다. 종료는 터미널에서 Ctrl+C입니다.

- `npm ci`는 package-lock.json에 기록된 버전으로 설치합니다. 새 컴퓨터로 node_modules를 복사하거나 잠금 파일을 지우지 마세요. [npm 공식 안내](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
- Supabase **Authentication → URL Configuration → Redirect URLs**에 `http://127.0.0.1:5173`을 허용합니다. 운영 **Site URL은 기존 운영 주소를 유지**합니다.
- 이메일 인증·비밀번호 재설정은 요청했던 기기의 같은 브라우저에서 링크를 엽니다. 앱은 PKCE를 사용합니다. [Supabase 리디렉션 안내](https://supabase.com/docs/guides/auth/redirect-urls)
- 5173 포트가 사용 중이면 자동으로 다른 포트를 고르지 않고 종료합니다. 기존 개발 서버를 종료하거나 `npm run dev -- --port 5174`로 실행하고 새 주소도 Redirect URLs에 추가하세요.
- .env.local을 바꾸면 개발 서버를 재시작합니다.
- 기본 개발 서버는 자기 컴퓨터에서만 접속합니다. 휴대폰 기능 확인에는 운영 사이트나 승인된 미리보기 배포를 사용하세요.

### 5. 복구 확인

1. 기존 계정으로 로그인하고 승인 상태가 그대로인지 확인합니다.
2. 관리자 계정이면 **회원 관리** 화면을 확인합니다. 기존 계정을 다시 가입시키지 않습니다.
3. **직접 편집 시작**으로 임시 게시물을 만들고 문구를 바꿔 PNG·ZIP 다운로드를 확인합니다.
4. AI 키가 없을 때 AI 버튼이 결과를 지우지 않고 설정으로 안내하는지 확인합니다.
5. AI 시험이 필요하면 본인의 키를 직접 입력하고 **키 연결 확인** 후 소량으로 실행합니다. 연결 확인은 모델 목록 조회이며 생성 권한·잔여 한도까지 보증하지 않습니다.
6. 테스트용 자료만 사용하고, 기존 운영 회원의 승인·한도·공지 설정을 시험 목적으로 변경하지 않습니다. 운영 DB 연결 시 회원 관련 변경은 실제 서비스에 반영됩니다.

## 명령어

| 명령 | 역할 |
| --- | --- |
| npm run audit | 허용 목록 소스의 경로·보안정보 검사 |
| npm run package | 비밀값·개인 자료 제외 이관 ZIP 생성 |
| npm run verify:package | 이관 ZIP의 소스 체크섬 검사 |
| npm run setup | .env.local 최초 생성, 기존 파일 보존 |
| npm ci | 잠금 파일 기준으로 의존성 설치 |
| npm test | 외부 API 호출 없이 자동 검사 |
| npm run build | TypeScript 검사 후 dist 생성 |
| npm run verify | 자동 검사와 빌드 |
| npm run dev | 개발 화면과 /api/image 중계 실행 |
| npm run preview | 빌드된 화면 미리보기. /api/image 서버는 실행하지 않음 |

`npm run preview`만으로 Apify 사진 가져오기까지 검증하지 마세요. 전체 기능은 `npm run dev` 또는 Vercel 배포에서 확인합니다.

파일 단위 전체 목록은 [PROJECT_MANIFEST.md](PROJECT_MANIFEST.md)에 있습니다.

## 폴더 구조

```text
youtube-finder/
├─ CLAUDE.md                         작업 규칙
├─ .github/workflows/instagram-localizer.yml  운영체제별 검사
├─ instagram-localizer/              이 앱의 작업 폴더
│  ├─ README.md / HANDOFF.md          설치 안내 / 인계서
│  ├─ .env.example                   설정 이름만 기록
│  ├─ .env.local                     개인 설정, Git 제외
│  ├─ .nvmrc / .node-version         Node 24 지정
│  ├─ package.json / package-lock.json
│  ├─ scripts/setup.mjs              안전한 초기 설정 복사
│  ├─ index.html / vite.config.ts / tsconfig.json / vercel.json
│  ├─ src/
│  │  ├─ main.tsx                    앱 시작
│  │  ├─ App.tsx                     게시물 처리·편집·저장 흐름
│  │  ├─ types.ts / version.ts / index.css
│  │  ├─ components/                회원·관리자·입력·편집 화면
│  │  └─ lib/                       인증·Gemini·Apify·저장·렌더링·내보내기
│  ├─ api/image.ts                  Vercel 이미지 중계 진입점
│  ├─ server/                       회원 권한 확인·중계 보호
│  ├─ supabase/migrations/          새 DB용 초기 SQL
│  ├─ tests/                        회원 권한·저장·API 키·내보내기 검사
│  ├─ node_modules/                 npm ci로 생성, 이관 불필요
│  └─ dist/                         빌드 결과, 이관 불필요
└─ 기타 폴더                         다른 앱, 이 작업 범위 밖
```

## 사용 방법과 데이터 보관

- 회원가입 → 이메일 인증 → 관리자 승인 후 작업합니다. 관리자는 승인·정지·거절, 하루 요청 한도, 공지·점검 모드·관리 기록을 다룹니다.
- 사진·영상·설명글을 넣고 나라와 이미지 방식을 고른 뒤 생성합니다. 결과에서 글자·색·배경·설명글을 고쳐 PNG·ZIP으로 받습니다. AI 비용은 각 회원의 Google·Apify 계정에 따릅니다.
- 키 없이 직접 편집할 수 있지만 회원 로그인에는 Supabase 연결이 필요합니다.
- 사진·편집 상태는 **현재 기기·브라우저·사이트 주소·회원별 IndexedDB**에 저장됩니다. 같은 계정으로 다른 컴퓨터에 로그인해도 자동 복원되지 않습니다.
- Gemini·Apify 키는 기본적으로 현재 탭에 보관합니다. **이 기기에 키 기억하기**를 직접 선택하면 현재 브라우저에 보관하며, 로그아웃하면 기억한 키도 지웁니다. 관리자에게 키를 수집하지 않습니다.
- 이전 컴퓨터를 정리하기 전에 모든 게시물을 ZIP으로 받고 원본 자료도 별도로 보관하세요. **이 ZIP은 완성 결과물이며, 앱의 편집 상태를 그대로 재가져오는 백업은 아닙니다.** 편집 프로젝트 백업·가져오기는 아직 없습니다.
- v2.3의 옛 저장소는 회원별 저장소로 자동 이전하지 않습니다. 브라우저 저장 데이터를 지우거나 사이트 주소를 바꾸기 전 결과를 내려받으세요.

## 배포

기존 Vercel 프로젝트를 사용합니다. 이관만 한다면 새 Vercel/Supabase 프로젝트를 만들 필요가 없습니다.

| 항목 | 설정 |
| --- | --- |
| Vercel 프로젝트 | youtube-finder-dg2x |
| Git 저장소 / 운영 브랜치 | laterior2024/youtube-finder / main |
| Root Directory | instagram-localizer |
| Framework / Node | Vite / 24.x |
| Install / Build / Output | npm ci / npm run build / dist |
| 환경변수 | Production·Preview의 VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY |
| Supabase Site URL | https://youtube-finder-dg2x.vercel.app/ |

환경변수는 각 서비스 대시보드에 직접 입력합니다. VITE_ 값 변경은 재빌드·재배포가 필요합니다. 미리보기에서 인증 이메일을 쓸 때는 해당 미리보기 주소를 Supabase Redirect URLs에 추가합니다.

사진 중계를 위해 `api/`와 `server/`도 함께 배포해야 합니다. dist만 정적 호스팅하면 /api/image가 동작하지 않습니다. 서버 코드의 상대 import에 있는 `.js` 확장자는 Vercel ESM 실행에 필요하므로 제거하지 마세요.

## 새 Supabase 프로젝트를 별도로 만드는 경우만

컴퓨터 이관에는 이 과정이 필요하지 않습니다. 기존 회원 데이터도 자동으로 복제되지 않습니다.

1. `supabase/migrations/202610030001_members.sql`의 사본을 만듭니다.
2. 사본의 owner@example.com을 사용할 관리자 이메일(소문자)로 바꿉니다. 실제 주소가 들어간 사본은 커밋하지 않습니다.
3. **빈 새 프로젝트에서 한 번만** SQL을 실행합니다. 초기 SQL은 기존 테이블이 있는 DB에 재실행하는 용도가 아닙니다.
4. 이메일 인증, Site URL·Redirect URLs, Custom SMTP를 대시보드에서 설정합니다.
5. 관리자 이메일을 실제로 인증하고 로그인해야 최초 관리자 권한이 생깁니다.
6. 앱 환경변수 두 개를 새 프로젝트의 공개 값으로 바꿉니다. 서버 별칭을 쓰면 함께 바꿉니다.

## 검증 범위

회원 승인·권한 상승 차단·한국 날짜별 요청 한도·정지·점검·관리 기록, 회원별 로컬 저장, 실패 재시도, 이미지 중계 보호, 영상 자료 ZIP, 모바일 API 키 처리를 자동 검사합니다. 실제 회원 DB나 유료 AI API를 테스트에서 사용하지 않습니다.

GitHub Actions는 Node 24에서 Windows·macOS·Linux의 설치·자동 검사·빌드와 다른 폴더에서의 빌드를 확인하도록 구성했습니다. 이는 실제 휴대폰 Safari·Chrome 검사나 이메일 수신·AI 생성 성공을 대신하지 않습니다. 최신 실행 결과는 저장소 Actions에서 확인합니다.

## 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| package.json을 찾을 수 없음 | instagram-localizer 폴더인지 확인 |
| Node 버전·설치 오류 | Node 24 적용 후 npm ci. 잠금 파일 유지 |
| 회원 서비스 연결이 필요함 | .env.local의 공개 값 두 개 확인 후 재시작 |
| 이메일 링크가 다른 주소로 이동함 | 요청한 주소의 Redirect URLs 허용과 같은 브라우저 사용 |
| 회원이 승인 대기로 나옴 | 관리자의 승인 필요. 새 계정 생성으로 우회하지 않음 |
| 휴대폰의 API 키 오류 | 그 기기의 설정에 키 입력. PC 키는 자동 전송되지 않음 |
| Google 403 / 429 | 키의 모델·사이트 접근 제한 / 사용량·결제 상태를 각각 확인 |
| preview에서 사진 중계 실패 | npm run dev 또는 Vercel에서 확인 |
| 설치 중 저장 공간 부족 | 충분한 공간을 확보한 폴더에서 npm ci. 다른 컴퓨터의 node_modules는 복사하지 않음 |
