@echo off
setlocal
cd /d "%~dp0"
title Build Bench.exe

:: Arguments, in any order:
::   plain   skip icon and version stamping (no winCodeSign download, no symlink step)
::   auto    no pauses, and if stamping fails fall back to plain by itself (used by install-bench.bat)
set PLAIN=
set AUTO=
for %%a in (%*) do (
  if /i "%%a"=="plain" set PLAIN=1
  if /i "%%a"=="auto" set AUTO=1
)

echo.
echo   BUILD BENCH.EXE
echo   ===============
echo.
where node >nul 2>&1 || ( echo   Node.js not found. Install LTS from https://nodejs.org & goto fail )

echo   [1/3] Installing dependencies (Electron is ~100 MB, first time only)...
call npm install --no-fund --no-audit || goto fail

echo.
echo   [1b] Photographs (skips the ones already here)...
call fetch-photos.bat nopause

echo.
echo   [2/3] Building the interface...
call npm run build || goto fail

echo.
echo   [3/3] Packaging Windows executable...
if exist release ( del /q release\*.exe release\*.blockmap release\*.7z release\*.yml release\*.yaml 2>nul & for /d %%d in (release\*) do rd /s /q "%%d" )
set EXTRA=
if defined PLAIN (
  echo   plain: skipping icon/version stamping, no winCodeSign download
  set EXTRA=--config.win.signAndEditExecutable=false
)
call npx electron-builder --win nsis portable --publish never %EXTRA%
if not errorlevel 1 goto built
if defined PLAIN goto fail
if not defined AUTO goto fail
echo.
echo   Packaging with icon stamping failed (usually the symbolic-link step without Developer Mode).
echo   Retrying without stamping...
call npx electron-builder --win nsis portable --publish never --config.win.signAndEditExecutable=false || goto fail

:built
echo.
for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do set VER=%%v
echo   Done:
echo     release\Bench-Setup-%VER%.exe      installer, give this to colleagues
echo     release\Bench-portable-%VER%.exe   no install, runs from any folder
echo.
echo   Installed: first start asks for name and email, then the Microsoft sign-in. Settings ^> This machine picks the shared folder.
echo   Portable:  keeps data\ beside the exe, so a copy on the share is the board.
echo.
if not defined AUTO pause
exit /b 0

:fail
echo.
echo   Build failed. Leave this window open and paste the last lines back to Claude.
echo.
echo   If the error mentions "Cannot create symbolic link": turn on Windows Developer
echo   Mode (Settings ^> System ^> For developers) or run this once as Administrator.
echo   No admin available?  build-exe.bat plain   builds without the custom icon.
if not defined AUTO pause
exit /b 1
