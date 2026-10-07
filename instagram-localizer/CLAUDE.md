# 인스타그램 게시물 자동생성 작업 규칙

- 이 폴더가 앱 루트입니다. README.md, SETUP_WINDOWS.md, HANDOFF.md를 먼저 읽습니다.
- 사용자는 코딩 초보자입니다. 쉬운 한국어로 행동을 하나씩 설명합니다.
- 기능 추가·수정 시 src/version.ts의 APP_VERSION과 CHANGELOG, package.json·package-lock.json 버전, README 제목, PR 제목을 함께 올립니다(0.1 단위).
- 사용자가 "합쳐줘"라고 하면 PR을 merge합니다.
- 실제 비밀번호·API 키·로그인 토큰을 소스·문서·예시에 기록하지 않습니다.
- 파일 추가·삭제 후 PROJECT_FILES.json과 PROJECT_MANIFEST.md를 함께 갱신합니다.
- npm run verify와 이관 스크립트 관련 검사를 수행합니다. CI 또는 실제 실행 결과를 확인한 범위만 보고합니다.
- 회원 DB 설치 SQL은 빈 새 프로젝트에만 실행합니다. 기존 서비스의 DB를 초기화하지 않습니다.
