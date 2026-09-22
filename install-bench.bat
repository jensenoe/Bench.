@echo off
setlocal
cd /d "%~dp0"
title Install Bench.

echo.
echo   INSTALL BENCH.
echo   ==============
echo.
echo   One script, start to finish: it fetches what is missing (Node.js, the packages,
echo   the photographs), builds the app and then starts the Windows installer.
echo   First time this takes ten to fifteen minutes, mostly downloads. Leave it running.
echo.

:: -- 1. Node.js ----------------------------------------------------------
where node >nul 2>&1
if not errorlevel 1 goto node_ok
echo   [1/3] Node.js is not installed. Installing Node.js LTS with winget...
where winget >nul 2>&1 || (
  echo.
  echo   winget is not available on this machine. Install Node.js LTS from
  echo   https://nodejs.org, then run this script again.
  goto fail
)
winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo.
  echo   winget could not install Node.js. Install the LTS build from https://nodejs.org
  echo   and run this script again.
  goto fail
)
:: The new install is not on this window's PATH yet; add the usual locations for this run.
set "PATH=%PATH%;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm"
where node >nul 2>&1 || (
  echo.
  echo   Node.js is installed, but this window cannot see it yet.
  echo   Close this window and run install-bench.bat once more.
  goto fail
)
:node_ok
for /f "usebackq delims=" %%v in (`node -v`) do echo   [1/3] Node.js %%v

:: -- 2. Build -------------------------------------------------------------
echo   [2/3] Building Bench. (packages, photographs, interface, installer)...
echo.
call build-exe.bat auto || goto fail

:: -- 3. Install -----------------------------------------------------------
for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do set VER=%%v
set "SETUP=release\Bench-Setup-%VER%.exe"
if not exist "%SETUP%" (
  echo   The build finished but %SETUP% is missing.
  goto fail
)
echo.
echo   [3/3] Starting the installer. It installs for you only, no admin rights needed.
echo         The first start of Bench. asks for your name and work email.
echo.
start "" /wait "%SETUP%"
echo.
echo   Done. This folder can be deleted now; Bench. is installed in your profile.
echo   To update later: download the repository again and run this script again.
echo.
pause
exit /b 0

:fail
echo.
echo   Installation did not finish. Leave this window open and send the last lines to Noel.
echo.
pause
exit /b 1
