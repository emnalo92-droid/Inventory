@echo off
title Candy Store & Takehome - Desktop App
cd /d "%~dp0"

:: Check if server is running on port 3000
netstat -ano | findstr :3000 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo [INFO] Starting host server in background...
    start /min "" cmd /c "%~dp0start-windows-server.bat"
    timeout /t 3 /nobreak >nul
)

:: Launch in native windowed App Mode (no address bar or tabs)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3000 --window-size=1400,900
    exit /b 0
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3000 --window-size=1400,900
    exit /b 0
)

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000 --window-size=1400,900
    exit /b 0
)

if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000 --window-size=1400,900
    exit /b 0
)

:: Fallback to default browser
start http://localhost:3000
