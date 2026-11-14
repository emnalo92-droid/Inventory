import React, { useState, useEffect } from 'react';
import {
  Shield,
  UserPlus,
  Key,
  Eye,
  EyeOff,
  Check,
  X,
  Trash2,
  CheckCircle,
  AlertCircle,
  Sliders,
  Lock,
  Unlock,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';
import { AppState, User } from '../types';
import { adminSetUserPassword, adminCreateUser } from '../firebase';
import { validateClientPassword } from '../utils/helpers';
import { ChangeHistory } from './ChangeHistory';
import {
  SYSTEM_TABS,
  TAB_ACCESS_OPTIONS,
  RESTRICTION_OPTIONS,
  ROLE_PRESETS,
  RolePreset,
  canUserAccessTab
} from '../utils/permissions';
import { PresenceUser } from '../types';

interface UsersTabProps {
  state: AppState;
  canAdmin: boolean;
  onUpdateState: (updater: (prev: AppState) => AppState, actionDescription?: string) => void;
  onAskConfirm: (message: string, onConfirm: () => void) => void;
  onlineUsers?: PresenceUser[];
  currentUserId?: number | null;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  state,
  canAdmin,
  onUpdateState,
  onAskConfirm,
  onlineUsers = [],
  currentUserId
}) => {
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  // Tracks which user and field is currently focused to avoid clobbering active keystrokes
  const [activeEditingField, setActiveEditingField] = useState<{ id: number; field: 'name' | 'user' } | null>(null);

  // Local draft state for smooth typing without Firestore snapshot race conditions
  const [localUsers, setLocalUsers] = useState<User[]>(() =>
    state.users.map(u => ({
      ...u,
      locs: Array.isArray(u.locs) ? u.locs : [],
      acc: Array.isArray(u.acc) ? u.acc : ['View Only'],
      res: Array.isArray(u.res) ? u.res : [],
      name: u.name || '',
      user: u.user || ''
    }))
  );

  // Live synchronization: Immediately adopt remote database user state across all clients
  // preserving only the exact field that the administrator is actively typing in
  useEffect(() => {
    setLocalUsers(prev => {
      return state.users.map(su => {
        const local = prev.find(p => p.id === su.id);
        const isEditingName = activeEditingField?.id === su.id && activeEditingField.field === 'name';
        const isEditingUser = activeEditingField?.id === su.id && activeEditingField.field === 'user';
        return {
          ...su,
          name: isEditingName && local && local.name !== undefined ? local.name : (su.name || ''),
          user: isEditingUser && local && local.user !== undefined ? local.user : (su.user || ''),
          locs: Array.isArray(su.locs) ? su.locs : [],
          acc: Array.isArray(su.acc) ? su.acc : ['View Only'],
          res: Array.isArray(su.res) ? su.res : []
        };
      });
    });
  }, [state.users, activeEditingField]);

  // Modal state for Setting Password
  const [passwordModalUser, setPasswordModalUser] = useState<User | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [confirmPasswordVal, setConfirmPasswordVal] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [passwordModalError, setPasswordModalError] = useState('');

  // Modal state for Comprehensive Permissions Configuration (Tabs Access + Restrictions)
  const [permModalUser, setPermModalUser] = useState<User | null>(null);
  const [permDraftAcc, setPermDraftAcc] = useState<string[]>([]);
  const [permDraftRes, setPermDraftRes] = useState<string[]>([]);
  const [permDraftAllLocs, setPermDraftAllLocs] = useState(false);
  const [permDraftLocs, setPermDraftLocs] = useState<string[]>([]);
  const [permActiveSubtab, setPermActiveSubtab] = useState<'tabs' | 'restrictions' | 'locations'>('tabs');

  // Modal state for Adding New User
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addAllLocs, setAddAllLocs] = useState(false);
  const [addLocs, setAddLocs] = useState<string[]>([]);
  const [addAcc, setAddAcc] = useState<string[]>(['Data Entry', 'Cash Details Summary']);
  const [addRes, setAddRes] = useState<string[]>([]);
  const [addError, setAddError] = useState('');

  // Inline password draft map by userId
  const [inlinePwDraft, setInlinePwDraft] = useState<Record<number, string>>({});

  const showNotification = (text: string, isError = false) => {
    setMsg({ text, error: isError });
    setTimeout(() => {
      setMsg(null);
    }, 4000);
  };

  // Commit updated user object to parent state and persistent cloud backends
  const commitUserUpdate = (updatedUser: User, actionDesc?: string) => {
    onUpdateState(prev => ({
      ...prev,
      users: prev.users.map(u => (u.id === updatedUser.id ? updatedUser : u))
    }), actionDesc);
  };

  // --- Handlers for Location Access ---
  const handleToggleAllLocations = (userId: number, checked: boolean) => {
    const target = localUsers.find(u => u.id === userId);
    if (!target) return;

    const updated: User = {
      ...target,
      all: checked,
      locs: checked ? [] : (target.locs.length > 0 ? target.locs : [state.inv])
    };

    setLocalUsers(prev => prev.map(u => (u.id === userId ? updated : u)));
    commitUserUpdate(updated, `Updated Location Access for ${target.name || target.user}: ${checked ? 'All Locations' : 'Specific Branches'}`);
    showNotification(`Location Access updated for ${target.name || target.user}`);
  };

  const handleToggleSpecificLocation = (userId: number, loc: string, checked: boolean) => {
    const target = localUsers.find(u => u.id === userId);
    if (!target) return;

    const currentLocs = Array.isArray(target.locs) ? target.locs : [];
    const newLocs = checked
      ? [...new Set([...currentLocs, loc])]
      : currentLocs.filter(l => l !== loc);

    const updated: User = {
      ...target,
      all: false,
      locs: newLocs
    };

    setLocalUsers(prev => prev.map(u => (u.id === userId ? updated : u)));
    commitUserUpdate(updated, `Updated permitted branches for ${target.name || target.user}`);
    showNotification(`Branch access updated for ${target.name || target.user}`);
  };

  // --- Handlers for Access Privileges ---
  const handleToggleAccess = (userId: number, accessVal: string, checked: boolean) => {
    const target = localUsers.find(u => u.id === userId);
    if (!target) return;

    const currentAcc = Array.isArray(target.acc) ? target.acc : [];
    let nextAcc: string[];

    if (accessVal === 'All') {
      nextAcc = checked ? ['All'] : ['Data Entry'];
    } else {
      const filtered = currentAcc.filter(a => a !== 'All');
      if (checked) {
        nextAcc = [...new Set([...filtered, accessVal])];
      } else {
        nextAcc = filtered.filter(a => a !== accessVal);
        if (nextAcc.length === 0) nextAcc = ['View Only'];
      }
    }

    const updated: User = {
      ...target,
      acc: nextAcc
    };

    setLocalUsers(prev => prev.map(u => (u.id === userId ? updated : u)));
    commitUserUpdate(updated, `Updated Access privileges for ${target.name || target.user}: ${nextAcc.join(', ')}`);
    showNotification(`Access privileges updated for ${target.name || target.user}`);
  };

  // --- Handlers for Restrictions ---
  const handleToggleRestriction = (userId: number, resVal: string, checked: boolean) => {
    const target = localUsers.find(u => u.id === userId);
    if (!target) return;

    const currentRes = Array.isArray(target.res) ? target.res : [];
    const nextRes = checked
      ? [...new Set([...currentRes, resVal])]
      : currentRes.filter(r => r !== resVal);

    const updated: User = {
      ...target,
      res: nextRes
    };

    setLocalUsers(prev => prev.map(u => (u.id === userId ? updated : u)));
    commitUserUpdate(updated, `Updated Restrictions for ${target.name || target.user}`);
    showNotification(`Restrictions updated for ${target.name || target.user}`);
  };

  // --- Handlers for Employee Name & Username ---
  const handleNameInputChange = (userId: number, newName: string) => {
    setLocalUsers(prev =>
      prev.map(u => (u.id === userId ? { ...u, name: newName } : u))
    );
  };

  const handleNameInputBlur = (userId: number) => {
    const target = localUsers.find(u => u.id === userId);
    if (!target) return;
    const original = state.users.find(u => u.id === userId);
    if (original && original.name === target.name) return;

    commitUserUpdate(target, `Updated employee name to "${target.name}"`);
    showNotification(`Employee name saved for user #${userId}`);
  };

  const handleUsernameInputChange = (userId: number, newUsername: string) => {
    setLocalUsers(prev =>
      prev.map(u => (u.id === userId ? { ...u, user: newUsername } : u))
    );
  };

  const handleUsernameInputBlur = (userId: number) => {
    const target = localUsers.find(u => u.id === userId);
    if (!target) return;
    const clean = target.user.trim().toLowerCase();

    if (!clean) {
      showNotification('Username cannot be empty.', true);
      const orig = state.users.find(u => u.id === userId);
      setLocalUsers(prev => prev.map(u => (u.id === userId ? { ...u, user: orig?.user || '' } : u)));
      return;
    }

    const isDuplicate = state.users.some(
      u => u.id !== userId && u.user.toLowerCase() === clean
    );

    if (isDuplicate) {
      showNotification(`Username "${clean}" is already in use by another user.`, true);
      const orig = state.users.find(u => u.id === userId);
      setLocalUsers(prev => prev.map(u => (u.id === userId ? { ...u, user: orig?.user || '' } : u)));
      return;
    }

    const updated = { ...target, user: clean };
    setLocalUsers(prev => prev.map(u => (u.id === userId ? updated : u)));
    commitUserUpdate(updated, `Changed username to "${clean}"`);
    showNotification(`Username updated to "${clean}"`);
  };

  // --- Handlers for Password ---
  const handleOpenPasswordModal = (user: User) => {
    setPasswordModalUser(user);
    setNewPasswordVal('');
    setConfirmPasswordVal('');
    setPasswordModalError('');
    setShowPasswordText(false);
  };

  const handleSavePasswordModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalUser) return;
    setPasswordModalError('');

    const pw = newPasswordVal.trim();
    const pwError = validateClientPassword(pw);
    if (pwError) {
      setPasswordModalError(pwError);
      return;
    }

    if (pw !== confirmPasswordVal.trim()) {
      setPasswordModalError('Passwords do not match.');
      return;
    }

    try {
      const updated = await adminSetUserPassword(passwordModalUser.id, pw);
      setLocalUsers(prev => prev.map(u => (u.id === updated.id ? updated : u)));
      commitUserUpdate(updated, `Reset password for user "${passwordModalUser.name || passwordModalUser.user}"`);
      setPasswordModalUser(null);
      showNotification(`Password successfully updated for ${updated.name || updated.user}!`);
    } catch (err: any) {
      setPasswordModalError(err?.message || 'Failed to update password on server.');
    }
  };

  const handleQuickInlinePasswordSave = async (userId: number) => {
    const rawPw = inlinePwDraft[userId];
    if (!rawPw || rawPw.trim().length === 0) return;

    const pw = rawPw.trim();
    const pwError = validateClientPassword(pw);
    if (pwError) {
      showNotification(pwError, true);
      return;
    }

    const target = localUsers.find(u => u.id === userId);
    if (!target) return;

    try {
      const updated = await adminSetUserPassword(userId, pw);
      setLocalUsers(prev => prev.map(u => (u.id === userId ? updated : u)));
      commitUserUpdate(updated, `Saved password for ${target.name || target.user}`);
      setInlinePwDraft(prev => ({ ...prev, [userId]: '' }));
      showNotification(`Password saved for ${target.name || target.user}!`);
    } catch (err: any) {
      showNotification(err?.message || 'Failed to save password on server.', true);
    }
  };

  // --- Open Detailed Permissions Modal ---
  const handleOpenPermissionsModal = (user: User, initialSubtab: 'tabs' | 'restrictions' | 'locations' = 'tabs') => {
    setPermModalUser(user);
    setPermDraftAcc(Array.isArray(user.acc) ? [...user.acc] : ['View Only']);
    setPermDraftRes(Array.isArray(user.res) ? [...user.res] : []);
    setPermDraftAllLocs(Boolean(user.all));
    setPermDraftLocs(Array.isArray(user.locs) ? [...user.locs] : []);
    setPermActiveSubtab(initialSubtab);
  };

  const handleApplyRolePresetToPermModal = (preset: RolePreset) => {
    setPermDraftAllLocs(preset.allLocs);
    if (!preset.allLocs && permDraftLocs.length === 0) {
      setPermDraftLocs([state.inv]);
    }
    setPermDraftAcc([...preset.acc]);
    setPermDraftRes([...preset.res]);
    showNotification(`Applied preset "${preset.name}"`);
  };

  const handleSavePermissionsModal = () => {
    if (!permModalUser) return;

    const updated: User = {
      ...permModalUser,
      all: permDraftAllLocs,
      locs: permDraftAllLocs ? [] : permDraftLocs,
      acc: permDraftAcc.length > 0 ? permDraftAcc : ['View Only'],
      res: permDraftRes
    };

    setLocalUsers(prev => prev.map(u => (u.id === updated.id ? updated : u)));
    commitUserUpdate(
      updated,
      `Updated Tab Access & Restrictions for ${updated.name || updated.user} (${updated.acc.length} permissions, ${updated.res.length} restrictions)`
    );
    setPermModalUser(null);
    showNotification(`Permissions saved for ${updated.name || updated.user}!`);
  };

  // --- Handlers for Adding User ---
  const handleOpenAddUserModal = () => {
    setAddName('');
    setAddUsername('');
    setAddPassword('');
    setAddAllLocs(false);
    setAddLocs(state.locs.length > 0 ? [state.locs[0]] : []);
    setAddAcc(['Data Entry', 'Cash Details Summary']);
    setAddRes([]);
    setAddError('');
    setIsAddUserModalOpen(true);
  };

  const handleApplyRolePresetToAddModal = (preset: RolePreset) => {
    setAddAllLocs(preset.allLocs);
    if (!preset.allLocs && addLocs.length === 0) {
      setAddLocs([state.inv]);
    }
    setAddAcc([...preset.acc]);
    setAddRes([...preset.res]);
  };

  const handleCreateNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    const cleanName = addName.trim();
    const cleanUser = addUsername.trim().toLowerCase();
    const cleanPw = addPassword.trim();

    if (!cleanName) {
      setAddError('Please enter an employee name.');
      return;
    }

    if (!cleanUser) {
      setAddError('Please enter a username.');
      return;
    }

    const isTaken = state.users.some(u => u.user && u.user.toLowerCase() === cleanUser);
    if (isTaken) {
      setAddError(`Username "${cleanUser}" is already taken.`);
      return;
    }

    const pwError = validateClientPassword(cleanPw);
    if (pwError) {
      setAddError(pwError);
      return;
    }

    try {
      const newUser = await adminCreateUser({
        name: cleanName,
        user: cleanUser,
        password: cleanPw,
        all: addAllLocs,
        locs: addAllLocs ? [] : addLocs,
        acc: addAcc.length > 0 ? addAcc : ['View Only'],
        res: addRes
      });

      onUpdateState(
        prev => ({
          ...prev,
          users: prev.users.some(u => u.id === newUser.id)
            ? prev.users.map(u => (u.id === newUser.id ? newUser : u))
            : [...prev.users, newUser]
        }),
        `Created new user "${cleanName}" (@${cleanUser})`
      );

      setIsAddUserModalOpen(false);
      showNotification(`User "${cleanName}" created successfully!`);
    } catch (err: any) {
      setAddError(err?.message || 'Failed to create user on server.');
    }
  };

  // --- Handler for Deleting User ---
  const handleDeleteUser = (userId: number) => {
    const target = state.users.find(x => x.id === userId);
    if (target?.isOwner || target?.id === 1 || target?.user === 'enalo' || target?.email === 'em.nalo92@gmail.com') {
      showNotification('The Project Owner account cannot be removed.', true);
      return;
    }
    const name = target?.name || target?.user || `User #${userId}`;

    onAskConfirm(`Remove user "${name}" from system access? This action cannot be undone.`, () => {
      onUpdateState(
        prev => ({
          ...prev,
          users: prev.users.filter(x => x.id !== userId)
        }),
        `User removed: ${name}`
      );
      showNotification(`User "${name}" has been removed.`);
    });
  };

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Shield className="w-5 h-5 text-teal-700 dark:text-teal-400" />
              <span>User Access & Role Permissions</span>
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              10 Simultaneous Users Supported
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure employee credentials, location privileges, tab-level access rights, and security restrictions. Multiple users record data simultaneously in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canAdmin && (
            <button
              type="button"
              onClick={handleOpenAddUserModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add New User</span>
            </button>
          )}
        </div>
      </div>

      {/* Floating Status Notification */}
      {msg && (
        <div
          className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between gap-2 shadow-xs transition-all ${
            msg.error
              ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
              : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.error ? <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" /> : <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />}
            <span>{msg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setMsg(null)}
            className="text-slate-500 hover:text-slate-800 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Quick Role Templates Guide / Highlights */}
      <div className="bg-gradient-to-r from-teal-50/60 via-slate-50 to-slate-100/70 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/80 p-3.5 rounded-xl border border-teal-200/60 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-teal-600 text-white shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Simultaneous Multi-User Recording Enabled
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Up to 10 staff can record data concurrently across branches and shifts without overwriting each other. Changes sync automatically in real-time.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ROLE_PRESETS.map(preset => (
            <span
              key={preset.id}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 shadow-2xs"
            >
              {preset.name}
            </span>
          ))}
        </div>
      </div>

      {/* Users Matrix Table */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse ledger-table font-sans">
            <thead className="bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold border-b border-slate-300 dark:border-slate-700">
              <tr>
                <th className="py-2.5 px-2 text-center w-12 border-r border-slate-300 dark:border-slate-700">
                  Line #
                </th>
                <th className="py-2.5 px-3 text-left w-52 border-r border-slate-300 dark:border-slate-700">
                  Employee & Status
                </th>
                <th className="py-2.5 px-3 text-left min-w-[200px] border-r border-slate-300 dark:border-slate-700">
                  Location Access
                </th>
                <th className="py-2.5 px-3 text-left min-w-[260px] border-r border-slate-300 dark:border-slate-700">
                  Tab Access Privileges
                </th>
                <th className="py-2.5 px-3 text-left min-w-[230px] border-r border-slate-300 dark:border-slate-700">
                  Restrictions & Safeguards
                </th>
                <th className="py-2.5 px-3 text-left w-36 border-r border-slate-300 dark:border-slate-700">
                  Username
                </th>
                <th className="py-2.5 px-3 text-left w-52 border-r border-slate-300 dark:border-slate-700">
                  Password Management
                </th>
                {canAdmin && <th className="py-2.5 px-2 w-12 text-center">Delete</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {localUsers.map((u, idx) => {
                const uLocs = Array.isArray(u.locs) ? u.locs : [];
                const uAcc = Array.isArray(u.acc) ? u.acc : ['View Only'];
                const uRes = Array.isArray(u.res) ? u.res : [];
                const isAllAcc = uAcc.includes('All');
                const activeSession = onlineUsers.find(s => s.userId === u.id);
                const isOnline = Boolean(activeSession);
                const isCurrent = currentUserId === u.id;

                return (
                  <tr key={u.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                    isCurrent ? 'bg-teal-50/40 dark:bg-teal-950/20' : ''
                  }`}>
                    {/* Line # */}
                    <td className="py-3 px-2 text-center font-mono tabular-nums text-slate-500 border-r border-slate-200 dark:border-slate-800 align-top pt-3.5">
                      {idx + 1}
                    </td>

                    {/* Employee Name & Live Status */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800 align-top">
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          disabled={!canAdmin}
                          value={u.name}
                          onFocus={() => setActiveEditingField({ id: u.id, field: 'name' })}
                          onChange={e => handleNameInputChange(u.id, e.target.value)}
                          onBlur={() => {
                            setActiveEditingField(null);
                            handleNameInputBlur(u.id);
                          }}
                          placeholder="e.g. Maria Santos"
                          className="w-full px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-teal-500 focus:border-teal-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-600 shadow-2xs"
                        />
                        <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                          <span>User #{u.id}</span>
                          {u.isOwner || u.id === 1 || u.user === 'enalo' || u.email === 'em.nalo92@gmail.com' ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-700">
                              <span>👑</span>
                              <span>Project Owner</span>
                            </span>
                          ) : u.user === 'admin' || u.all ? (
                            <span className="text-teal-600 dark:text-teal-400 font-semibold">Superadmin</span>
                          ) : null}
                        </div>

                        {/* Live Presence & Login Credential Badge */}
                        <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                          {isOnline ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Active · {activeSession?.loc?.split(' ')[0] || 'Online'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                              <span>Offline</span>
                            </span>
                          )}

                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700" title="Manually type this Employee Name into the login prompt">
                            Login: {u.name || u.user}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Location Access */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800 align-top">
                      <div className="space-y-1.5 bg-slate-50/70 dark:bg-slate-800/30 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800">
                        <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-900 dark:text-slate-100 select-none">
                          <input
                            type="checkbox"
                            disabled={!canAdmin}
                            checked={Boolean(u.all)}
                            onChange={e => handleToggleAllLocations(u.id, e.target.checked)}
                            className="rounded text-teal-700 focus:ring-teal-600 w-3.5 h-3.5 cursor-pointer"
                          />
                          <span>All Locations</span>
                        </label>

                        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-700">
                          {state.locs.map(loc => (
                            <label
                              key={loc}
                              className={`flex items-center gap-1.5 text-[11px] select-none ${
                                u.all ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                disabled={!canAdmin || Boolean(u.all)}
                                checked={Boolean(u.all || uLocs.includes(loc))}
                                onChange={e => handleToggleSpecificLocation(u.id, loc, e.target.checked)}
                                className="rounded text-teal-600 focus:ring-teal-500 w-3 h-3 cursor-pointer"
                              />
                              <span>{loc}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </td>

                    {/* Access Privileges & Allowed Tabs */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800 align-top">
                      <div className="space-y-2 bg-slate-50/70 dark:bg-slate-800/30 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-1 pb-1 border-b border-slate-200 dark:border-slate-700">
                          <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                            {isAllAcc ? 'Full Tab Access' : `${uAcc.length} Granted`}
                          </span>
                          {canAdmin && (
                            <button
                              type="button"
                              onClick={() => handleOpenPermissionsModal(u, 'tabs')}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-teal-800 dark:text-teal-300 bg-teal-100/70 hover:bg-teal-200/80 dark:bg-teal-950/80 dark:hover:bg-teal-900 rounded border border-teal-200 dark:border-teal-800 transition-colors cursor-pointer"
                              title="Configure Granular Tabs & Access"
                            >
                              <Sliders className="w-3 h-3" />
                              <span>Configure Tabs</span>
                            </button>
                          )}
                        </div>

                        {/* Badges preview */}
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                          {isAllAcc ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <Unlock className="w-3 h-3 text-emerald-600" />
                              <span>All Tabs (Full Access)</span>
                            </span>
                          ) : (
                            uAcc.map(accItem => (
                              <span
                                key={accItem}
                                className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                              >
                                {accItem}
                              </span>
                            ))
                          )}
                        </div>

                        {/* Inline quick access check for All and View Only */}
                        {canAdmin && (
                          <div className="pt-1 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={isAllAcc}
                                onChange={e => handleToggleAccess(u.id, 'All', e.target.checked)}
                                className="rounded text-teal-600 focus:ring-teal-500 w-3 h-3 cursor-pointer"
                              />
                              <span className="font-medium">All Tabs</span>
                            </label>

                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-400">
                              <input
                                type="checkbox"
                                checked={uAcc.includes('View Only')}
                                onChange={e => handleToggleAccess(u.id, 'View Only', e.target.checked)}
                                className="rounded text-amber-600 focus:ring-amber-500 w-3 h-3 cursor-pointer"
                              />
                              <span>View Only</span>
                            </label>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Restrictions & Safeguards */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800 align-top">
                      <div className="space-y-2 bg-slate-50/70 dark:bg-slate-800/30 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-1 pb-1 border-b border-slate-200 dark:border-slate-700">
                          <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                            {uRes.length === 0 ? 'No Restrictions' : `${uRes.length} Restricted`}
                          </span>
                          {canAdmin && (
                            <button
                              type="button"
                              onClick={() => handleOpenPermissionsModal(u, 'restrictions')}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:text-rose-300 bg-rose-100/70 hover:bg-rose-200/80 dark:bg-rose-950/80 dark:hover:bg-rose-900 rounded border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
                              title="Manage Detailed Restrictions"
                            >
                              <Lock className="w-3 h-3" />
                              <span>Manage Rules</span>
                            </button>
                          )}
                        </div>

                        {/* Badges preview */}
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                          {uRes.length === 0 ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                              No restrictions active
                            </span>
                          ) : (
                            uRes.map(resItem => (
                              <span
                                key={resItem}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-900"
                              >
                                <Lock className="w-2.5 h-2.5 shrink-0 text-rose-500" />
                                <span>{resItem}</span>
                              </span>
                            ))
                          )}
                        </div>

                        {/* Quick inline check for high-frequency restrictions */}
                        {canAdmin && (
                          <div className="pt-1 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-wrap gap-x-2 gap-y-1 text-[11px]">
                            <label className="flex items-center gap-1 cursor-pointer text-slate-700 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={uRes.includes('Restrict Profit and Loss')}
                                onChange={e => handleToggleRestriction(u.id, 'Restrict Profit and Loss', e.target.checked)}
                                className="rounded text-rose-600 focus:ring-rose-500 w-3 h-3 cursor-pointer"
                              />
                              <span>Block P&L</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer text-slate-700 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={uRes.includes('Disallow Delete Rows')}
                                onChange={e => handleToggleRestriction(u.id, 'Disallow Delete Rows', e.target.checked)}
                                className="rounded text-rose-600 focus:ring-rose-500 w-3 h-3 cursor-pointer"
                              />
                              <span>No Delete</span>
                            </label>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Username */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800 align-top">
                      <div className="space-y-1">
                        <input
                          type="text"
                          disabled={!canAdmin}
                          value={u.user}
                          onFocus={() => setActiveEditingField({ id: u.id, field: 'user' })}
                          onChange={e => handleUsernameInputChange(u.id, e.target.value)}
                          onBlur={() => {
                            setActiveEditingField(null);
                            handleUsernameInputBlur(u.id);
                          }}
                          placeholder="e.g. enalo"
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-teal-500 focus:border-teal-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-600 shadow-2xs"
                        />
                        <span className="block text-[10px] text-slate-400 pl-1">
                          Login Handle
                        </span>
                      </div>
                    </td>

                    {/* Password Management */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800 align-top">
                      <div className="space-y-2">
                        {/* Status badge and Change Password button */}
                        <div className="flex items-center justify-between gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                            u.hash ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}>
                            {u.hash ? '••••••••' : 'No password'}
                          </span>

                          {canAdmin && (
                            <button
                              type="button"
                              onClick={() => handleOpenPasswordModal(u)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-teal-800 dark:text-teal-300 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 dark:hover:bg-teal-900/60 rounded-md border border-teal-200 dark:border-teal-800 transition-colors cursor-pointer"
                              title="Set or reset password"
                            >
                              <Key className="w-3 h-3" />
                              <span>{u.hash ? 'Change' : 'Set PW'}</span>
                            </button>
                          )}
                        </div>

                        {/* Quick inline password entry */}
                        {canAdmin && (
                          <div className="flex items-center gap-1">
                            <input
                              type="password"
                              value={inlinePwDraft[u.id] || ''}
                              onChange={e => setInlinePwDraft({ ...inlinePwDraft, [u.id]: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleQuickInlinePasswordSave(u.id);
                                }
                              }}
                              placeholder="Quick set PW..."
                              className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-teal-600"
                            />
                            {inlinePwDraft[u.id] && (
                              <button
                                type="button"
                                onClick={() => handleQuickInlinePasswordSave(u.id)}
                                className="p-1 text-white bg-teal-700 hover:bg-teal-800 rounded shadow-xs cursor-pointer shrink-0"
                                title="Save password"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Delete user */}
                    {canAdmin && (
                      <td className="p-2 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                          title={`Remove ${u.name || u.user}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Explanatory guidelines */}
      <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 leading-relaxed space-y-1">
        <p>
          • <strong>Tab-Level Access:</strong> Each user can be granted access to specific tabs (e.g., Data Entry, Cash Details, Summaries). Tabs not in their access list will be hidden from their view.
        </p>
        <p>
          • <strong>Granular Restrictions:</strong> Restrict sensitive financial figures (P&L), block cash reconciliations, prevent record deletion, or disallow modifying product prices.
        </p>
        <p>
          • <strong>Security & Presets:</strong> Quickly assign pre-built roles (Branch Manager, Cashier, Auditor, Inventory Custodian) or fine-tune individual privileges per employee.
        </p>
      </div>

      {/* Change History Audit Log */}
      <ChangeHistory
        logs={state.log || []}
        currentTab="users"
        currentLoc={state.inv}
        startDate={state.start}
        cutDate={state.cut}
        canAdmin={canAdmin}
        onDeleteOne={id => {
          onUpdateState(prev => ({
            ...prev,
            log: prev.log.filter(x => x.id !== id)
          }));
        }}
        onDeleteAllShown={ids => {
          const idSet = new Set(ids);
          onUpdateState(prev => ({
            ...prev,
            log: prev.log.filter(x => !idSet.has(x.id || ''))
          }));
        }}
      />

      {/* ========================================================================= */}
      {/* MODAL: Comprehensive Permissions & Tab Restrictions Configuration        */}
      {/* ========================================================================= */}
      {permModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 flex items-center justify-center shadow-xs">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Configure Tab Access & Restrictions
                  </h3>
                  <p className="text-xs text-slate-500">
                    {permModalUser.name || permModalUser.user} (@{permModalUser.user}) • ID #{permModalUser.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPermModalUser(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick 1-Click Role Presets */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 shrink-0 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  <span>Quick Role Presets:</span>
                </span>
                <span className="text-[11px] text-slate-400">Click to auto-configure privileges</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5">
                {ROLE_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyRolePresetToPermModal(preset)}
                    className="p-1.5 text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-teal-500 dark:hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-950/40 transition-all cursor-pointer group"
                    title={preset.description}
                  >
                    <span className="block text-[11px] font-semibold text-slate-800 dark:text-slate-200 group-hover:text-teal-700 dark:group-hover:text-teal-400">
                      {preset.name}
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      {preset.badge}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-tab Navigation inside Modal */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setPermActiveSubtab('tabs')}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 text-center cursor-pointer transition-colors ${
                  permActiveSubtab === 'tabs'
                    ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                1. Tab Access Privileges ({permDraftAcc.includes('All') ? 'All' : permDraftAcc.length})
              </button>
              <button
                type="button"
                onClick={() => setPermActiveSubtab('restrictions')}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 text-center cursor-pointer transition-colors ${
                  permActiveSubtab === 'restrictions'
                    ? 'border-rose-600 text-rose-700 dark:text-rose-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                2. Operational Restrictions ({permDraftRes.length})
              </button>
              <button
                type="button"
                onClick={() => setPermActiveSubtab('locations')}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 text-center cursor-pointer transition-colors ${
                  permActiveSubtab === 'locations'
                    ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                3. Branch Locations ({permDraftAllLocs ? 'All' : permDraftLocs.length})
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* SUBTAB 1: TAB ACCESS PRIVILEGES */}
              {permActiveSubtab === 'tabs' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      Select which application tabs this user is permitted to open and view.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPermDraftAcc(['All'])}
                        className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                      >
                        Select All Tabs
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setPermDraftAcc(['View Only'])}
                        className="text-[11px] font-semibold text-slate-500 hover:underline cursor-pointer"
                      >
                        Reset / View Only
                      </button>
                    </div>
                  </div>

                  {/* All Tabs master toggle */}
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/30 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permDraftAcc.includes('All')}
                      onChange={e => {
                        if (e.target.checked) {
                          setPermDraftAcc(['All']);
                        } else {
                          setPermDraftAcc(['Data Entry', 'Cash Details Summary']);
                        }
                      }}
                      className="rounded text-teal-700 focus:ring-teal-600 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">
                        All Tabs (Full Access)
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        Grants access to all current and future navigation tabs.
                      </span>
                    </div>
                  </label>

                  {/* Categorized Tab Choices */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TAB_ACCESS_OPTIONS.filter(o => o.name !== 'All').map(opt => {
                      const isChecked = permDraftAcc.includes('All') || permDraftAcc.includes(opt.name);
                      const isLockedByAll = permDraftAcc.includes('All');

                      return (
                        <label
                          key={opt.name}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all select-none ${
                            isChecked
                              ? 'border-teal-300 dark:border-teal-800 bg-teal-50/30 dark:bg-teal-950/20'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                          } ${isLockedByAll ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <input
                            type="checkbox"
                            disabled={isLockedByAll}
                            checked={isChecked}
                            onChange={e => {
                              const withoutAll = permDraftAcc.filter(a => a !== 'All');
                              if (e.target.checked) {
                                setPermDraftAcc([...new Set([...withoutAll, opt.name])]);
                              } else {
                                const rem = withoutAll.filter(a => a !== opt.name);
                                setPermDraftAcc(rem.length > 0 ? rem : ['View Only']);
                              }
                            }}
                            className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5 mt-0.5 cursor-pointer"
                          />
                          <div>
                            <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {opt.name}
                            </span>
                            <span className="block text-[10px] text-slate-400 mt-0.5 leading-snug">
                              {opt.description}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUBTAB 2: OPERATIONAL & TAB RESTRICTIONS */}
              {permActiveSubtab === 'restrictions' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      Check any restrictions to block access to specific tabs or restrict sensitive actions.
                    </p>
                    {permDraftRes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPermDraftRes([])}
                        className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 hover:underline cursor-pointer"
                      >
                        Clear All Restrictions
                      </button>
                    )}
                  </div>

                  {/* Tab Level Blocks */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-rose-600" />
                      <span>Tab Visibility Blocks (Hide Entire Tab)</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {RESTRICTION_OPTIONS.filter(r => r.category === 'tabs').map(res => {
                        const isChecked = permDraftRes.includes(res.key);
                        return (
                          <label
                            key={res.key}
                            className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                              isChecked
                                ? 'border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/30'
                                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setPermDraftRes([...new Set([...permDraftRes, res.key])]);
                                } else {
                                  setPermDraftRes(permDraftRes.filter(r => r !== res.key));
                                }
                              }}
                              className="rounded text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 mt-0.5 cursor-pointer"
                            />
                            <div>
                              <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {res.label}
                              </span>
                              <span className="block text-[10px] text-slate-400 mt-0.5 leading-snug">
                                {res.description}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action & Safeguard Safeguards */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-amber-600" />
                      <span>Action & Data Protection Safeguards</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {RESTRICTION_OPTIONS.filter(r => r.category !== 'tabs').map(res => {
                        const isChecked = permDraftRes.includes(res.key);
                        return (
                          <label
                            key={res.key}
                            className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                              isChecked
                                ? 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30'
                                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setPermDraftRes([...new Set([...permDraftRes, res.key])]);
                                } else {
                                  setPermDraftRes(permDraftRes.filter(r => r !== res.key));
                                }
                              }}
                              className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 mt-0.5 cursor-pointer"
                            />
                            <div>
                              <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {res.label}
                              </span>
                              <span className="block text-[10px] text-slate-400 mt-0.5 leading-snug">
                                {res.description}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 3: LOCATION ACCESS */}
              {permActiveSubtab === 'locations' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Specify which branch stores this user is authorized to open and manage.
                  </p>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/30 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permDraftAllLocs}
                      onChange={e => {
                        setPermDraftAllLocs(e.target.checked);
                        if (e.target.checked) setPermDraftLocs([]);
                      }}
                      className="rounded text-teal-700 focus:ring-teal-600 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">
                        All Locations (Full Chain Access)
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        User can switch between all active branch stores freely.
                      </span>
                    </div>
                  </label>

                  {!permDraftAllLocs && (
                    <div className="space-y-2 pt-1">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Select Allowed Branches:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {state.locs.map(loc => (
                          <label
                            key={loc}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer select-none ${
                              permDraftLocs.includes(loc)
                                ? 'border-teal-300 dark:border-teal-800 bg-teal-50/30 dark:bg-teal-950/20'
                                : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={permDraftLocs.includes(loc)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setPermDraftLocs([...new Set([...permDraftLocs, loc])]);
                                } else {
                                  setPermDraftLocs(permDraftLocs.filter(l => l !== loc));
                                }
                              }}
                              className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                              {loc}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Visual Tab Summary Preview */}
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shrink-0 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-teal-600" />
                  <span>Effective Tab Visibility for this user:</span>
                </span>
                <span className="text-[11px] text-slate-500">Live preview</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SYSTEM_TABS.map(tab => {
                  const testUser: User = {
                    ...permModalUser,
                    all: permDraftAllLocs,
                    locs: permDraftLocs,
                    acc: permDraftAcc,
                    res: permDraftRes
                  };
                  const isAccessible = canUserAccessTab(testUser, tab.id);

                  return (
                    <span
                      key={tab.id}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        isAccessible
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900 opacity-60 line-through'
                      }`}
                    >
                      {isAccessible ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                      <span>{tab.name}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setPermModalUser(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePermissionsModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm cursor-pointer transition-colors"
              >
                Save Permissions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Set / Change Password                                              */}
      {/* ========================================================================= */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Set User Password
                  </h3>
                  <p className="text-xs text-slate-500">
                    {passwordModalUser.name || passwordModalUser.user} (@{passwordModalUser.user})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalUser(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePasswordModal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    value={newPasswordVal}
                    onChange={e => setNewPasswordVal(e.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    placeholder="Min 8 chars (letters + number/symbol)"
                    className="w-full pl-3 pr-10 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    title={showPasswordText ? 'Hide password' : 'Show password'}
                  >
                    {showPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirm Password
                </label>
                <input
                  type={showPasswordText ? 'text' : 'password'}
                  value={confirmPasswordVal}
                  onChange={e => setConfirmPasswordVal(e.target.value)}
                  required
                  placeholder="Repeat new password"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 dark:text-slate-100"
                />
              </div>

              {passwordModalError && (
                <div className="p-2.5 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{passwordModalError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm cursor-pointer transition-colors"
                >
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Add New User                                                       */}
      {/* ========================================================================= */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Add New System User
                  </h3>
                  <p className="text-xs text-slate-500">
                    Create an account with location access, roles, and sign-in credentials.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddUserModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1-Click Role Presets in Add Modal */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>Quick Role Presets:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyRolePresetToAddModal(preset)}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-teal-500 hover:text-teal-700 transition-colors cursor-pointer"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateNewUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Employee Name *
                  </label>
                  <input
                    type="text"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    required
                    placeholder="e.g. John Santos"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={addUsername}
                    onChange={e => setAddUsername(e.target.value)}
                    required
                    placeholder="e.g. jsantos"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Initial Password *
                </label>
                <input
                  type="password"
                  value={addPassword}
                  onChange={e => setAddPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={128}
                  placeholder="Min 8 chars (letters + number/symbol)"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              {/* Location Access in modal */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs text-slate-900 dark:text-slate-100">
                  <input
                    type="checkbox"
                    checked={addAllLocs}
                    onChange={e => {
                      setAddAllLocs(e.target.checked);
                      if (e.target.checked) setAddLocs([]);
                    }}
                    className="rounded text-teal-700 focus:ring-teal-600 cursor-pointer"
                  />
                  <span>All Locations (Full Branch Access)</span>
                </label>

                {!addAllLocs && (
                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2">
                    {state.locs.map(loc => (
                      <label key={loc} className="flex items-center gap-1.5 text-xs cursor-pointer text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={addLocs.includes(loc)}
                          onChange={e => {
                            if (e.target.checked) {
                              setAddLocs([...new Set([...addLocs, loc])]);
                            } else {
                              setAddLocs(addLocs.filter(l => l !== loc));
                            }
                          }}
                          className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                        <span>{loc}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Access Privileges in modal */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Tab Access Privileges
                  </span>
                  <button
                    type="button"
                    onClick={() => setAddAcc(['All'])}
                    className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {TAB_ACCESS_OPTIONS.map(opt => (
                    <label key={opt.name} className="flex items-center gap-1.5 text-xs cursor-pointer text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={addAcc.includes('All') || addAcc.includes(opt.name)}
                        disabled={addAcc.includes('All') && opt.name !== 'All'}
                        onChange={e => {
                          if (opt.name === 'All') {
                            setAddAcc(e.target.checked ? ['All'] : ['Data Entry']);
                          } else {
                            const withoutAll = addAcc.filter(a => a !== 'All');
                            if (e.target.checked) {
                              setAddAcc([...new Set([...withoutAll, opt.name])]);
                            } else {
                              const rem = withoutAll.filter(a => a !== opt.name);
                              setAddAcc(rem.length > 0 ? rem : ['View Only']);
                            }
                          }
                        }}
                        className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                      <span className={opt.name === 'All' ? 'font-semibold text-slate-900 dark:text-slate-100' : ''}>
                        {opt.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Restrictions in modal */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 space-y-2">
                <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Restrictions
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {RESTRICTION_OPTIONS.map(res => (
                    <label key={res.key} className="flex items-start gap-1.5 text-xs cursor-pointer text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={addRes.includes(res.key)}
                        onChange={e => {
                          if (e.target.checked) {
                            setAddRes([...new Set([...addRes, res.key])]);
                          } else {
                            setAddRes(addRes.filter(r => r !== res.key));
                          }
                        }}
                        className="rounded text-rose-600 focus:ring-rose-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{res.label}</span>
                        <span className="block text-[10px] text-slate-400">{res.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {addError && (
                <div className="p-2.5 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm cursor-pointer transition-colors"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
