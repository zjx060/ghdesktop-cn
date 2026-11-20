@echo off
setlocal enabledelayedexpansion
chcp 437 >nul
title Restore English UI

set "HERE=%~dp0"

rem ---- locate node.exe ----
set "NODE="
for %%p in (node.exe) do if not defined NODE if exist "%%~$PATH:p" set "NODE=%%~$PATH:p"
if not defined NODE (
  for /f "delims=" %%f in ('dir /b /o-n "%USERPROFILE%\.workbuddy\binaries\node\versions\*\node.exe" 2^>nul') do (
    if not defined NODE set "NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\%%f"
  )
)
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE (
  echo [ERROR] node.exe not found.
  goto :end
)

rem ---- refuse while the app is running ----
tasklist /fi "imagename eq GitHubDesktop.exe" 2>nul | "%SystemRoot%\System32\find.exe" /i "GitHubDesktop.exe" >nul
if not errorlevel 1 (
  echo [ERROR] GitHub Desktop is running. Quit it first: tray icon -^> Quit
  goto :end
)

"!NODE!" "%HERE%tools\restore-en.mjs"
set "RC=!errorlevel!"
echo.
if "!RC!"=="0" (echo [DONE] Restart GitHub Desktop to see the English UI.) else (echo [FAILED] see the messages above.)

:end
echo.
pause
