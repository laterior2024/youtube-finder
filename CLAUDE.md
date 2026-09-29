# 작업 규칙

## instagram-localizer (인스타그램 게시물 자동생성)

- 앱 이름: **인스타그램 게시물 자동생성**
- **업그레이드(기능 추가·수정)를 할 때마다 버전을 0.1씩 올린다.** 2.0에서 시작 → 2.1 → 2.2 …
  - `instagram-localizer/src/version.ts`의 `APP_VERSION`을 올리고, `CHANGELOG` 맨 위에 새 버전과 바뀐 점(쉬운 한국어)을 추가한다.
  - `instagram-localizer/package.json`의 `version`도 같이 맞춘다 (예: 2.1 → `2.1.0`).
  - `instagram-localizer/README.md` 제목의 `(v2.x)`도 같이 바꾼다.
  - PR 제목 앞에 버전을 붙인다. 예: `v2.1: …`
- 사용자는 코딩 초보자다. 설명은 초등학생도 이해할 수 있게 쉬운 한국어로, 해야 할 행동을 하나씩 안내한다.
- 사용자가 "합쳐줘"라고 하면 PR을 merge한다.

## shopping-shorts-finder (쇼핑쇼츠 파인더)

- 앱 이름: **쇼핑쇼츠 파인더**
- 버전 규칙은 위와 같다. 1.0에서 시작 → 1.1 → 1.2 …
  - `shopping-shorts-finder/src/version.ts`의 `APP_VERSION`과 `CHANGELOG`, `package.json`의 `version`, `README.md` 제목의 `(v1.x)`를 같이 올린다.
  - PR 제목 앞에 버전을 붙인다. 예: `쇼핑쇼츠 파인더 v1.1: …`
- 설명은 위와 똑같이 초등학생도 이해할 수 있는 쉬운 한국어로 한다.
