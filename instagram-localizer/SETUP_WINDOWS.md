# 새 Windows PC 설치 안내 (v2.7)

이 앱은 브라우저에서 사용하는 프로그램입니다. 설치 스크립트는 개발용 라이브러리를 준비하고, 실행 스크립트는 내 PC에서 개발 서버와 이미지 중계를 실행합니다. 기존 회원 DB·메일·배포는 기존 클라우드 서비스를 그대로 연결합니다.

## 1. 옮기기 전에 백업

- 기존 PC에서 필요한 모든 결과를 ZIP으로 내려받고 원본 이미지·영상·음원은 따로 보관합니다.
- 브라우저의 자동 저장 자료는 GitHub 소스나 이관 ZIP에 포함되지 않습니다.
- 결과 ZIP은 이미지·문구 등 완성본입니다. 글자 위치·편집 이력 전체를 다시 불러오는 프로젝트 백업 기능은 아직 없습니다.
- [MEDIA_ASSETS.md](MEDIA_ASSETS.md)에 큰 파일과 별도 보관할 자료의 범위를 적었습니다.
- 비밀번호와 키는 파일에 적어 옮기지 말고 해당 서비스의 정상 로그인·키 관리 화면을 이용합니다.

## 2. Node.js 설치

[Node.js 공식 다운로드](https://nodejs.org/en/download)에서 **24 LTS / Windows / 본인 PC의 아키텍처**를 설치합니다. npm을 포함한 기본 설치를 사용하고 PowerShell을 새로 엽니다. 32비트 Windows는 이 패키지의 검증 대상이 아닙니다.

```powershell
node --version
npm.cmd --version
```

첫 줄이 v24로 시작해야 합니다. 스크립트는 Node 설치 여부를 확인하고 맞지 않으면 멈춥니다. Node 자체 설치·서비스 로그인·키 입력은 사용자가 직접 하고, 의존성 설치·검사·빌드는 자동화했습니다. 일반 실행에 관리자 권한은 필요 없습니다.

## 3. 프로젝트 압축 풀기

GitHub Actions의 **instagram-localizer-v2.7-windows-package** 아티팩트를 내려받아 원하는 **로컬 쓰기 가능한 폴더**에 압축을 풉니다. 압축파일 내부에서 바로 실행하지 않습니다.

setup.ps1과 start.ps1이 있는 **instagram-localizer** 폴더를 엽니다. 폴더 이름에 공백이나 한글이 있어도 됩니다. 새 PC의 사용자명이나 드라이브를 코드에 입력할 필요는 없습니다.

Git으로 개발하려면 대신 다음 방법을 사용합니다.

```powershell
git clone https://github.com/laterior2024/youtube-finder.git
cd youtube-finder/instagram-localizer
```

이관 아티팩트는 앱 소스와 복구 파일만 담습니다. 같은 저장소의 다른 앱은 포함하지 않습니다. 아티팩트가 만료되면 최신 소스를 clone하고 동일 스크립트를 실행하거나 `npm run package`로 패키지를 다시 만들 수 있습니다.

## 4. 설치 자동화 실행

해당 폴더의 빈 곳에서 PowerShell을 열고 실행합니다.

```powershell
.\setup.ps1
```

자동 수행 내용:

1. Node 24와 npm 확인.
2. 배포 ZIP에 체크섬이 있으면 파일 누락·변조 확인. Git 소스에는 체크섬 파일이 없어 이 단계만 안내 후 통과.
3. .env.example에서 .env.local 최초 생성. 기존 .env.local은 유지.
4. npm ci로 package-lock.json에 맞는 라이브러리 설치.
5. 보안·경로 검사, 자동 테스트, TypeScript 검사, 빌드.

**SETUP COMPLETE**가 나오면 완료입니다. 실패하면 종료 코드 1로 멈춥니다. 오류를 무시한 채 실행하지 말고 오류 메시지를 확인하세요. 스크립트는 실제 키 값을 출력하지 않습니다.

Windows가 다운로드한 스크립트를 차단하면 먼저 파일 내용을 확인합니다. 신뢰하는 이 패키지의 아래 세 파일만 차단 해제할 수 있습니다.

```powershell
Unblock-File -LiteralPath .\setup.ps1, .\start.ps1, .\scripts\windows-common.ps1
```

개인 PC에서 실행 정책이 Restricted인 경우 현재 실행에만 RemoteSigned를 적용하는 방법입니다. 시스템 전체 정책은 바꾸지 않습니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\setup.ps1
```

회사·학교의 조직 정책은 이 명령으로 우회하지 않습니다. 관리자의 허용을 받으세요. [Microsoft 실행 정책 안내](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies)

## 5. 서비스 설정 직접 입력

생성된 **.env.local**을 편집기로 엽니다. 기존 Supabase 프로젝트에서 아래 공개 설정 두 개를 복사해 넣고 저장합니다.

- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

실제 값을 문서·GitHub·채팅에 붙이지 않습니다. 공개용 Publishable key만 사용하며 secret·service_role 키는 사용하지 않습니다. SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY는 선택 사항이고 비워두면 앞의 값으로 대체됩니다.

기존 Supabase의 Site URL은 운영 주소를 유지합니다. Redirect URLs에는 http://127.0.0.1:5173을 허용합니다. **기존 회원 DB에 초기 설치 SQL을 다시 실행하지 않습니다.** Gmail SMTP·Vercel 연결도 기존 서비스를 유지하면 다시 설정할 필요가 없습니다.

Gemini·Apify 키는 .env에 넣지 않고 로그인 후 앱의 ⚙️ 설정에서 직접 입력합니다. PC에 저장한 키가 다른 PC로 자동 복사되지 않습니다.

## 6. 프로그램 실행

```powershell
.\start.ps1
```

설정값의 존재·형식을 확인하고 http://127.0.0.1:5173을 브라우저에서 엽니다. 로그인 성공이나 실제 API 권한까지 사전에 보증하는 검사는 아닙니다.

- 종료: 서버가 실행 중인 PowerShell에서 Ctrl+C.
- 다음에 실행: start.ps1만 실행. 의존성을 바꾼 경우 설치·검사를 다시 수행.
- 브라우저 자동 열기 제외: `./start.ps1 -NoBrowser`
- 포트가 사용 중일 때: `./start.ps1 -Port 5174`. Supabase Redirect URLs에도 새 주소 추가.
- 실행 정책 때문에 차단되면 설치 때와 같이 이 실행에만 RemoteSigned 옵션을 사용합니다.
- 프로그램은 자기 PC에서만 접속하도록 실행하며 방화벽·인증·보안 정책을 자동 변경하지 않습니다.

## 7. 복구 확인

1. 기존 계정으로 로그인하고 승인 상태와 관리자 화면을 확인합니다.
2. 키 없이 직접 편집으로 임시 게시물을 만들고 PNG·ZIP을 받습니다.
3. 본인의 AI 키를 직접 넣고 키 연결 확인을 합니다. 필요할 때만 유료 생성 테스트를 합니다.
4. 기존 PC의 완성 자료가 필요하면 별도 백업에서 원본을 다시 올립니다.
5. 일반 회원 가입 인증 메일과 실제 휴대폰 문제는 HANDOFF의 미확인 목록에 따라 확인합니다.

## 8. 문제 해결

| 증상 | 조치 |
| --- | --- |
| node 또는 npm을 찾지 못함 | Node 24를 npm 포함 설치하고 PowerShell 재시작 |
| npm ci 실패 | 네트워크·디스크 여유·보안 프로그램 메시지 확인. package-lock.json 유지 |
| 기존 설정 파일이 있음 | 스크립트는 덮어쓰지 않음. .env.local을 직접 확인 |
| 체크섬 실패 | 배포 원본을 다시 받아 별도 폴더에 압축 해제. 개발 중 수정한 소스는 Git 기록·테스트로 검증 |
| 화면은 열리나 로그인 안 됨 | 같은 Supabase 프로젝트의 공개 값과 Redirect URLs 확인 |
| 휴대폰 키 오류 | 해당 기기에서 키 직접 입력, 오류 문구별 권한·한도 확인 |
| 기존 편집물이 안 보임 | 다른 기기·브라우저·주소에는 IndexedDB 자료가 자동 이전되지 않음 |

이관 패키지는 소스·실행환경을 복구합니다. 서비스 계정 접근권한, 인터넷 연결, 개인 API 키, 브라우저 작업자료가 있어야 사용자가 하던 모든 외부 작업까지 이어갈 수 있습니다.
