@echo off
REM Double-click this file to crawl Kmart / Target / Big W from this PC.
REM A browser window will open; leave it alone until the crawl finishes.
REM The window stays open afterward so you can read any errors.

cd /d "%~dp0"

REM Keep the PowerShell window open even if the script errors early.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\crawl-local.ps1"
if errorlevel 1 (
  echo.
  echo Something went wrong. See messages above.
  pause
)
