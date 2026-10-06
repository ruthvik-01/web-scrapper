@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -Sta -ExecutionPolicy Bypass -File "%~dp0Choose-Fieldwork-Location.ps1"
exit /b %ERRORLEVEL%
