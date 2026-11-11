@echo off
setlocal
title Candy Store & Takehome - Windows Setup
cd /d "%~dp0"

echo ==============================================================================
echo       CANDY STORE & TAKEHOME INVENTORY - WINDOWS SETUP WIZARD
echo ==============================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed!
    echo Please install Node.js from https://nodejs.org/ first.
    pause
    exit /b 1
)

echo [1/3] Installing application dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
)

echo.
echo [2/3] Building production web and desktop assets...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

echo.
echo [3/3] Creating Windows Desktop Shortcuts...
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'Candy Store Host Server.lnk')); $s.TargetPath = [System.IO.Path]::Combine('%~dp0', 'start-windows-server.bat'); $s.WorkingDirectory = '%~dp0'; $s.Description = 'Start Candy Store Host Server'; $s.Save()"
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'Candy Store Desktop App.lnk')); $s.TargetPath = [System.IO.Path]::Combine('%~dp0', 'launch-desktop-app.bat'); $s.WorkingDirectory = '%~dp0'; $s.Description = 'Launch Candy Store Desktop App'; $s.Save()"

echo.
echo ==============================================================================
echo   SETUP COMPLETE!
echo.
echo   Two shortcuts have been added to your Windows Desktop:
echo     1. "Candy Store Host Server"  - Starts the local network server
echo     2. "Candy Store Desktop App"  - Launches the application window
echo.
echo   Firewall Note:
echo   To allow cashiers on other computers or phones to connect, allow port 3000
echo   in Windows Defender Firewall:
echo     netsh advfirewall firewall add rule name="CandyStoreServer" dir=in action=allow protocol=TCP localport=3000
echo ==============================================================================
echo.
pause
