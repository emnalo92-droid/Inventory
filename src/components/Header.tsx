import React from 'react';
import {
  Store,
  Calendar,
  User as UserIcon,
  KeyRound,
  LogOut,
  MapPin,
  Moon,
  Sun,
  Cloud,
  Server,
  Users
} from 'lucide-react';
import { User, PresenceUser } from '../types';
import { fd } from '../utils/helpers';
import { ServerInfoModal } from './ServerInfoModal';

interface HeaderProps {
  user: User | null;
  currentLoc: string;
  startDate: string;
  cutDate: string;
  availableLocs: string[];
  canChangeLoc: boolean;
  onSelectLoc: (loc: string) => void;
  onChangePassword: () => void;
  onSignOut: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  cloudStatus?: 'connected' | 'syncing' | 'offline';
  firebaseEmail?: string | null;
  onGoogleSignIn?: () => void;
  onlineUsers?: PresenceUser[];
}

export const Header: React.FC<HeaderProps> = ({
  user,
  currentLoc,
  startDate,
  cutDate,
  availableLocs,
  canChangeLoc,
  onSelectLoc,
  onChangePassword,
  onSignOut,
  darkMode,
  onToggleDarkMode,
  cloudStatus = 'connected',
  firebaseEmail,
  onGoogleSignIn,
  onlineUsers = []
}) => {
  const [showUsersPopover, setShowUsersPopover] = React.useState(false);
  const [showServerModal, setShowServerModal] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowUsersPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs">
      <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand & Wordmark */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight truncate">
                Candy Store & Takehome Inventory
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1 font-medium text-teal-800 dark:text-teal-400">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{currentLoc || 'No Location'}</span>
                </span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 shrink-0" />
                  <span>
                    {fd(startDate)} to {fd(cutDate)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Windows Host Server & Network Manager Button */}
            <button
              type="button"
              onClick={() => setShowServerModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors cursor-pointer shadow-2xs"
              title="Windows Host Server & Local Store Wi-Fi Network Info"
            >
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              <Server className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Host Server</span>
            </button>

            {/* Live Multi-user Presence Indicator */}
            <div className="relative" ref={popoverRef}>
              <button
                type="button"
                onClick={() => setShowUsersPopover(prev => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 transition-colors cursor-pointer"
                title="Active team members currently recording or viewing data"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Users className="w-3.5 h-3.5" />
                <span>
                  {Math.max(1, onlineUsers.length)} Online
                </span>
              </button>

              {/* Multi-user live session popup */}
              {showUsersPopover && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 z-50 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                    <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-emerald-600" />
                      Active Staff (Simultaneous)
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold px-1.5 py-0.5 rounded">
                      Live Sync
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {onlineUsers.length > 0 ? (
                      onlineUsers.map(sess => (
                        <div
                          key={sess.id}
                          className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {sess.name}
                              {user?.id === sess.userId && (
                                <span className="ml-1 text-[10px] text-teal-600 dark:text-teal-400">(You)</span>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {sess.tab === 'entry'
                                ? `Data Entry · ${sess.loc}`
                                : sess.tab === 'users'
                                ? 'User Access'
                                : `${sess.tab} · ${sess.loc}`}
                            </p>
                          </div>
                          <span className="shrink-0 w-2 h-2 rounded-full bg-emerald-500" title="Active now" />
                        </div>
                      ))
                    ) : (
                      <div className="p-2 text-center text-slate-500">
                        <p className="font-medium text-slate-700 dark:text-slate-300">{user?.name || 'Current User'} (You)</p>
                        <p className="text-[10px]">Recording live on {currentLoc}</p>
                      </div>
                    )}
                  </div>

                  <p className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 text-center">
                    Up to 10 staff can record data simultaneously without overwriting.
                  </p>
                </div>
              )}
            </div>

            {/* Cloud Sync Status */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              title={
                cloudStatus === 'connected'
                  ? `Firebase Firestore Synced${firebaseEmail ? ` (${firebaseEmail})` : ''}`
                  : cloudStatus === 'syncing'
                  ? 'Syncing with Firestore...'
                  : 'Offline Cache Active'
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  cloudStatus === 'connected'
                    ? 'bg-emerald-500'
                    : cloudStatus === 'syncing'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-rose-400'
                }`}
              />
              <Cloud className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
              <span className="hidden sm:inline text-slate-700 dark:text-slate-300">
                {cloudStatus === 'connected' ? 'Cloud Synced' : cloudStatus === 'syncing' ? 'Syncing...' : 'Local Cache'}
              </span>
            </div>

            {/* Google Account Link if not signed in */}
            {!firebaseEmail && onGoogleSignIn && (
              <button
                type="button"
                onClick={onGoogleSignIn}
                className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs cursor-pointer"
                title="Sign in with Google to link Firebase identity"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Google</span>
              </button>
            )}

            {canChangeLoc && availableLocs.length > 1 && (
              <div className="hidden md:flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                <label htmlFor="quick-loc-select" className="text-slate-500 text-[11px] font-medium">
                  Branch:
                </label>
                <select
                  id="quick-loc-select"
                  value={currentLoc}
                  onChange={e => onSelectLoc(e.target.value)}
                  className="bg-transparent font-medium text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                >
                  {availableLocs.map(l => (
                    <option key={l} value={l} className="dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Dark mode toggle */}
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                <div className="hidden lg:flex flex-col text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                      {user.name || user.user}
                    </span>
                    {(user.isOwner || user.id === 1 || user.user === 'enalo' || user.email === 'em.nalo92@gmail.com') && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                        Owner
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {user.isOwner || user.id === 1 || user.user === 'enalo' || user.email === 'em.nalo92@gmail.com'
                      ? 'Project Owner & Admin'
                      : user.all
                      ? 'Administrator'
                      : user.acc.includes('View Only')
                      ? 'View Only'
                      : 'Staff'}
                  </span>
                </div>

                <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs shrink-0">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>

                <button
                  type="button"
                  onClick={onChangePassword}
                  className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs transition-colors cursor-pointer"
                  title="Change Password"
                >
                  <KeyRound className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-rose-700 bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <ServerInfoModal isOpen={showServerModal} onClose={() => setShowServerModal(false)} />
    </header>
  );
};
