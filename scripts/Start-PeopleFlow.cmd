@echo off
setlocal
cd /d "%~dp0.."
where node >nul 2>nul
if %errorlevel% equ 0 (
  set "PF_NODE=node"
) else (
  set "PF_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist .env (
  echo Chua cau hinh .env. Doc README.md.
  pause
  exit /b 1
)
echo PeopleFlow - http://127.0.0.1:3000
echo Du lieu duoc luu trong SQL Server. Nhan Ctrl+C de dung.
"%PF_NODE%" --env-file=.env server/index.mjs
if errorlevel 1 pause
