@echo off
rem Starts wirdwatcher (Windows). Used by the Desktop shortcut.
rem If the app has fetched a new release (it leaves the tag in .update-to),
rem this moves to it first, while nothing is running.
setlocal enabledelayedexpansion
cd /d "%~dp0.."

rem Restarting after an update: give the old copy a moment to close.
if "%~1"=="--after-update" timeout /t 4 /nobreak >nul

if not exist .update-to goto start
set /p TAG=<.update-to
del .update-to
git rev-parse -q --verify "refs/tags/!TAG!" >nul 2>&1 || goto start
set DIRTY=
for /f "delims=" %%i in ('git status --porcelain --untracked-files^=no') do set DIRTY=1
if defined DIRTY (
  echo Skipped the update to !TAG!: files in this folder have been changed.
  goto start
)
set LOCKA=
set LOCKB=
for /f "delims=" %%i in ('git rev-parse HEAD:package-lock.json 2^>nul') do set LOCKA=%%i
git reset -q --hard "!TAG!" || goto start
echo Updated wirdwatcher to !TAG!
for /f "delims=" %%i in ('git rev-parse HEAD:package-lock.json 2^>nul') do set LOCKB=%%i
if not "!LOCKA!"=="!LOCKB!" call npm.cmd install --no-audit --no-fund

:start
if not exist node_modules call npm.cmd install --no-audit --no-fund
set WIRDWATCHER_LAUNCHER=1
call npm.cmd start
if errorlevel 1 pause
