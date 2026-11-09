@echo off
REM Build core and the Electron main process
call npm run build:core
call npm run build:desktop

REM Start React dev server in background
echo Starting React dev server...
start /B npm run dev -w @xpm/ui

REM Wait for Vite to be ready (max 30 seconds)
echo Waiting for Vite to be ready...
setlocal enabledelayedexpansion
for /L %%i in (1,1,30) do (
  powershell -Command "try { $null = Invoke-WebRequest -Uri http://localhost:3000 -UseBasicParsing -TimeoutSec 1; exit 0 } catch { exit 1 }" 2>nul
  if !ERRORLEVEL! equ 0 (
    echo Vite is ready!
    goto :vite_ready
  )
  echo Attempt %%i/30...
  timeout /T 1 /NOBREAK >nul
)

:vite_ready
REM Start Electron
echo Starting Electron...
npm start -w x-profiles-manager

pause
