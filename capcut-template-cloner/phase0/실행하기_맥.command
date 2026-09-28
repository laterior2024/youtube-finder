#!/bin/bash
# 틀복사 0단계: 캡컷 테스트 초안 만들기 (Mac)
cd "$(dirname "$0")" || exit 1
echo
echo "=============================================="
echo "  틀복사 0단계: 캡컷 테스트 초안 만들기"
echo "=============================================="
echo
echo "캡컷이 켜져 있으면 먼저 꺼 주세요. (Cmd+Q)"
echo

if ! command -v python3 > /dev/null 2>&1 || ! python3 --version > /dev/null 2>&1; then
  echo "[문제] Python이 설치되어 있지 않아요."
  echo " 1. https://www.python.org/downloads/ 에서 노란 Download 버튼을 눌러 설치해요."
  echo " 2. 설치가 끝나면 이 파일을 다시 실행하세요."
  exit 1
fi

echo "[1/2] 필요한 프로그램 설치 중... 1~2분 걸려요."
if ! python3 -m pip install --disable-pip-version-check -q --user -r requirements.txt; then
  echo
  echo "[문제] 설치에 실패했어요. 이 창의 글자를 스크린샷 찍어서 보내 주세요."
  exit 1
fi

echo "[2/2] 캡컷 테스트 초안 만드는 중..."
echo
if ! python3 make_test_drafts.py; then
  echo
  echo "캡컷 설정의 '초안 위치' 경로를 아래에 붙여넣고(Cmd+V) Enter를 누르세요."
  read -r -p "경로: " DRAFTS
  python3 make_test_drafts.py --drafts "$DRAFTS" || exit 1
fi

[ -d phase0_output ] && open phase0_output
echo
echo "끝났어요! 이제 캡컷을 켜서 '틀복사_'로 시작하는 초안을 열어 보세요."
