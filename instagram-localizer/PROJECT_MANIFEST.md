# 프로젝트 파일 목록 (v2.7)

패키지 대상은 instagram-localizer 앱입니다. **필수 소스 66개**를 PROJECT_FILES.json의 허용 목록으로 관리합니다. 앱 폴더 위치는 자유이며 모든 실행 스크립트는 자신의 위치를 기준으로 경로를 계산합니다.

## 필요한 폴더

- `api/`
- `scripts/`
- `server/`
- `src/`
- `src/components/`
- `src/lib/`
- `supabase/migrations/`
- `tests/`

## 필요한 파일 전체

| 상대경로 | 용도 |
| --- | --- |
| `.env.example` | 설정 이름만 있는 환경 예시 |
| `.gitignore` | 비밀·개인 자료·생성물 제외 |
| `.node-version` | Node 24 지정 |
| `.nvmrc` | Node 24 지정 |
| `CLAUDE.md` | 개발 작업 규칙 |
| `HANDOFF.md` | 완료·미확인·다음 작업 |
| `MEDIA_ASSETS.md` | 대용량·별도 백업 자료 |
| `PROJECT_FILES.json` | 패키지 허용 목록 |
| `PROJECT_MANIFEST.md` | 이 목록 |
| `README.md` | 프로젝트·사용·개발 안내 |
| `SECURITY_REVIEW.md` | 소스 점검 범위 |
| `SETUP_WINDOWS.md` | 새 Windows 복구 순서 |
| `api/image.ts` | 이미지 중계 진입점 |
| `index.html` | 빌드·실행 설정 |
| `package-lock.json` | 의존성 고정 잠금 파일 |
| `package.json` | 의존성·명령 정의 |
| `scripts/audit-source.mjs` | 설치·검사·패키지 도구 |
| `scripts/build-package.mjs` | 설치·검사·패키지 도구 |
| `scripts/check-env.mjs` | 설치·검사·패키지 도구 |
| `scripts/setup.mjs` | 설치·검사·패키지 도구 |
| `scripts/verify-package.mjs` | 설치·검사·패키지 도구 |
| `scripts/windows-common.ps1` | 설치·검사·패키지 도구 |
| `server/authorize.ts` | 서버 권한·중계 |
| `server/imageProxy.ts` | 서버 권한·중계 |
| `setup.ps1` | Windows 초기 설치·검사 |
| `src/App.tsx` | 앱 소스 |
| `src/components/AccountGate.tsx` | 화면 구성 |
| `src/components/AdminPanel.tsx` | 화면 구성 |
| `src/components/CountryWorkspace.tsx` | 화면 구성 |
| `src/components/ImageLightbox.tsx` | 화면 구성 |
| `src/components/InputScreen.tsx` | 화면 구성 |
| `src/components/OriginalityPanel.tsx` | 화면 구성 |
| `src/components/SettingsModal.tsx` | 화면 구성 |
| `src/components/SlideCanvas.tsx` | 화면 구성 |
| `src/components/SlideEditor.tsx` | 화면 구성 |
| `src/index.css` | 앱 소스 |
| `src/lib/apify.ts` | 앱 기능·저장·API |
| `src/lib/auth.ts` | 앱 기능·저장·API |
| `src/lib/countries.ts` | 앱 기능·저장·API |
| `src/lib/credentials.ts` | 앱 기능·저장·API |
| `src/lib/export.ts` | 앱 기능·저장·API |
| `src/lib/files.ts` | 앱 기능·저장·API |
| `src/lib/gemini.ts` | 앱 기능·저장·API |
| `src/lib/gradient.ts` | 앱 기능·저장·API |
| `src/lib/manual.ts` | 앱 기능·저장·API |
| `src/lib/persist.ts` | 앱 기능·저장·API |
| `src/lib/render.ts` | 앱 기능·저장·API |
| `src/lib/similarity.ts` | 앱 기능·저장·API |
| `src/lib/storage.ts` | 앱 기능·저장·API |
| `src/lib/theme.ts` | 앱 기능·저장·API |
| `src/main.tsx` | 앱 소스 |
| `src/types.ts` | 앱 소스 |
| `src/version.ts` | 앱 소스 |
| `start.ps1` | Windows 설정 확인·실행 |
| `supabase/migrations/202610030001_members.sql` | 빈 새 DB 전용 설치 SQL |
| `tests/credentials.test.ts` | 자동 검사 |
| `tests/distribution.mjs` | 자동 검사 |
| `tests/export.test.ts` | 자동 검사 |
| `tests/membership.test.ts` | 자동 검사 |
| `tests/package.test.ts` | 자동 검사 |
| `tests/persist.test.ts` | 자동 검사 |
| `tests/pipeline.test.ts` | 자동 검사 |
| `tests/proxy.test.ts` | 자동 검사 |
| `tsconfig.json` | 빌드·실행 설정 |
| `vercel.json` | 빌드·실행 설정 |
| `vite.config.ts` | 빌드·실행 설정 |

## 패키지 생성 시 추가되는 파일

- PACKAGE_CHECKSUMS.json: 위 66개 파일의 SHA-256, 앱 버전, 생성 기준 커밋. 원본 소스에는 없으며 패키지에 생성됩니다.
- release/instagram-localizer-v2.7.0-windows-source.zip 및 .sha256: npm run package 출력. ZIP 내부에는 release 폴더 자체를 다시 넣지 않습니다.
- GitHub 아티팩트 ZIP은 검증을 마친 소스 파일과 PACKAGE_CHECKSUMS.json을 담습니다. GitHub 아티팩트의 압축 방식은 로컬 생성 ZIP과 달라 외부 ZIP 해시가 같지 않을 수 있습니다. 내부 파일은 같은 체크섬으로 검증합니다.

## 필요한 환경별 파일·생성물 (패키지 제외)

| 항목 | 복구 방법 |
| --- | --- |
| .env.local | setup.ps1이 빈 예시로 생성. 공개 Supabase 설정을 사용자가 직접 입력 |
| node_modules/ | npm ci로 새 운영체제에 맞게 설치 |
| dist/ | npm run build |
| .git/ | Git clone한 경우에만 생성 |
| .vercel/ | 필요 시 기존 Vercel 프로젝트에 정상 로그인·연결 |
| local-media/ · backups/ | 사용자 원본·결과를 별도 저장장치에서 직접 복구 |
| 브라우저 IndexedDB·키·로그인 상태 | 소스 파일 아님. HANDOFF·MEDIA_ASSETS의 제한 확인 |

## 같은 GitHub 저장소의 패키지 범위 밖 파일

- 저장소 루트의 다른 YouTube 앱(App.tsx, components/, services/, utils/ 등).
- shopping-shorts-finder/ 앱 전체.
- 루트 CLAUDE.md: 전체 저장소 규칙. 패키지에는 이 앱용 CLAUDE.md를 포함.
- .github/workflows/instagram-localizer.yml: GitHub 자동 검증·패키지 생성 설정. Git clone에는 포함되며 로컬 실행 ZIP에는 필요하지 않음.

GitHub 기준 전체 91개 파일의 경로·보안정보·대용량 미디어를 점검했지만, **이 ZIP에는 해당 앱 실행에 필요한 위 허용 목록만** 포함합니다. 개인 자료는 포함하지 않습니다. 실제 비밀값을 새 소스 파일에 적지 마세요.

## 파일을 추가·삭제할 때

PROJECT_FILES.json과 이 목록을 함께 수정하고 npm run verify → npm run package → npm run test:distribution을 실행합니다. 허용 목록 밖의 파일은 자동으로 패키지에 포함되지 않습니다.
