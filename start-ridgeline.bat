@echo off
setlocal
cd /d "%~dp0"
title Ridgeline

echo.
echo   RIDGELINE
echo   =========
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js is not installed, or not on PATH.
  echo   Install the LTS build from https://nodejs.org, reopen this window, run again.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node --version') do set NODEVER=%%v
echo   Node %NODEVER%
echo.

echo   [1/3] Installing dependencies...
call npm install --no-fund --no-audit
if errorlevel 1 goto fail

echo.
echo   [2/3] Building...
call npm run build
if errorlevel 1 goto fail

echo.
echo   [3/3] Starting server on http://127.0.0.1:5178
echo.
echo   Leave this window open. Close it to stop the dashboard.
echo.
start "" http://127.0.0.1:5178
node server/index.js
goto end

:fail
echo.
echo   ---------------------------------------------------------
echo   Something failed above. Leave this window open and paste
echo   the last few lines back to Claude.
echo   ---------------------------------------------------------
echo.
pause
exit /b 1

:end
pause
