# 안드로이드 앱 v2.12

[v2.12 APK 다운로드](https://github.com/laterior2024/youtube-finder/raw/refs/heads/main/android-downloads/instagram-localizer-v2.12.apk)

[PC·모바일 웹 열기](https://youtube-finder-dg2x.vercel.app/)

## 업데이트 설치

1. 휴대폰에서 위 APK를 다운로드합니다.
2. 기존 앱을 삭제하지 말고 받은 APK를 열어 업데이트합니다.
3. 앱을 열고 새로고침한 뒤 상단 v2.12를 확인합니다.

기존 앱과 앱 ID·서명이 같습니다. 앱 삭제나 데이터 초기화는 저장된 자료를 지울 수 있으므로 하지 마세요.

## 새 기능

- 원본 입력 → 인스타 링크 사진 가져오기 방식 → 전체 또는 선택. 선택 모드에서는 미리보기를 체크한 뒤 적용하며 취소하면 기존 입력을 유지합니다.
- 결과 사진 클릭 또는 크게보기 → 최대 3배 확대·이전/다음 사진.
- 설정 → Gemini API 키 5개 펼치기 → 키 입력 → 연결 상태 색 확인 → 이 키 사용 → 저장.
- 초록은 Google 연결 가능, 빨강은 확인 실패, 노랑은 확인 중입니다. 연결 성공은 생성 모델 권한·남은 한도 보증이 아닙니다.
- Gemini·Apify·앱 일일 한도 안내를 구분합니다. 키를 5개 등록해도 같은 프로젝트는 한도를 공유합니다. [사용 한도 안내](../instagram-localizer/USAGE_LIMITS.md).
- 기존 캡컷 다운로드·사진 일괄 저장·다운로드/공유 분리·회원 승인을 유지합니다.

Android 8 이상, 인터넷과 최신 Android System WebView가 필요합니다. PNG는 사진첩, ZIP은 시스템 파일 선택기에 저장합니다. 회원별 키·편집 자료는 PC와 자동 동기화되지 않습니다.

## 파일 확인

- APK: 126,258바이트 (약 126KB)
- 앱 ID: `com.laterior.instagramlocalizer`
- 버전: 2.12.0 / versionCode 32
- SHA-256: `c6ff7ad564a1e852056f648b1dcb7f861476b7fb3deee53fbe20b0bf425337e3`
- 기존 v2.11과 공개 서명 인증서 SHA-256 일치 확인.

웹 자동 검사 35개·타입/빌드·선택/키 상태/확대 화면 검사를 통과했습니다. Android release 빌드·단위 검사·lint·서명 검증을 통과했습니다. 새 네이티브 코드는 없으며 버전 정보만 갱신했습니다. 실제 사용자 휴대폰 및 개인 계정의 유료 Google·Apify 호출은 사용자 확인 대상입니다. CI 결과는 PR Checks를 확인하세요.

서명 키·비밀번호는 포함하지 않습니다. [개발/복구 안내](../instagram-localizer/ANDROID.md).
