@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -Sta -ExecutionPolicy Bypass -File "%~dp0Start-Fieldwork.ps1"
exit /b %ERRORLEVEL%
