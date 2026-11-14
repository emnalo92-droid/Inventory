import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  FileSpreadsheet,
  Download,
  Trash2,
  ExternalLink,
  RefreshCw,
  Search,
  Upload,
  CheckCircle2,
  AlertCircle,
  FolderSync,
  FileText,
  FileCode,
  ShieldCheck,
  RotateCcw,
  Users
} from 'lucide-react';
import { AppState } from '../types';
import {
  DriveFile,
  listDriveFiles,
  backupLedgerToDrive,
  downloadDriveFileContent,
  deleteDriveFile,
  InsufficientScopeError
} from '../lib/drive';
import { signInWithGoogle, signOutFirebase, getAccessToken } from '../firebase';
import { User as FirebaseUser } from 'firebase/auth';

interface GoogleDriveTabProps {
  state: AppState;
  firebaseUser: FirebaseUser | null;
  onUpdateState: (updater: (prev: AppState) => AppState, actionDescription?: string) => void;
  onAskConfirm: (message: string, onConfirm: () => void) => void;
}

export const GoogleDriveTab: React.FC<GoogleDriveTabProps> = ({
  state,
  firebaseUser,
  onUpdateState,
  onAskConfirm
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [needsPermissionGrant, setNeedsPermissionGrant] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupFormat, setBackupFormat] = useState<'both' | 'excel' | 'json'>('both');
  const [filterType, setFilterType] = useState<'all' | 'backups' | 'excel'>('all');

  // Load in-memory token on mount or auth change
  useEffect(() => {
    getAccessToken().then(tok => {
      setAccessToken(tok);
    });
  }, [firebaseUser]);

  const showToast = (text: string, isError = false) => {
    setFeedback({ text, error: isError });
    setTimeout(() => {
      setFeedback(null);
    }, 5000);
  };

  // Fetch files from Drive
  const fetchFiles = useCallback(async (token: string, search?: string) => {
    setLoadingFiles(true);
    try {
      const driveFiles = await listDriveFiles(token, { search });
      setFiles(driveFiles);
      setNeedsPermissionGrant(false);
    } catch (err: any) {
      if (err instanceof InsufficientScopeError || String(err?.message || err).includes('insufficient')) {
        setNeedsPermissionGrant(true);
        setAccessToken(null);
        return;
      }
      console.warn('Google Drive fetch notice:', err?.message || err);
      showToast(err?.message || 'Failed to load files from Google Drive.', true);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (accessToken) {
      fetchFiles(accessToken, searchQuery);
    } else {
      setFiles([]);
    }
  }, [accessToken, fetchFiles, searchQuery]);

  // Handle Google Sign-in to grant Drive access
  const handleConnectGoogle = async () => {
    setIsAuthenticating(true);
    try {
      const { accessToken: token } = await signInWithGoogle(true);
      if (token) {
        setAccessToken(token);
        setNeedsPermissionGrant(false);
        showToast('Successfully connected to Google Drive!');
      } else {
        showToast('Google account linked, but Google Drive access token was not returned.', true);
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user' && !err?.message?.includes('popup-closed-by-user')) {
        showToast(err?.message || 'Google Drive connection failed.', true);
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Disconnect Google Drive
  const handleDisconnect = async () => {
    await signOutFirebase();
    setAccessToken(null);
    setFiles([]);
    showToast('Disconnected from Google Drive.');
  };

  // Backup active inventory ledger to Google Drive
  const handleCreateBackup = async () => {
    if (!accessToken) {
      showToast('Please connect to Google Drive first.', true);
      return;
    }

    setIsBackingUp(true);
    try {
      const result = await backupLedgerToDrive(accessToken, state, backupFormat);
      showToast(
        `Backup created successfully in "Candy Store & Takehome Backups" folder on Google Drive!`
      );
      // Refresh files list
      await fetchFiles(accessToken, searchQuery);
    } catch (err: any) {
      console.error('Backup to Drive failed:', err);
      showToast(err?.message || 'Backup to Google Drive failed.', true);
    } finally {
      setIsBackingUp(false);
    }
  };

  // Recursively strip dangerous keys to prevent prototype pollution
  const stripUnsafeKeys = (val: unknown): any => {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(stripUnsafeKeys);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = stripUnsafeKeys(v);
    }
    return out;
  };

  // Restore inventory state from a JSON backup in Google Drive
  const handleRestoreFromDrive = async (file: DriveFile) => {
    if (!accessToken) return;

    onAskConfirm(
      `Restore inventory ledger from Google Drive backup "${file.name}"?\nThis will replace the current working ledger with the snapshot data.`,
      async () => {
        try {
          const content = await downloadDriveFileContent(accessToken, file.id);
          const rawParsed = JSON.parse(content);
          if (!rawParsed || typeof rawParsed !== 'object' || Array.isArray(rawParsed)) {
            showToast('The selected backup file has an invalid root structure.', true);
            return;
          }
          const parsed = stripUnsafeKeys(rawParsed) as Partial<AppState>;

          if (
            typeof parsed.inv !== 'string' ||
            typeof parsed.start !== 'string' ||
            typeof parsed.cut !== 'string' ||
            !Array.isArray(parsed.items) ||
            !Array.isArray(parsed.rows)
          ) {
            showToast('The selected file does not appear to be a valid inventory backup.', true);
            return;
          }
          if (parsed.items.length > 20000 || parsed.rows.length > 100000) {
            showToast('Backup file exceeds maximum supported item or row limits.', true);
            return;
          }

          onUpdateState(
            prev => ({
              ...prev,
              ...parsed,
              // Never overwrite live user accounts or credentials from a JSON backup snapshot
              users: prev.users,
              locs: Array.isArray(parsed.locs) ? parsed.locs : prev.locs,
              cash: parsed.cash && typeof parsed.cash === 'object' ? parsed.cash : prev.cash,
              cinfo: parsed.cinfo && typeof parsed.cinfo === 'object' ? parsed.cinfo : prev.cinfo,
              cpay: parsed.cpay && typeof parsed.cpay === 'object' ? parsed.cpay : prev.cpay,
              cashiers: Array.isArray(parsed.cashiers) ? parsed.cashiers : prev.cashiers,
              log: Array.isArray(parsed.log) ? parsed.log : prev.log,
            }),
            `Restored ledger state from Google Drive backup: "${file.name}"`
          );
          showToast(`Inventory state restored from "${file.name}" successfully!`);
        } catch (err: any) {
          console.error('Failed to restore from Drive:', err);
          showToast(`Failed to restore backup: ${err?.message || 'Invalid file format'}`, true);
        }
      }
    );
  };

  // Delete file from Google Drive with mandatory user confirmation
  const handleDeleteFile = (file: DriveFile) => {
    if (!accessToken) return;

    onAskConfirm(
      `Are you sure you want to delete "${file.name}" from Google Drive? This action cannot be undone.`,
      async () => {
        try {
          const success = await deleteDriveFile(accessToken, file.id);
          if (success) {
            setFiles(prev => prev.filter(f => f.id !== file.id));
            showToast(`"${file.name}" was removed from Google Drive.`);
          } else {
            showToast('Could not delete file from Google Drive.', true);
          }
        } catch (err: any) {
          showToast(`Delete failed: ${err?.message || 'API error'}`, true);
        }
      }
    );
  };

  // Filtered files
  const filteredFiles = files.filter(f => {
    if (filterType === 'backups') {
      return f.name.includes('Inventory_Backup_') || f.name.endsWith('.json');
    }
    if (filterType === 'excel') {
      return (
        f.name.endsWith('.xlsx') ||
        f.name.endsWith('.xls') ||
        f.mimeType.includes('spreadsheet') ||
        f.mimeType.includes('excel')
      );
    }
    return true;
  });

  const formatFileSize = (bytes?: number | string) => {
    if (!bytes) return '-';
    const n = Number(bytes);
    if (isNaN(n) || n === 0) return '-';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 shadow-xs transition-all ${
            feedback.error
              ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-900'
              : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.error ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-md cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Insufficient Scope Warning & Re-authorization prompt */}
      {needsPermissionGrant && (
        <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <h4 className="font-bold text-xs">Google Drive Permission Required</h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                Your Google session does not currently include storage permissions to manage files in Google Drive. Click below to grant access.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleConnectGoogle}
            disabled={isAuthenticating}
            className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shrink-0 shadow-xs cursor-pointer transition-colors"
          >
            {isAuthenticating ? 'Connecting...' : 'Authorize Google Drive'}
          </button>
        </div>
      )}

      {/* Top Banner & Drive Connection Card */}
      <div className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Google Drive Cloud Integration</span>
                {accessToken ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <CheckCircle2 className="w-3 h-3" /> Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    Not Connected
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Back up inventory ledgers, export formatted Excel (.xlsx) workbooks, and manage records directly on Google Drive.
              </p>
            </div>
          </div>

          <div>
            {!accessToken ? (
              <button
                type="button"
                onClick={handleConnectGoogle}
                disabled={isAuthenticating}
                className="gsi-material-button inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{isAuthenticating ? 'Connecting...' : 'Connect with Google Drive'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {firebaseUser?.email || 'Google Account'}
                </span>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action Panel: Export & Backup */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs">
              <FolderSync className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>Backup Store Ledger</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Export active branch (<strong>{state.inv}</strong>) with all shift entries and item masters to Google Drive.
            </p>

            <div className="flex items-center gap-2">
              <select
                value={backupFormat}
                onChange={e => setBackupFormat(e.target.value as any)}
                disabled={!accessToken || isBackingUp}
                className="text-xs px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none"
              >
                <option value="both">Both (Excel + JSON)</option>
                <option value="excel">Excel (.xlsx) only</option>
                <option value="json">JSON Backup only</option>
              </select>

              <button
                type="button"
                onClick={handleCreateBackup}
                disabled={!accessToken || isBackingUp}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isBackingUp ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Backing up...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Backup Now</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Spreadsheet Export & Reporting</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Generates an Excel workbook with sheets for Store Overview, Items Master, Shift Deliveries, Bad Orders, and Cash Reconciliation.
            </p>
            <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
              Target: Google Drive / Candy Store Backups
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Multi-User Capacity & Scale</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              <strong>10 Users:</strong> Built-in support for 10+ concurrent store staff and cashier terminals via Cloud SQL pooling and Firestore.
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              <strong>1GB+ Data:</strong> High-capacity PostgreSQL database with Google Drive cloud archiving for unlimited historical files.
            </p>
          </div>
        </div>
      </div>

      {/* Files Manager Card */}
      <div className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Google Drive Files ({filteredFiles.length})
            </h3>
          </div>

          {accessToken && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Filter Tabs */}
              <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    filterType === 'all'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  All Files
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('backups')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    filterType === 'backups'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Backups (.json)
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('excel')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    filterType === 'excel'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Excel (.xlsx)
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search Drive files..."
                  className="pl-8 pr-3 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-600 w-48"
                />
              </div>

              <button
                type="button"
                onClick={() => fetchFiles(accessToken, searchQuery)}
                disabled={loadingFiles}
                className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Refresh file list"
              >
                <RefreshCw className={`w-4 h-4 ${loadingFiles ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {!accessToken ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
              <HardDrive className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Connect to Google Drive to Browse & Backup Files
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Click the "Connect with Google Drive" button above with your permission to enable automatic cloud backups, Excel exports, and historical archive restores.
            </p>
          </div>
        ) : loadingFiles ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-teal-600" />
            <p>Loading files from your Google Drive...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400 space-y-2">
            <p>No matching files found on Google Drive.</p>
            <p className="text-[11px] text-slate-500">
              Click <strong>"Backup Now"</strong> above to create your first store inventory backup!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse font-sans">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">File Name</th>
                  <th className="py-2.5 px-3 w-32">Format</th>
                  <th className="py-2.5 px-3 w-28">Size</th>
                  <th className="py-2.5 px-3 w-40">Modified Date</th>
                  <th className="py-2.5 px-3 text-right w-44">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredFiles.map(file => {
                  const isJson = file.name.endsWith('.json') || file.mimeType.includes('json');
                  const isExcel =
                    file.name.endsWith('.xlsx') ||
                    file.name.endsWith('.xls') ||
                    file.mimeType.includes('spreadsheet');

                  return (
                    <tr
                      key={file.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          {isExcel ? (
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : isJson ? (
                            <FileCode className="w-4 h-4 text-teal-600 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-sm sm:max-w-md">
                            {file.name}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded ${
                            isExcel
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : isJson
                              ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {isExcel ? 'Excel (.xlsx)' : isJson ? 'JSON Backup' : 'File'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                        {formatFileSize(file.size)}
                      </td>

                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                        {file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : '-'}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Open in Google Drive */}
                          {file.webViewLink && /^https:\/\//i.test(file.webViewLink) && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-slate-500 hover:text-teal-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                              title="Open in Google Drive"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}

                          {/* Restore from JSON backup */}
                          {isJson && (
                            <button
                              type="button"
                              onClick={() => handleRestoreFromDrive(file)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded hover:bg-teal-100 transition-colors cursor-pointer"
                              title="Restore inventory state from this backup"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Restore</span>
                            </button>
                          )}

                          {/* Delete with confirmation dialog */}
                          <button
                            type="button"
                            onClick={() => handleDeleteFile(file)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                            title="Delete file from Google Drive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
