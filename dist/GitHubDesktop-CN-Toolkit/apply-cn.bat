@echo off
setlocal enabledelayedexpansion
chcp 437 >nul
title GitHub Desktop Chinese Patcher

rem ------------------------------------------------------------------
rem  Auto-adapting Chinese patch for GitHub Desktop.
rem  1) exact patch for the installed version (local cache)
rem  2) else fetch the matching patch from upstream Git repo
rem  3) else machine-translate with the local dictionary
rem ------------------------------------------------------------------

set "APPDIR=%LOCALAPPDATA%\GitHubDesktop"
set "HERE=%~dp0"

if not exist "%APPDIR%" (
  echo [ERROR] GitHub Desktop not found: %APPDIR%
  goto :end
)

rem ---- locate node.exe (WorkBuddy ships its own, may not be on PATH) ----
set "NODE="
for %%p in (node.exe) do if not defined NODE if exist "%%~$PATH:p" set "NODE=%%~$PATH:p"
if not defined NODE (
  for /f "delims=" %%f in ('dir /b /o-n "%USERPROFILE%\.workbuddy\binaries\node\versions\*\node.exe" 2^>nul') do (
    if not defined NODE set "NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\%%f"
  )
)
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE (
  echo [ERROR] node.exe not found. Install Node.js or run it from WorkBuddy.
  goto :end
)

rem ---- refuse to patch while the app is running ----
tasklist /fi "imagename eq GitHubDesktop.exe" 2>nul | "%SystemRoot%\System32\find.exe" /i "GitHubDesktop.exe" >nul
if not errorlevel 1 (
  echo [ERROR] GitHub Desktop is running.
  echo         Quit it first: tray icon - right click - Quit
  goto :end
)

echo Node   : !NODE!
echo Patch  : %HERE%
echo.
"!NODE!" "%HERE%tools\update-cn.mjs"
set "RC=!errorlevel!"
echo.
if "!RC!"=="0" (
  echo [DONE] Start GitHub Desktop to see the Chinese UI.
  echo        If it fails to start, run restore-en.bat
) else (
  echo [FAILED] see the messages above.
)

:end
echo.
pause
