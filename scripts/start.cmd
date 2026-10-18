@echo off
rem Starts wirdwatcher from this folder (installs what it needs the first time).
cd /d "%~dp0\.."
if not exist node_modules call npm.cmd install
call npm.cmd start
