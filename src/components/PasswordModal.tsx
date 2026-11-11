import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { sha256, rnd } from '../utils/helpers';
import { User } from '../types';

interface PasswordModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onSuccess: (updatedUser: User) => void;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({
  isOpen,
  user,
  onClose,
  onSuccess
}) => {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      // Check current password
      const oldHash = await sha256(user.salt + oldPw);
      if (oldHash !== user.hash) {
        setMsg({ text: 'Current password is incorrect.', error: true });
        setLoading(false);
        return;
      }

      if (newPw.length < 6) {
        setMsg({ text: 'New password needs at least 6 characters.', error: true });
        setLoading(false);
        return;
      }

      if (newPw !== newPw2) {
        setMsg({ text: 'The new passwords do not match.', error: true });
        setLoading(false);
        return;
      }

      const newSalt = rnd();
      const newHash = await sha256(newSalt + newPw);

      const updatedUser: User = {
        ...user,
        salt: newSalt,
        hash: newHash
      };

      setMsg({ text: 'Password successfully updated!', error: false });
      setTimeout(() => {
        onSuccess(updatedUser);
        onClose();
        setOldPw('');
        setNewPw('');
        setNewPw2('');
        setMsg(null);
      }, 900);
    } catch {
      setMsg({ text: 'An error occurred while updating password.', error: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-teal-800 dark:text-teal-400 font-semibold text-base">
            <KeyRound className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <span>Change Password</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={oldPw}
              onChange={e => setOldPw(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
              placeholder="Enter current password"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              New Password (min 6 characters)
            </label>
            <input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
              placeholder="Enter new password"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Repeat New Password
            </label>
            <input
              type="password"
              value={newPw2}
              onChange={e => setNewPw2(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
              placeholder="Confirm new password"
            />
          </div>

          {msg && (
            <div
              className={`p-2.5 rounded-lg text-xs font-medium ${
                msg.error
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
              }`}
            >
              {msg.text}
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
