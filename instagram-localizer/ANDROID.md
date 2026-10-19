# 안드로이드 앱 (v2.9)

## 휴대폰 설치

1. 전달받은 `instagram-localizer-v2.9.apk`를 안드로이드 휴대폰에 내려받습니다.
2. 파일 앱에서 APK를 누르고, 요청되면 해당 파일 앱 또는 브라우저의 **이 출처 허용**을 켜서 설치합니다. 설치 후 이 허용을 다시 꺼도 됩니다.
3. **인스타 게시물 만들기**를 열고 기존 계정으로 로그인합니다. 신규 회원은 이메일 인증·관리자 승인이 필요합니다.
4. 설정에서 본인의 Gemini 키를 입력합니다. PC/Chrome에서 입력한 키가 앱으로 자동 복사되지는 않습니다. **이 기기에 키 기억하기**는 선택 사항입니다.
5. 사진·영상 선택은 휴대폰의 시스템 파일 선택기를 사용합니다. PNG는 사진첩의 InstagramLocalizer 앨범에 저장합니다. ZIP·SRT는 매번 휴대폰 파일 선택기에서 저장 폴더를 지정합니다. 완료 후 공유할 수 있습니다. 버튼은 저장 중 주황색, 완료 초록색, 실패 빨간색이며 취소는 별도로 표시합니다.

Android 8.0(API 26) 이상과 업데이트된 Android System WebView/Chrome이 필요합니다. 앱은 기존 HTTPS 운영 서비스를 사용하는 온라인 앱입니다. 회원가입·승인·관리자·AI·직접 편집·나라별 결과·이미지/영상 입력·자막/ZIP 내보내기를 같은 웹 코드로 제공합니다. 인터넷 없이 AI 또는 회원 기능을 사용할 수는 없습니다. 인스타그램 자동 게시·완성 영상 렌더링은 기존 앱에도 없던 기능입니다.

이메일 링크가 브라우저에서 열리면 **안드로이드 앱에서 계속**을 누릅니다. 앱에서 요청한 비밀번호 재설정은 해당 앱으로 돌아와 완료합니다. 앱을 삭제하거나 앱 데이터를 지우면 편집 자료와 PKCE 인증 요청 정보도 삭제됩니다.

## 데이터와 용량

- 편집 내용은 앱 전용 WebView의 회원별 IndexedDB에 보관합니다. 기존 Chrome·PC 자료와 자동 동기화하지 않습니다.
- 사진은 기존처럼 긴 변 1536px WebP로 축소합니다. 결과 저장은 48KiB씩 확인 응답을 받으며 전송하므로 ZIP 전체를 base64로 복제하지 않습니다. 한 파일 최대 256MiB, 큰 결과는 나라별로 나누어 저장합니다.
- Android 10 이상에서는 사진·저장소·카메라 권한을 요구하지 않습니다. Android 8·9는 사진첩에 쓰기 위한 저장 권한을 저장 시 요청하며, 거절하면 취소로 표시합니다. 사용자가 직접 고른 파일만 읽고 선택한 위치에 저장합니다.
- 비밀번호·회원 키를 APK에 내장하지 않습니다. Android 클라우드 백업·기기 이전 대상에서도 앱 내부 자료를 제외합니다. 완성 결과는 직접 저장해 백업하세요.
- 웹 기능은 운영 사이트 배포로 갱신됩니다. 네이티브 파일 처리 등 APK 변경은 같은 서명으로 새 APK를 설치해야 합니다.

## 개발 및 재빌드

웹: 기존 Node 24 + `npm ci`, `npm run verify`.
Android: JDK 17, Gradle 8.13, Android SDK Platform 36 및 Build Tools 35.0.0. Android Studio에서 `android/`를 열거나 설치된 Gradle을 사용합니다. `ANDROID_HOME` 또는 로컬에서만 사용하는 `android/local.properties`의 sdk.dir로 SDK 위치를 지정합니다. 개인 경로를 커밋하지 않습니다.

```sh
cd android
gradle :app:testDebugUnitTest :app:lintRelease :app:assembleRelease
```

CI `.github/workflows/instagram-android.yml`은 단위검사·Lint·release 빌드 후 Android 15(API 35) 에뮬레이터에서 실제 WebView의 origin 제한·로컬 저장·클립보드 응답·파일 저장·취소를 검증합니다. 실제 회원·AI 키를 사용하지 않습니다. Actions의 unsigned 아티팩트는 **직접 설치할 수 없으며 서명이 필요합니다.** 디버그 APK는 배포용 APK와 같은 서명으로 업데이트되지 않습니다.

## 서명과 다음 PC로 이관

앱 ID는 `com.laterior.instagramlocalizer`, versionCode는 29입니다. 배포용 비공개 서명 키는 소스 밖에 보관합니다. 다음 APK도 **동일한 키**를 사용하고 versionCode를 높여야 덮어쓰기 업데이트가 됩니다. 키가 달라서 앱을 삭제하면 내부 작업자료가 사라지므로 삭제를 업데이트 방법으로 안내하지 마세요.

서명에 필요한 설정 이름만 기록합니다: `ANDROID_KEYSTORE_PATH`, `ANDROID_KEY_ALIAS`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_PASSWORD`. 실제 값·keystore·비밀번호 파일은 Git/소스 ZIP/공개 CI에 올리지 않습니다. 비공개 키와 비밀번호는 소유자만 접근 가능한 별도 보관소에 백업해야 합니다. PC 변경 시 이 백업도 별도로 이관합니다.

```sh
java -jar apksigner.jar sign --ks "$ANDROID_KEYSTORE_PATH" --ks-key-alias "$ANDROID_KEY_ALIAS" --ks-pass env:ANDROID_STORE_PASSWORD --key-pass env:ANDROID_KEY_PASSWORD --out instagram-localizer-v2.9.apk app-release-unsigned.apk
java -jar apksigner.jar verify --verbose --print-certs instagram-localizer-v2.9.apk
```

`public/.well-known/assetlinks.json`에는 APK 서명 인증서의 **공개 SHA-256 지문만** 들어갑니다. 비공개 키가 아닙니다. 서명이 달라지면 App Links 지문도 달라집니다. 운영 도메인과 앱 패키지를 변경하려면 AppPolicy, Manifest, src/lib/android.ts, assetlinks를 함께 갱신하고 실제 이메일 복귀를 다시 시험하세요.

## 검증 한계와 남은 확인

자동 검사와 실제 기기 검사는 구분합니다. 에뮬레이터가 통과해도 사용자의 기종·설치 정책·Google 모델 권한·외부 메일 도착까지 보증하지 않습니다. 실제 휴대폰에서 로그인 → 수동 편집 → PNG/ZIP 저장 → 본인 키 연결 확인 → 소량 AI 생성 → 이메일 재설정을 확인해야 합니다. 특정 Google 키가 웹사이트 제한을 쓰면 운영 HTTPS 도메인을 허용해야 합니다. APK는 Android 네이티브 Google SDK 키를 쓰는 방식이 아닙니다.

공식 참고: [WebView origin 제한 메시지](https://developer.android.com/reference/androidx/webkit/WebViewCompat.WebMessageListener), [Android Gradle 플러그인 호환](https://developer.android.com/build/releases/agp-8-13-0-release-notes), [앱 서명](https://developer.android.com/studio/publish/app-signing).
