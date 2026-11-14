import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Server,
  Wifi,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Download,
  X,
  Terminal,
  Smartphone,
  Laptop,
  Play,
  RotateCcw,
  Network,
  HelpCircle,
  Sliders,
  FileText,
  Printer
} from 'lucide-react';
import { getApiAuthHeaders } from '../firebase';

interface ServerInfoData {
  status: string;
  hostname: string;
  hostnameUrl?: string;
  hostnameLocalUrl?: string;
  platform: string;
  arch: string;
  port: number;
  host: string;
  localUrl: string;
  lanIps: string[];
  lanUrls: string[];
  isWindows: boolean;
  uptime: number;
}

interface ServerInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServerInfoModal: React.FC<ServerInfoModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<ServerInfoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'lan' | 'windows' | 'firewall' | 'dhcp'>('lan');

  const fetchServerInfo = async () => {
    try {
      setLoading(true);
      const headers = await getApiAuthHeaders();
      const res = await fetch('/api/server-info', {
        credentials: 'include',
        headers
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.warn('Failed to fetch server info:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchServerInfo();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const firewallCmd = 'netsh advfirewall firewall add rule name="CandyStoreServer" dir=in action=allow protocol=TCP localport=3000';

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const startBatContent = `@echo off
setlocal enabledelayedexpansion
title Candy Store & Takehome - Windows Server Host
cd /d "%~dp0"

color 0A
cls
echo ==============================================================================
echo       CANDY STORE & TAKEHOME INVENTORY - WINDOWS SERVER HOST
echo ==============================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is NOT installed!
    echo Download and install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VER=%%v
echo [OK] Node.js is ready: %NODE_VER%
echo.

if not exist "node_modules\\" (
    echo [INFO] Installing dependencies...
    call npm install
)

if not exist "dist\\" (
    echo [INFO] Building production assets...
    call npm run build
)

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

start "" /b cmd /c "timeout /t 3 /nobreak >nul & if exist \\"%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe\\" (\\"%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe\\" --app=http://localhost:3000) else (start http://localhost:3000)"

echo [STATUS] Server is running... Keep this window open!
echo          Press Ctrl+C to stop the server.
echo.

npm start
if %errorlevel% neq 0 (
    npm run dev
)
pause`;

  const setupBatContent = `@echo off
setlocal
title Candy Store & Takehome - Windows Setup
cd /d "%~dp0"

echo ==============================================================================
echo       CANDY STORE & TAKEHOME INVENTORY - WINDOWS SETUP WIZARD
echo ==============================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed! Install from https://nodejs.org/ first.
    pause
    exit /b 1
)

echo [1/3] Installing application dependencies...
call npm install

echo.
echo [2/3] Building production web and desktop assets...
call npm run build

echo.
echo [3/3] Creating Windows Desktop Shortcuts...
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'Candy Store Host Server.lnk')); $s.TargetPath = [System.IO.Path]::Combine('%~dp0', 'start-windows-server.bat'); $s.WorkingDirectory = '%~dp0'; $s.Description = 'Start Candy Store Host Server'; $s.Save()"
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'Candy Store Desktop App.lnk')); $s.TargetPath = [System.IO.Path]::Combine('%~dp0', 'launch-desktop-app.bat'); $s.WorkingDirectory = '%~dp0'; $s.Description = 'Launch Candy Store Desktop App'; $s.Save()"

echo.
echo Setup complete! Desktop shortcuts have been created.
pause`;

  const launchAppContent = `@echo off
title Candy Store & Takehome - Desktop App
cd /d "%~dp0"

netstat -ano | findstr :3000 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    start /min "" cmd /c "%~dp0start-windows-server.bat"
    timeout /t 3 /nobreak >nul
)

if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app=http://localhost:3000 --window-size=1400,900
    exit /b 0
)

if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" --app=http://localhost:3000 --window-size=1400,900
    exit /b 0
)

if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app=http://localhost:3000 --window-size=1400,900
    exit /b 0
)

start http://localhost:3000`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-teal-900 to-slate-900 text-white border-b border-teal-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600/30 border border-teal-400/40 flex items-center justify-center">
              <Server className="w-5 h-5 text-teal-300" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>Windows Host Server & Network Manager</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active Host
                </span>
              </h2>
              <p className="text-xs text-teal-200/80">
                Turn this computer into the central server for your store & cashiers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-teal-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 px-6 bg-slate-50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={() => setActiveTab('lan')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'lan'
                ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Store Network (Wi-Fi / LAN)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('windows')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'windows'
                ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Windows Desktop App</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('firewall')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'firewall'
                ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Firewall & Port 3000</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dhcp')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'dhcp'
                ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Dynamic vs Static IP Guide</span>
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-800 dark:text-slate-200 text-xs">
          {activeTab === 'lan' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-teal-600 text-white shrink-0 mt-0.5">
                    <Wifi className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-teal-950 dark:text-teal-100 text-sm">
                      Cashier & Branch Device Connections
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 mt-1">
                      Give any of the addresses below to cashiers, tablets, or branch computers connected to the <strong>same store Wi-Fi or office network</strong>. They will immediately see and record live inventory!
                    </p>
                  </div>
                </div>
              </div>

              {/* Local Host URL */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Laptop className="w-3.5 h-3.5 text-teal-600" />
                    Host Machine Access (This Computer)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Port 3000</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value="http://localhost:3000"
                    className="flex-1 font-mono text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard('http://localhost:3000', 'localhost')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer shrink-0"
                  >
                    {copiedKey === 'localhost' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'localhost' ? 'Copied' : 'Copy'}</span>
                  </button>
                  <a
                    href="http://localhost:3000"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Computer Name URL (Permanent, handles Automatic / DHCP IP) */}
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 text-xs">
                      <Network className="w-3.5 h-3.5 text-amber-600" />
                      Computer Name URL (Permanent — Works Even When IP Changes Automatically!)
                    </span>
                    <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                      Because your network automatically assigns IPs (DHCP), share this permanent Computer Name address with cashiers:
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('dhcp')}
                    className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline shrink-0 flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle className="w-3 h-3" />
                    How It Works
                  </button>
                </div>
                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 flex-1 truncate select-all">
                      {data?.hostnameUrl || `http://${data?.hostname || 'HOST-PC'}:${data?.port || 3000}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(data?.hostnameUrl || `http://${data?.hostname || 'HOST-PC'}:${data?.port || 3000}`, 'host-url')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer shrink-0 text-xs"
                    >
                      {copiedKey === 'host-url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'host-url' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 flex-1 truncate select-all">
                      {data?.hostnameLocalUrl || `http://${(data?.hostname || 'host-pc').toLowerCase()}.local:${data?.port || 3000}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(data?.hostnameLocalUrl || `http://${(data?.hostname || 'host-pc').toLowerCase()}.local:${data?.port || 3000}`, 'host-local-url')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 font-medium rounded-lg bg-amber-700 hover:bg-amber-800 text-white transition-colors cursor-pointer shrink-0 text-xs"
                      title="Recommended for iPads, iPhones, Macs, and Android devices"
                    >
                      {copiedKey === 'host-local-url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'host-local-url' ? 'Copied (.local)' : 'Copy (.local)'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* LAN / Wi-Fi IP Addresses */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                      Numeric Wi-Fi / LAN IP (Alternative)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      May change if router reboots; see Dynamic IP Guide to fix it permanently
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={fetchServerInfo}
                    className="text-[11px] text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Refresh IPs
                  </button>
                </div>

                {data?.lanIps && data.lanIps.length > 0 ? (
                  data.lanIps.map((ip, idx) => {
                    const url = `http://${ip}:${data.port || 3000}`;
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                      >
                        <span className="font-mono text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 flex-1 truncate select-all">
                          {url}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(url, `ip-${idx}`)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer shrink-0"
                        >
                          {copiedKey === `ip-${idx}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedKey === `ip-${idx}` ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500">
                    <p>When running on your Windows computer, your local IP (e.g. <code>http://192.168.1.50:3000</code>) will appear here automatically.</p>
                  </div>
                )}
              </div>

              {/* Host Machine Stats */}
              {data && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[10px] text-slate-400 block">Host Name</span>
                    <span className="font-semibold truncate block">{data.hostname || 'PC'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[10px] text-slate-400 block">Platform</span>
                    <span className="font-semibold truncate block">{data.platform || 'Server'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[10px] text-slate-400 block">Server Port</span>
                    <span className="font-semibold truncate block font-mono">{data.port || 3000}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[10px] text-slate-400 block">Active Status</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Serving
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'windows' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-1.5">
                  <Play className="w-4 h-4 text-teal-600" />
                  One-Click Windows Launcher Files
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  Download these pre-configured batch files directly into your application folder on your Windows computer:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => downloadFile('start-windows-server.bat', startBatContent)}
                    className="p-3 rounded-xl border border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-900 hover:bg-teal-50 dark:hover:bg-teal-950/40 flex flex-col items-start gap-1 text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold text-teal-700 dark:text-teal-400 flex items-center gap-1">
                        <Terminal className="w-3.5 h-3.5" />
                        start-server.bat
                      </span>
                      <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600" />
                    </div>
                    <span className="text-[10.5px] text-slate-500">Starts server & detects your Wi-Fi IP</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadFile('setup-windows.bat', setupBatContent)}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex flex-col items-start gap-1 text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <Terminal className="w-3.5 h-3.5" />
                        setup-windows.bat
                      </span>
                      <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
                    </div>
                    <span className="text-[10.5px] text-slate-500">Installs dependencies & creates shortcuts</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadFile('launch-desktop-app.bat', launchAppContent)}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex flex-col items-start gap-1 text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <Monitor className="w-3.5 h-3.5" />
                        launch-app.bat
                      </span>
                      <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
                    </div>
                    <span className="text-[10.5px] text-slate-500">Opens in native standalone desktop window</span>
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-2">
                  Native Windows App Mode (No Browser Tabs)
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300">
                  <li>Run <code>start-windows-server.bat</code> on your PC.</li>
                  <li>Click the <strong>Install App</strong> icon in Microsoft Edge or Google Chrome address bar.</li>
                  <li>The app will install directly into your <strong>Windows Start Menu</strong> and <strong>Taskbar</strong> with its own icon, running in a clean standalone window without browser controls.</li>
                </ol>
              </div>

              {/* Complete Walkthrough Manual Card */}
              <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-teal-600 text-white shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-teal-950 dark:text-teal-100 text-xs">
                      Server Installation Walkthrough Manual
                    </h4>
                    <p className="text-[11px] text-teal-800/80 dark:text-teal-300/80">
                      Step-by-step printable manual with checklists, architecture diagrams & troubleshooting.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <a
                    href="/WINDOWS-SERVER-INSTALLATION-WALKTHROUGH.doc"
                    download="Candy-Store-Server-Installation-Walkthrough.doc"
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Word (.doc)</span>
                  </a>
                  <a
                    href="/WINDOWS-SERVER-INSTALLATION-WALKTHROUGH.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 font-medium text-xs text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-500" />
                    <span>Print / PDF</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'firewall' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                <h4 className="font-bold mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  Allowing Cashier Connections Through Windows Firewall
                </h4>
                <p className="text-xs">
                  Windows Defender Firewall may block other computers on your Wi-Fi from reaching port 3000. Run this single command as Administrator to allow instant access:
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 font-mono text-xs">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-slate-400 text-[10px]">
                  <span>Command Prompt / PowerShell (Run as Administrator)</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(firewallCmd, 'firewall')}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 cursor-pointer"
                  >
                    {copiedKey === 'firewall' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'firewall' ? 'Copied' : 'Copy Command'}</span>
                  </button>
                </div>
                <p className="select-all break-all leading-relaxed">{firewallCmd}</p>
              </div>

              <div className="space-y-1.5 text-slate-600 dark:text-slate-400">
                <p className="font-semibold text-slate-800 dark:text-slate-200">How to run:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Right-click the Windows Start menu and choose <strong>Terminal (Admin)</strong> or <strong>Command Prompt (Admin)</strong>.</li>
                  <li>Paste the command above and press <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-[10px]">Enter</kbd>.</li>
                  <li>You will see <code>Ok.</code> Now cashiers can connect from any device on your Wi-Fi!</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'dhcp' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-950 dark:text-blue-100">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0 mt-0.5">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">
                      My IP is Automatically Obtained (DHCP) — What Should I Do?
                    </h4>
                    <p className="text-xs text-blue-900/80 dark:text-blue-200/80 mt-1 leading-relaxed">
                      "Automatically obtain an IP address" means your Wi-Fi router uses <strong>DHCP</strong>. If your router or PC restarts, your numeric IP (e.g. <code>192.168.1.15</code>) could change to another number. Here are the <strong>3 best ways</strong> to handle this:
                    </p>
                  </div>
                </div>
              </div>

              {/* Option 1 */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
                      1
                    </span>
                    <h5 className="font-bold text-slate-900 dark:text-slate-100">
                      Solution 1: Use Computer Name URL (Easiest — No Setup Needed!)
                    </h5>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-medium">
                    Recommended
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                  You don't need to change any IP settings. Windows automatically broadcasts its computer name to other devices on the same Wi-Fi. Just tell your cashiers to open:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Windows Cashier PCs</span>
                      <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {data?.hostnameUrl || `http://${data?.hostname || 'PC'}:3000`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(data?.hostnameUrl || `http://${data?.hostname || 'PC'}:3000`, 'dhcp-host')}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                      title="Copy"
                    >
                      {copiedKey === 'dhcp-host' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">iPads, Android & Macs</span>
                      <span className="font-mono text-xs font-semibold text-teal-600 dark:text-teal-400">
                        {data?.hostnameLocalUrl || `http://${(data?.hostname || 'pc').toLowerCase()}.local:3000`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(data?.hostnameLocalUrl || `http://${(data?.hostname || 'pc').toLowerCase()}.local:3000`, 'dhcp-host-local')}
                      className="p-1.5 text-slate-400 hover:text-teal-600 transition-colors"
                      title="Copy"
                    >
                      {copiedKey === 'dhcp-host-local' ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 italic">
                  Even if your router assigns a new dynamic IP address tomorrow, the computer name URL stays 100% the same!
                </p>
              </div>

              {/* Option 2 */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                    2
                  </span>
                  <h5 className="font-bold text-slate-900 dark:text-slate-100">
                    Solution 2: Set a Fixed Static IP in Windows (Takes 1 Minute)
                  </h5>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                  If you want your computer to always keep the exact same numeric IP address (e.g. <code>192.168.1.100</code>):
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-700 dark:text-slate-300 text-xs pl-1">
                  <li>Open <strong>Windows Settings</strong> (press <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[10px]">Win + I</kbd>).</li>
                  <li>Click <strong>Network & internet</strong> &rarr; <strong>Wi-Fi</strong> (or <strong>Ethernet</strong>).</li>
                  <li>Click your connected store Wi-Fi network properties.</li>
                  <li>Under <strong>IP assignment</strong>, click the <strong>Edit</strong> button.</li>
                  <li>Change from <strong>Automatic (DHCP)</strong> to <strong>Manual</strong> and turn on <strong>IPv4</strong>.</li>
                  <li>Fill in these values:
                    <div className="mt-1.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[11px] space-y-0.5">
                      <div><span className="text-slate-400">IP address:</span> 192.168.1.100 (or your current IP)</div>
                      <div><span className="text-slate-400">Subnet prefix length:</span> 24 (or mask 255.255.255.0)</div>
                      <div><span className="text-slate-400">Gateway:</span> 192.168.1.1 (your router address)</div>
                      <div><span className="text-slate-400">Preferred DNS:</span> 8.8.8.8 (Google) or 1.1.1.1 (Cloudflare)</div>
                    </div>
                  </li>
                  <li>Click <strong>Save</strong>. Your computer's IP address will now never change!</li>
                </ol>
              </div>

              {/* Option 3 */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center">
                    3
                  </span>
                  <h5 className="font-bold text-slate-900 dark:text-slate-100">
                    Solution 3: Router DHCP Reservation (Best for Store Wi-Fi)
                  </h5>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                  If you have access to your store's Wi-Fi router admin page:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300 text-xs pl-1">
                  <li>Log into your router (usually <code>http://192.168.1.1</code> or <code>http://192.168.0.1</code>).</li>
                  <li>Go to <strong>DHCP Settings</strong> &rarr; <strong>Address Reservation</strong>.</li>
                  <li>Select this computer's name or MAC address and lock it to a fixed IP.</li>
                  <li>Your Windows computer stays on "Automatically obtain", but your router will always give it the exact same IP!</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Node.js & Express Host Server · Port 3000
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
