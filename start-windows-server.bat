@echo off
setlocal enabledelayedexpansion
title Candy Store & Takehome - Windows Server Host
cd /d "%~dp0"

color 0A
cls
echo ==============================================================================
echo       CANDY STORE & TAKEHOME INVENTORY - WINDOWS SERVER HOST
echo ==============================================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is NOT installed on this computer!
    echo.
    echo Please download and install Node.js (LTS version) from:
    echo   https://nodejs.org/
    echo.
    echo After installing, restart this script.
    echo ==============================================================================
    pause
    exit /b 1
)

:: 2. Display Node version
for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VER=%%v
echo [OK] Node.js is ready: %NODE_VER%
echo.

:: 3. Check if dependencies are installed
if not exist "node_modules\" (
    echo [INFO] First time run detected. Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies. Check your internet connection.
        pause
        exit /b 1
    )
)

:: 4. Build frontend if dist is missing
if not exist "dist\" (
    echo [INFO] Building application production assets...
    call npm run build
)

:: 5. Detect Local Network IP Address and Computer Name
echo ==============================================================================
echo   HOST COMPUTER LOCAL NETWORK (Wi-Fi / LAN) ADDRESSES:
echo ==============================================================================
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "ip=%%a"
    set "ip=!ip: =!"
    echo   -> IP Address URL: http://!ip!:3000
)
echo.
echo   COMPUTER NAME URL (Recommended if your IP is automatically obtained):
echo   -> Share this with cashiers (never changes even if IP changes):
echo      http://%COMPUTERNAME%:3000
echo      http://%COMPUTERNAME%.local:3000
echo.
echo   Local machine access: http://localhost:3000
echo ==============================================================================
echo.

:: 6. Launch Desktop App Window after 2 seconds in background
start "" /b cmd /c "timeout /t 3 /nobreak >nul & if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3000) else (start http://localhost:3000)"

:: 7. Start the Node Server
echo [STATUS] Server is running... Keep this window open!
echo          Press Ctrl+C to stop the server.
echo.

npm start
if %errorlevel% neq 0 (
    echo [INFO] Falling back to dev server runner...
    npm run dev
)

pause
