@echo off
setlocal enabledelayedexpansion
chcp 437 >nul
title Check translation coverage

set "HERE=%~dp0"

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

"!NODE!" "%HERE%tools\audit.mjs"

:end
echo.
pause
