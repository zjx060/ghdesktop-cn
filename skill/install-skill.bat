@echo off
setlocal enabledelayedexpansion
chcp 437 >nul
title Install ghdesktop-cn skill

set "DST=%USERPROFILE%\.workbuddy\skills\ghdesktop-cn"
set "SRC=%~dp0..\dist\GitHubDesktop-CN-Toolkit"

if not exist "%SRC%\tools\update-cn.mjs" (
  echo [ERROR] package not found: %SRC%
  echo         run this script from inside the cloned repository.
  goto :end
)

echo Installing skill to %DST%
if exist "%DST%" echo [warn] existing installation will be overwritten

if not exist "%DST%" mkdir "%DST%"
xcopy "%SRC%" "%DST%" /E /I /Y /Q >nul
if errorlevel 1 (
  echo [ERROR] copy failed
  goto :end
)

copy /Y "%~dp0SKILL.md" "%DST%\SKILL.md" >nul
if errorlevel 1 (
  echo [ERROR] failed to copy SKILL.md
  goto :end
)

echo [OK] skill installed. Files:
dir /b "%DST%"
echo.
echo Tell the assistant: 汉化 GitHub Desktop
echo If it is not detected, restart WorkBuddy.

:end
echo.
pause
