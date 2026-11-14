import React, { useState, useEffect } from 'react';
import { AppState, User, LogEntry, PresenceUser } from './types';
import {
  KEY,
  loadState,
  saveState,
  getSeedState,
  autoCarryOver,
  cleanupStrayGeneratedRows,
  addDay,
  fd,
  rnd,
  today,
  mergeStates
} from './utils/helpers';
import { Header } from './components/Header';
import { TabsNav } from './components/TabsNav';
import { DataEntryTab } from './components/DataEntryTab';
import { TransferFromTab } from './components/TransferFromTab';
import { TransferToTab } from './components/TransferToTab';
import { ItemsSoldOutSummaryTab } from './components/ItemsSoldOutSummaryTab';
import { SummaryViewTab } from './components/SummaryViewTab';
import { CashDetailsSummaryTab } from './components/CashDetailsSummaryTab';
import { ProfitAndLossTab } from './components/ProfitAndLossTab';
import { ItemMasterTab } from './components/ItemMasterTab';
import { UsersTab } from './components/UsersTab';
import { SetupTab } from './components/SetupTab';
import { GoogleDriveTab } from './components/GoogleDriveTab';
import { LoginModal } from './components/LoginModal';
import { PasswordModal } from './components/PasswordModal';
import { ConfirmModal } from './components/ConfirmModal';
import { ShieldAlert, Lock } from 'lucide-react';
import {
  canUserAccessTab,
  canUserEditData,
  canUserDeleteRows,
  canUserEditPrices,
  canUserAdjustCash
} from './utils/permissions';
import {
  testConnection,
  saveStateToFirestore,
  subscribeToFirestoreState,
  saveStateToCloudSQL,
  fetchStateFromCloudSQL,
  fetchCurrentSessionUser,
  logoutSession,
  loginWithFirebaseSession,
  recordAuditLogRemote,
  signInWithGoogle,
  auth,
  updatePresence,
  clearPresence,
  subscribeToPresence
} from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

export default function App() {
  const [state, setState] = useState<AppState>(() => getSeedState());
  const [currentTab, setCurrentTab] = useState<string>('entry');
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return (
        localStorage.getItem('inv_theme') === 'dark' ||
        (!localStorage.getItem('inv_theme') &&
          window.matchMedia('(prefers-color-scheme: dark)').matches)
      );
    } catch {
      return false;
    }
  });

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => {}
  });

  // Apply dark mode class to <html>
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('inv_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('inv_theme', 'light');
    }
  }, [darkMode]);

  const [cloudStatus, setCloudStatus] = useState<'connected' | 'syncing' | 'offline'>('syncing');
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [apiNotice, setApiNotice] = useState<string | null>(null);
  const isRemoteSyncRef = React.useRef(false);
  const saveTimeoutRef = React.useRef<any>(null);

  // Per-session branch location (ensures viewing branch is independent per user and data is shown based on branch)
  const [currentLoc, setCurrentLoc] = useState<string>(() => {
    try {
      const stored = sessionStorage.getItem('inv_current_loc');
      return stored || 'Commissary Takehome';
    } catch {
      return 'Commissary Takehome';
    }
  });
  const currentLocRef = React.useRef(currentLoc);
  useEffect(() => {
    currentLocRef.current = currentLoc;
  }, [currentLoc]);

  const handleSelectLoc = (loc: string) => {
    setCurrentLoc(loc);
    sessionStorage.setItem('inv_current_loc', loc);
  };

  // Verify server session on boot (never trust unverified sessionStorage)
  useEffect(() => {
    let active = true;
    const unsubAuth = onAuthStateChanged(auth, u => {
      if (active) setFirebaseUser(u);
    });

    fetchCurrentSessionUser()
      .then(user => {
        if (!active) return;
        if (user) {
          try {
            const prevUid = localStorage.getItem('inv_cached_uid');
            if (prevUid && prevUid !== String(user.id)) {
              localStorage.removeItem(KEY);
              sessionStorage.removeItem('inv_current_loc');
            }
            localStorage.setItem('inv_cached_uid', String(user.id));
          } catch {}
          setAuthenticatedUser(user);
          setState(loadState());
        } else {
          try {
            sessionStorage.removeItem('inv_current_loc');
          } catch {}
        }
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });

    return () => {
      active = false;
      unsubAuth();
    };
  }, []);

  // Initialize database sync & multi-user presence ONLY after authentication succeeds
  useEffect(() => {
    if (!authenticatedUser) return;

    testConnection();

    fetchStateFromCloudSQL().then(sqlState => {
      if (sqlState && typeof sqlState === 'object') {
        isRemoteSyncRef.current = true;
        setState(prev => mergeStates(prev, sqlState, currentLocRef.current));
        setCloudStatus('connected');
        setTimeout(() => {
          isRemoteSyncRef.current = false;
        }, 150);
      }
    });

    const unsubFirestore = subscribeToFirestoreState(
      remoteState => {
        if (remoteState && typeof remoteState === 'object') {
          isRemoteSyncRef.current = true;
          setState(prev => mergeStates(prev, remoteState, currentLocRef.current));
          setCloudStatus('connected');
          setTimeout(() => {
            isRemoteSyncRef.current = false;
          }, 150);
        }
      },
      () => {
        if (canUserEditData(authenticatedUser)) {
          const initial = loadState();
          saveStateToCloudSQL(initial, authenticatedUser.name || authenticatedUser.user)
            .then(() => setCloudStatus('connected'))
            .catch(() => setCloudStatus('offline'));
          saveStateToFirestore(initial, authenticatedUser.name || authenticatedUser.user).catch(() => {});
        }
      }
    );

    const unsubPresence = subscribeToPresence(active => {
      setOnlineUsers(active);
    });

    return () => {
      unsubFirestore();
      unsubPresence();
    };
  }, [authenticatedUser?.id]);

  // Save state to local cache only while authenticated
  useEffect(() => {
    if (authenticatedUser) {
      saveState(state);
    }
  }, [state, authenticatedUser]);

  // Current user resolution
  const currentUser: User | null = authenticatedUser
    ? (state.users.find(u => u.id === authenticatedUser.id) || authenticatedUser)
    : null;
  const currentUserId: number | null = currentUser?.id ?? null;

  // Sync user location permission with active branch view
  useEffect(() => {
    if (!currentUser) return;
    if (!currentUser.all && currentUser.locs && currentUser.locs.length > 0) {
      if (!currentUser.locs.includes(currentLoc)) {
        const fallback = currentUser.locs[0];
        setCurrentLoc(fallback);
        sessionStorage.setItem('inv_current_loc', fallback);
      }
    }
  }, [currentUser?.id, currentUser?.all, currentUser?.locs, currentLoc]);

  // Live multi-user presence heartbeat (broadcasts activity every 15s to all 10 users)
  useEffect(() => {
    if (!currentUser) return;

    const sendHeartbeat = () => {
      updatePresence({
        id: String(currentUser.id),
        userId: currentUser.id,
        name: currentUser.name || currentUser.user || `Staff #${currentUser.id}`,
        user: currentUser.user,
        loc: currentLoc,
        tab: currentTab,
        shift: state.vf || 'AM',
        date: state.vd || state.start,
        lastSeen: Date.now()
      });
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 25000);

    const handleBeforeUnload = () => {
      clearPresence(currentUser.id);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [
    currentUser?.id,
    currentUser?.name,
    currentUser?.user,
    currentLoc,
    currentTab,
    state.vf,
    state.vd,
    state.start
  ]);

  // Permissions helpers with defensive array checks
  const canAccessLocation = (loc: string): boolean => {
    if (!currentUser) return true;
    return currentUser.all || (currentUser.locs || []).includes(loc);
  };

  const isUserAdmin = (u: User | null): boolean => {
    if (!u) return false;
    const acc = u.acc || [];
    const res = u.res || [];
    return (
      u.isOwner === true ||
      u.email === 'em.nalo92@gmail.com' ||
      (u.all && acc.includes('All') && !acc.includes('View Only') && res.length === 0) ||
      u.user === 'admin' ||
      u.user === 'enalo' ||
      u.id === 1 ||
      u.id === 999
    );
  };

  const canAdmin =
    Boolean(currentUser) &&
    (isUserAdmin(currentUser) ||
      (((currentUser!.acc || []).includes('All') || (currentUser!.acc || []).includes('User Access')) &&
        !(currentUser!.res || []).includes('Restrict User Access')));

  const canAccessTab = (tabId: string): boolean => {
    return canUserAccessTab(currentUser, tabId);
  };

  const canEditData = (): boolean => {
    return canUserEditData(currentUser);
  };

  const canChangeSetting = (settingName: string): boolean => {
    if (!currentUser) return true;
    const acc = currentUser.acc || [];
    const res = currentUser.res || [];
    const hasAccess = acc.includes('All') || acc.includes(settingName);
    const hasRestriction =
      res.includes(settingName) ||
      res.includes(`Restrict ${settingName}`) ||
      (settingName !== 'Inventory Location' && res.includes('Restrict Setup'));
    return hasAccess && !hasRestriction;
  };

  const availableLocations = currentUser?.all
    ? state.locs
    : state.locs.filter(l => (currentUser?.locs || []).includes(l));

  // Auto-carryover effect when viewing data entry or switching branch (authenticated editors only)
  useEffect(() => {
    if (!currentUser || !canUserEditData(currentUser)) return;
    if (currentTab === 'entry') {
      const targetDate = state.vd || state.start || today();
      const targetShift: 'AM' | 'PM' = state.vf === 'PM' ? 'PM' : 'AM';
      setState(prev => {
        const cleanedRows = cleanupStrayGeneratedRows(prev.rows, currentLoc);
        const withCarry = autoCarryOver({ ...prev, inv: currentLoc, rows: cleanedRows }, targetDate, targetShift);
        if (withCarry.length !== prev.rows.length) {
          const diff = withCarry.length - prev.rows.length;
          const logEntry: LogEntry = {
            id: rnd(),
            t: new Date().toISOString(),
            u: currentUser ? currentUser.name : '(system)',
            tab: 'entry',
            act: 'Carried over',
            desc: `${diff} item(s) carried forward to ${fd(targetDate)} (${targetShift} Shift)`,
            date: targetDate,
            loc: currentLoc
          };
          const next = {
            ...prev,
            rows: withCarry,
            log: diff > 0 ? [...prev.log, logEntry] : prev.log
          };

          if (!isRemoteSyncRef.current) {
            setCloudStatus('syncing');
            const author = currentUser?.name || firebaseUser?.email || undefined;
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => {
              saveStateToCloudSQL(next, author)
                .then(() => setCloudStatus('connected'))
                .catch(() => setCloudStatus('offline'));
              saveStateToFirestore(next, author).catch(() => {});
            }, 600);
          }

          return next;
        }
        return prev;
      });
    }
  }, [currentTab, state.vd, state.vf, currentLoc, currentUser?.id]);

  // Central state updater with debounced synchronization for concurrency
  const handleUpdateState = (
    updater: (prev: AppState) => AppState,
    actionDescription?: string
  ) => {
    if (!currentUser) return;
    setState(prev => {
      const next = updater(prev);
      if (actionDescription) {
        const entry: LogEntry = {
          id: rnd(),
          t: new Date().toISOString(),
          u: currentUser ? currentUser.name : (firebaseUser?.displayName || firebaseUser?.email || '(system)'),
          tab: currentTab.startsWith('w') ? 'summary' : currentTab,
          act: actionDescription.includes('deleted')
            ? 'Deleted'
            : actionDescription.includes('added')
            ? 'Added'
            : actionDescription.includes('Imported')
            ? 'Imported'
            : 'Changed',
          desc: actionDescription,
          date: next.vd || next.start,
          loc: currentLoc
        };
        next.log = [...(next.log || []), entry];
      }

      if (!isRemoteSyncRef.current) {
        setCloudStatus('syncing');
        const author = currentUser?.name || firebaseUser?.email || undefined;
        // Debounce network writes to coalesce rapid changes across 10 simultaneous users
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          saveStateToCloudSQL(next, author)
            .then(() => setCloudStatus('connected'))
            .catch(() => setCloudStatus('offline'));
          saveStateToFirestore(next, author).catch(() => {});
        }, 600);
      }

      return next;
    });
  };

  const handleAskConfirm = (message: string, onConfirmAction: () => void) => {
    setConfirmDialog({
      isOpen: true,
      message,
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        onConfirmAction();
      }
    });
  };

  const handleLoginSuccess = (userObj: User) => {
    try {
      const prevUid = localStorage.getItem('inv_cached_uid');
      if (prevUid && prevUid !== String(userObj.id)) {
        localStorage.removeItem(KEY);
        sessionStorage.removeItem('inv_current_loc');
      }
      localStorage.setItem('inv_cached_uid', String(userObj.id));
    } catch {}

    setAuthenticatedUser(userObj);
    setAuthChecked(true);
    setState(loadState());

    // If active location is not in user's permitted locations, switch to first available
    const locs = userObj.locs || [];
    if (!userObj.all && locs.length > 0 && !locs.includes(currentLoc)) {
      const fallback = locs[0];
      setCurrentLoc(fallback);
      sessionStorage.setItem('inv_current_loc', fallback);
    }

    // If current tab is not permitted for this user, switch to their first permitted tab
    if (!canUserAccessTab(userObj, currentTab)) {
      const allTabIds = ['entry', 'w1', 'w2', 'w3', 'w4', 'w5', 'mo', 'cash', 'pnl', 'tf', 'tt', 'soldout', 'master', 'drive', 'users', 'setup'];
      const firstAllowed = allTabIds.find(id => canUserAccessTab(userObj, id));
      if (firstAllowed) {
        setCurrentTab(firstAllowed);
      }
    }

    recordAuditLogRemote({
      tab: 'auth',
      action: 'Sign In',
      description: `User signed in: ${userObj.name || userObj.user}`,
      location: currentLoc
    });
  };

  const handleSignOut = async () => {
    const prevName = currentUser?.name || currentUser?.user || 'User';
    if (currentUser) {
      await recordAuditLogRemote({
        tab: 'auth',
        action: 'Sign Out',
        description: `Signed out (${prevName})`,
        location: currentLoc
      });
      await clearPresence(currentUser.id);
    }
    await logoutSession();
    setAuthenticatedUser(null);
    setOnlineUsers([]);
    try {
      sessionStorage.removeItem('inv_current_loc');
      localStorage.removeItem('inv_cached_uid');
      localStorage.removeItem(KEY);
    } catch {}
    setState(getSeedState());
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-300 text-xs font-medium">
        Verifying secure session...
      </div>
    );
  }

  // If user is not authenticated, render Login view
  if (!currentUser) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  // Location Access Guard
  const locationDenied =
    (currentTab === 'entry' ||
      currentTab === 'tf' ||
      currentTab === 'tt' ||
      currentTab === 'soldout' ||
      currentTab.startsWith('w') ||
      currentTab === 'mo' ||
      currentTab === 'pnl' ||
      currentTab === 'cash') &&
    !canAccessLocation(currentLoc);

  // Tab Access Guard
  const tabDenied = !canAccessTab(currentTab);

  // Effective state scoped to current session location so user view is strictly isolated by branch
  const effectiveState: AppState = {
    ...state,
    inv: currentLoc
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top Header */}
      <Header
        user={currentUser}
        currentLoc={currentLoc}
        startDate={state.start}
        cutDate={state.cut}
        availableLocs={availableLocations}
        canChangeLoc={canChangeSetting('Inventory Location')}
        onSelectLoc={handleSelectLoc}
        onChangePassword={() => setIsPasswordModalOpen(true)}
        onSignOut={handleSignOut}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        cloudStatus={cloudStatus}
        onlineUsers={onlineUsers}
        canAdmin={canAdmin}
        firebaseEmail={firebaseUser?.email}
        onGoogleSignIn={async () => {
          try {
            setApiNotice(null);
            const { user: fbUser } = await signInWithGoogle();
            await loginWithFirebaseSession(fbUser).catch(err => {
              setApiNotice(err?.message || 'Google account synced for Drive, but not linked to an admin ledger profile.');
            });
          } catch (e: any) {
            if (e?.code === 'auth/popup-closed-by-user' || e?.message?.includes('popup-closed-by-user')) {
              return;
            }
            setApiNotice(e?.message || 'Google sign in could not be completed.');
          }
        }}
      />

      {/* Cloud Service Notice Banner if needed */}
      {apiNotice && (
        <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold shrink-0">Cloud Notice:</span>
            <span>
              {apiNotice.includes('https://') ? (
                <>
                  {apiNotice.split('https://')[0]}
                  <a
                    href={`https://${apiNotice.split('https://')[1]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-bold text-teal-800 dark:text-teal-400 ml-1"
                  >
                    Open Google Cloud Console &rarr;
                  </a>
                </>
              ) : (
                apiNotice
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setApiNotice(null)}
            className="text-amber-700 dark:text-amber-400 hover:text-amber-900 font-bold px-2 py-0.5 rounded cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs Navigation */}
      <TabsNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        startDate={state.start}
        cutDate={state.cut}
        canAccessTab={canAccessTab}
      />

      {/* Main Workspace Content Area */}
      <main className="flex-1 w-full max-w-[1920px] mx-auto px-2 sm:px-4 lg:px-6 py-4">
        {locationDenied ? (
          <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-center max-w-lg mx-auto my-12 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 mx-auto flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Location Access Restricted
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Your account (<strong>{currentUser.name}</strong>) does not have access permissions for{' '}
              <strong>{currentLoc}</strong>.
            </p>
            {availableLocations.length > 0 && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Switch to an authorized branch:
                </label>
                <div className="flex flex-wrap justify-center gap-2">
                  {availableLocations.map(loc => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => handleSelectLoc(loc)}
                      className="px-3 py-1.5 text-xs font-semibold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-lg hover:bg-teal-100 transition-colors cursor-pointer"
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : tabDenied ? (
          <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-center max-w-lg mx-auto my-12 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 mx-auto flex items-center justify-center">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Tab Access Restricted
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Your account (<strong>{currentUser.name || currentUser.user}</strong>) does not have authorization to view this tab based on assigned role permissions and security restrictions.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  const allTabIds = ['entry', 'w1', 'w2', 'w3', 'w4', 'w5', 'mo', 'cash', 'pnl', 'tf', 'tt', 'soldout', 'master', 'drive', 'users', 'setup'];
                  const firstAllowed = allTabIds.find(id => canAccessTab(id)) || 'entry';
                  setCurrentTab(firstAllowed);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Go to Authorized Tab &rarr;
              </button>
            </div>
          </div>
        ) : (
          <>
            {currentTab === 'entry' && (
              <DataEntryTab
                state={effectiveState}
                onUpdateState={handleUpdateState}
                canEdit={canEditData()}
                canAdmin={canAdmin && canUserDeleteRows(currentUser)}
                onAskConfirm={handleAskConfirm}
                currentUser={currentUser}
                onlineUsers={onlineUsers}
              />
            )}

            {currentTab.startsWith('w') && (() => {
              const weekNum = parseInt(currentTab.slice(1));
              const a = addDay(state.start, 7 * (weekNum - 1));
              let b = addDay(a, 6);
              if (b > state.cut) b = state.cut;

              return (
                <SummaryViewTab
                  state={effectiveState}
                  title={`Week ${weekNum} Summary`}
                  startDate={a}
                  endDate={b}
                  tabKey={currentTab}
                  canAdmin={canAdmin}
                  onUpdateState={updater => handleUpdateState(updater)}
                  onSelectTab={setCurrentTab}
                />
              );
            })()}

            {currentTab === 'mo' && (
              <SummaryViewTab
                state={effectiveState}
                title="Monthly Summary"
                startDate={state.start}
                endDate={state.cut}
                tabKey="mo"
                canAdmin={canAdmin}
                onUpdateState={updater => handleUpdateState(updater)}
                onSelectTab={setCurrentTab}
              />
            )}

            {currentTab === 'cash' && (
              <CashDetailsSummaryTab
                state={effectiveState}
                canEdit={canEditData() && canUserAdjustCash(currentUser)}
                canAdmin={canAdmin}
                onUpdateState={handleUpdateState}
              />
            )}

            {currentTab === 'pnl' && (
              <ProfitAndLossTab
                state={effectiveState}
                canAdmin={canAdmin}
              />
            )}

            {currentTab === 'tf' && (
              <TransferFromTab
                state={effectiveState}
                canEdit={canEditData()}
                canAdmin={canAdmin}
                onUpdateState={handleUpdateState}
                onNavigateToMonthlySummary={() => setCurrentTab('mo')}
              />
            )}

            {currentTab === 'tt' && (
              <TransferToTab
                state={effectiveState}
                canEdit={canEditData()}
                canAdmin={canAdmin}
                onUpdateState={handleUpdateState}
                onNavigateToMonthlySummary={() => setCurrentTab('mo')}
              />
            )}

            {currentTab === 'soldout' && (
              <ItemsSoldOutSummaryTab
                state={effectiveState}
                canAdmin={canAdmin}
                canChangeLoc={canChangeSetting('Inventory Location')}
                onSelectLoc={handleSelectLoc}
                onNavigateToTab={setCurrentTab}
              />
            )}

            {currentTab === 'master' && (
              <ItemMasterTab
                state={effectiveState}
                canEdit={canEditData() && canUserEditPrices(currentUser)}
                canAdmin={canAdmin && canUserDeleteRows(currentUser)}
                onUpdateState={handleUpdateState}
                onAskConfirm={handleAskConfirm}
              />
            )}

            {currentTab === 'users' && (
              <UsersTab
                state={effectiveState}
                canAdmin={canAdmin}
                onUpdateState={handleUpdateState}
                onAskConfirm={handleAskConfirm}
                onlineUsers={onlineUsers}
                currentUserId={currentUserId}
              />
            )}

            {currentTab === 'setup' && (
              <SetupTab
                state={effectiveState}
                canAdmin={canAdmin && !currentUser?.res?.includes('Restrict Setup')}
                canChangeLoc={canChangeSetting('Inventory Location')}
                canChangeStart={canChangeSetting('Start Date')}
                canChangeCut={canChangeSetting('Cut Off Date')}
                onUpdateState={handleUpdateState}
                onAskConfirm={handleAskConfirm}
              />
            )}

            {currentTab === 'drive' && (
              <GoogleDriveTab
                state={effectiveState}
                firebaseUser={firebaseUser}
                onUpdateState={handleUpdateState}
                onAskConfirm={handleAskConfirm}
              />
            )}
          </>
        )}
      </main>

      {/* Password Modal */}
      <PasswordModal
        isOpen={isPasswordModalOpen}
        user={currentUser}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={updatedUser => {
          setState(prev => ({
            ...prev,
            users: prev.users.map(u => (u.id === updatedUser.id ? updatedUser : u))
          }));
          recordAuditLogRemote({
            tab: 'auth',
            action: 'Password Changed',
            description: `Password changed by ${currentUser.name}`,
            location: currentLoc
          });
        }}
      />

      {/* Confirmation Dialog */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
