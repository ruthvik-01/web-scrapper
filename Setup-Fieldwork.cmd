@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js 22 or newer is required. & exit /b 1)
node -e "if (Number(process.versions.node.split('.')[0]) < 22) process.exit(1)" || (echo Node.js 22 or newer is required. & exit /b 1)
call npm ci || exit /b 1
call npx playwright install chromium || exit /b 1
echo Setup complete. Run Start-Fieldwork.cmd.
