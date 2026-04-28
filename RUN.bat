@echo off
color 0A
title Bank Statement Analyzer
cls
echo.
echo     ╔═══════════════════════════════════════════════════╗
echo     ║                                                   ║
echo     ║         BANK STATEMENT ANALYZER                   ║
echo     ║         One-Click Start                           ║
echo     ║                                                   ║
echo     ╚═══════════════════════════════════════════════════╝
echo.

REM Step 1: Check and install dependencies
if not exist "node_modules" (
    echo     [SETUP] Installing dependencies...
    echo     Please wait, this only happens once...
    echo.
    call npm install
    if errorlevel 1 (
        color 0C
        echo.
        echo     [ERROR] Installation failed!
        echo     Make sure Node.js is installed.
        pause
        exit /b 1
    )
    echo.
    echo     ✓ Dependencies installed!
    echo.
)

REM Step 2: Clear old cache
if exist ".next" (
    echo     [CLEAN] Clearing old cache...
    rmdir /s /q .next 2>nul
    echo     ✓ Cache cleared!
    echo.
)

REM Step 3: Start the server
echo     [START] Starting development server...
echo.
echo     ───────────────────────────────────────────────────
echo     ✓ App will open at: http://localhost:3000
echo     ───────────────────────────────────────────────────
echo.

REM Start server in background
start /B npm run dev

REM Step 4: Wait and open browser
echo     [WAIT] Waiting for server to start...
timeout /t 8 /nobreak >nul

echo     [OPEN] Opening Chrome...
start http://localhost:3000

echo.
echo     ╔═══════════════════════════════════════════════════╗
echo     ║                                                   ║
echo     ║     ✓ SERVER RUNNING                             ║
echo     ║     ✓ BROWSER OPENED                             ║
echo     ║                                                   ║
echo     ║     Drop your PDF file to analyze!               ║
echo     ║                                                   ║
echo     ╚═══════════════════════════════════════════════════╝
echo.
echo     Press any key to STOP the server and exit...
echo.
pause >nul

REM Stop the server
echo.
echo     [STOP] Shutting down server...
taskkill /F /IM node.exe >nul 2>&1
color 0E
echo     ✓ Server stopped. Goodbye!
timeout /t 2 /nobreak >nul

