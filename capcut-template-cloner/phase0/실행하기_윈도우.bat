@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo ==============================================
echo   틀복사 0단계: 캡컷 테스트 초안 만들기
echo ==============================================
echo.
echo 캡컷이 켜져 있으면 먼저 꺼 주세요.
echo.

set "PY="
py -3 --version > nul 2>&1 && set "PY=py -3"
if not defined PY (
  python --version > nul 2>&1 && set "PY=python"
)
if not defined PY (
  echo [문제] Python이 설치되어 있지 않아요.
  echo.
  echo  1. https://www.python.org/downloads/ 에서 노란 Download 버튼을 눌러 설치해요.
  echo  2. 설치 첫 화면 아래쪽 "Add python.exe to PATH" 칸을 꼭 체크하세요.
  echo  3. 설치가 끝나면 이 파일을 다시 더블클릭하세요.
  echo.
  pause
  exit /b 1
)

echo [1/2] 필요한 프로그램 설치 중... 1~2분 걸려요.
%PY% -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 (
  echo.
  echo [문제] 설치에 실패했어요. 이 창의 글자를 스크린샷 찍어서 보내 주세요.
  pause
  exit /b 1
)

echo [2/2] 캡컷 테스트 초안 만드는 중...
echo.
%PY% make_test_drafts.py
if errorlevel 1 (
  echo.
  echo 캡컷 설정의 "초안 위치" 경로를 아래에 붙여넣고 Enter를 누르세요.
  echo 붙여넣기: 마우스 오른쪽 클릭
  set /p "DRAFTS=경로: "
  call %PY% make_test_drafts.py --drafts "%%DRAFTS%%"
)

if exist phase0_output start "" phase0_output
echo.
echo 끝났어요! 이제 캡컷을 켜서 "틀복사_"로 시작하는 초안을 열어 보세요.
echo 이 창의 글자도 스크린샷 찍어서 보내 주시면 좋아요.
echo.
pause
