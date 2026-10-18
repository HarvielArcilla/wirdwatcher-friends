@echo off
rem Starts wirdwatcher (Windows). Used by the Desktop shortcut.
cd /d "%~dp0.."
call npm.cmd start
if errorlevel 1 pause
