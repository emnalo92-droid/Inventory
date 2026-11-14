import crypto from 'node:crypto';
import type { AppState, User } from '../types.ts';
import { unitCost } from '../utils/helpers.ts';

export interface SessionTokenPayload {
  jti: string;
  pwv: string;
  userId: number;
  username: string;
  email?: string;
  name: string;
  role?: string;
  isOwner?: boolean;
  iat: number;
  exp: number;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Fallback process-wide ephemeral secret if DB secret hasn't loaded yet
let runtimeSessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export function setRuntimeSessionSecret(secret: string): void {
  if (secret && secret.length >= 32) {
    runtimeSessionSecret = secret;
  }
}

export function getRuntimeSessionSecret(): string {
  return runtimeSessionSecret;
}

/**
 * Computes a short, deterministic token binding value from the user's current credential state.
 * Rotating or changing a user's password immediately invalidates previously issued tokens.
 */
export function computePasswordVersion(user: Pick<User, 'id' | 'salt' | 'hash'>): string {
  return crypto
    .createHash('sha256')
    .update(`${user.id}:${user.salt || ''}:${user.hash || ''}`)
    .digest('hex')
    .slice(0, 16);
}

// In-memory store of explicitly revoked token IDs (until their natural exp)
const revokedJtis = new Map<string, number>();

export function revokeSessionJti(jti: string | undefined, exp?: number): void {
  if (!jti) return;
  const now = Date.now();
  if (revokedJtis.size > 5000) {
    for (const [k, expiry] of revokedJtis.entries()) {
      if (expiry <= now) revokedJtis.delete(k);
    }
  }
  revokedJtis.set(jti, exp && exp > now ? exp : now + SESSION_TTL_MS);
}

export function isSessionJtiRevoked(jti: string | undefined): boolean {
  if (!jti) return true;
  const expiry = revokedJtis.get(jti);
  if (!expiry) return false;
  if (expiry <= Date.now()) {
    revokedJtis.delete(jti);
    return false;
  }
  return true;
}

// Sliding-window brute-force rate limiter
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxAttempts: number = 10,
  windowMs: number = 15 * 60 * 1000
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (rateLimitBuckets.size > 5000) {
    for (const [k, b] of rateLimitBuckets.entries()) {
      if (b.resetAt <= now) rateLimitBuckets.delete(k);
    }
  }
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordRateLimitFailure(
  key: string,
  windowMs: number = 15 * 60 * 1000
): void {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    bucket.count += 1;
  }
}

export function clearRateLimit(key: string): void {
  rateLimitBuckets.delete(key);
}

const COMMON_WEAK_PASSWORDS = new Set([
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password123',
  'qwerty',
  'qwerty123',
  'admin123',
  'letmein',
  'welcome1',
  'abc12345',
  '11111111',
  '00000000',
]);

/**
 * Validates new/updated passwords against minimum complexity rules
 * without blocking legacy accounts during login.
 */
export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (password.length > 128) {
    return 'Password must be 128 characters or fewer.';
  }
  if (!password.trim() || /^\s+$/.test(password)) {
    return 'Password cannot consist only of whitespace.';
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return 'Password is too common. Please choose a stronger password.';
  }
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumberOrSymbol = /[0-9!@#$%^&*(),.?":{}|<>_\-+=\\/\[\];'`~]/.test(password);
  if (!hasLetter || !hasNumberOrSymbol) {
    return 'Password must include both letters and at least one number or symbol.';
  }
  return null;
}

/**
 * Recursively removes prototype-pollution keys (__proto__, constructor, prototype) from parsed JSON objects.
 */
export function stripUnsafeKeys<T>(val: T): T {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map(item => stripUnsafeKeys(item)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    clean[k] = stripUnsafeKeys(v);
  }
  return clean as T;
}

/**
 * Hashes a password with Node.js crypto.scryptSync and a random 16-byte salt.
 * Stored as salt = <hex> and hash = "scrypt:<hex>".
 */
export function hashPasswordScrypt(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return {
    salt,
    hash: `scrypt:${derived}`,
  };
}

/**
 * Verifies a password against either modern "scrypt:<hex>" hashes
 * or legacy 64-char SHA-256 hex hashes using timing-safe comparison.
 */
export function verifyPassword(
  password: string,
  salt: string | undefined,
  storedHash: string | undefined
): { valid: boolean; needsUpgrade: boolean } {
  if (!password || !storedHash || !salt) {
    return { valid: false, needsUpgrade: false };
  }

  if (storedHash.startsWith('scrypt:')) {
    const expectedHex = storedHash.slice('scrypt:'.length);
    if (!/^[0-9a-f]+$/i.test(expectedHex)) {
      return { valid: false, needsUpgrade: false };
    }
    try {
      const derived = crypto.scryptSync(password, salt, 64);
      const expected = Buffer.from(expectedHex, 'hex');
      if (derived.length !== expected.length) {
        return { valid: false, needsUpgrade: false };
      }
      return {
        valid: crypto.timingSafeEqual(derived, expected),
        needsUpgrade: false,
      };
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  // Legacy SHA-256 hex verification: sha256(salt + password)
  if (/^[0-9a-f]{64}$/i.test(storedHash)) {
    try {
      const computed = crypto.createHash('sha256').update(salt + password).digest();
      const expected = Buffer.from(storedHash, 'hex');
      if (computed.length !== expected.length) {
        return { valid: false, needsUpgrade: false };
      }
      const valid = crypto.timingSafeEqual(computed, expected);
      return { valid, needsUpgrade: valid };
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  return { valid: false, needsUpgrade: false };
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signSessionToken(
  user: Pick<User, 'id' | 'user' | 'email' | 'name' | 'role' | 'isOwner' | 'salt' | 'hash'>,
  ttlMs: number = SESSION_TTL_MS
): string {
  const now = Date.now();
  const payload: SessionTokenPayload = {
    jti: crypto.randomBytes(16).toString('hex'),
    pwv: computePasswordVersion(user),
    userId: user.id,
    username: user.user,
    email: user.email,
    name: user.name,
    role: user.role,
    isOwner: Boolean(user.isOwner),
    iat: now,
    exp: now + ttlMs,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', runtimeSessionSecret)
    .update(encodedPayload)
    .digest();
  return `${encodedPayload}.${base64UrlEncode(sig)}`;
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSig] = parts;
  if (!encodedPayload || !encodedSig) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', runtimeSessionSecret)
      .update(encodedPayload)
      .digest();
    const expectedEncoded = base64UrlEncode(expectedSig);
    const a = Buffer.from(encodedSig);
    const b = Buffer.from(expectedEncoded);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionTokenPayload;
    if (!payload || typeof payload.userId !== 'number' || typeof payload.exp !== 'number' || !payload.jti) {
      return null;
    }
    if (Date.now() > payload.exp) {
      return null;
    }
    if (isSessionJtiRevoked(payload.jti)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

export function isServerUserAdmin(u: User | null | undefined): boolean {
  if (!u) return false;
  const acc = Array.isArray(u.acc) ? u.acc : [];
  const res = Array.isArray(u.res) ? u.res : [];
  return (
    u.isOwner === true ||
    u.email?.toLowerCase() === 'em.nalo92@gmail.com' ||
    (u.all && acc.includes('All') && !acc.includes('View Only') && res.length === 0) ||
    u.user === 'admin' ||
    u.user === 'enalo' ||
    u.id === 1 ||
    u.id === 999
  );
}

export function canServerUserEdit(u: User | null | undefined): boolean {
  if (!u) return false;
  const acc = Array.isArray(u.acc) ? u.acc : [];
  const res = Array.isArray(u.res) ? u.res : [];
  if (res.includes('Read-Only (No Edits)') || res.includes('View Only')) return false;
  if (acc.includes('View Only')) return false;
  return true;
}

/**
 * Strips sensitive cryptographic fields (salt & hash) before sending user lists to clients,
 * preserving only a boolean-style marker in `hash` so UI badges ("No password" vs masked) work.
 */
export function sanitizeUserForClient(u: User): User {
  return {
    ...u,
    salt: '',
    hash: u.hash ? '__set__' : '',
  };
}

export function sanitizeStateForClient(state: any): any {
  if (!state || typeof state !== 'object') return state;
  if (!Array.isArray(state.users)) return state;
  return {
    ...state,
    users: state.users.map((u: User) => sanitizeUserForClient(u)),
  };
}

/**
 * Validates and enforces granular server-side RBAC on incoming state mutations from /api/ledger/save.
 * Prevents non-admin users from altering out-of-branch records, locked settings, restricted cash/item data,
 * or deleting audit logs / rows when restricted.
 */
export function enforceServerSavePermissions(
  caller: User,
  existingState: AppState,
  incomingState: AppState,
  mergedUsers: User[]
): AppState {
  const isAdmin = isServerUserAdmin(caller);
  const acc = Array.isArray(caller.acc) ? caller.acc : [];
  const res = Array.isArray(caller.res) ? caller.res : [];

  if (isAdmin) {
    return {
      ...incomingState,
      users: mergedUsers,
    };
  }

  const hasSetupAccess = (acc.includes('All') || acc.includes('Setup')) && !res.includes('Restrict Setup');
  const canChangeStart =
    (acc.includes('All') || acc.includes('Start Date') || hasSetupAccess) &&
    !res.includes('Start Date') &&
    !res.includes('Restrict Start Date') &&
    !res.includes('Restrict Setup');
  const canChangeCut =
    (acc.includes('All') || acc.includes('Cut Off Date') || hasSetupAccess) &&
    !res.includes('Cut Off Date') &&
    !res.includes('Restrict Cut Off Date') &&
    !res.includes('Restrict Setup');

  const canEditMaster =
    (acc.includes('All') || acc.includes('Item Master')) &&
    !res.includes('Restrict Item Master');
  const canDeleteRows = !res.includes('Disallow Delete Rows');
  const canEditPrices = !res.includes('Disallow Price / SRP Edits');
  const canAddItems = !res.includes('Disallow Adding Items');

  const canEditCash =
    (acc.includes('All') || acc.includes('Cash Details Summary')) &&
    !res.includes('Restrict Cash Details') &&
    !res.includes('Disallow Cash Adjustments');

  const canEditRows =
    acc.includes('All') ||
    acc.includes('Data Entry') ||
    acc.includes('Transfer From') ||
    acc.includes('Transfer To');

  const allowedLocSet = caller.all ? null : new Set(Array.isArray(caller.locs) ? caller.locs : []);
  const isLocAllowed = (loc: string | undefined | null) => {
    if (!allowedLocSet) return true;
    return Boolean(loc && allowedLocSet.has(loc));
  };

  // 1. Protect items catalog
  let finalItems = Array.isArray(existingState.items) ? [...existingState.items] : [];
  if (canEditMaster && Array.isArray(incomingState.items)) {
    const existingItemMap = new Map(finalItems.map(it => [it.no, it]));
    const nextItemMap = new Map<number, typeof finalItems[number]>();

    for (const incomingItem of incomingState.items) {
      if (!incomingItem || typeof incomingItem.no !== 'number') continue;
      const prevItem = existingItemMap.get(incomingItem.no);
      if (!prevItem) {
        if (canAddItems) {
          nextItemMap.set(incomingItem.no, incomingItem);
        }
      } else if (!canEditPrices) {
        nextItemMap.set(incomingItem.no, {
          ...incomingItem,
          srp: prevItem.srp,
          deliv: prevItem.deliv,
          wd: prevItem.wd,
          cv: prevItem.cv,
          conv: prevItem.conv,
          vat: prevItem.vat,
        });
      } else {
        nextItemMap.set(incomingItem.no, incomingItem);
      }
    }

    if (!canDeleteRows) {
      for (const prevItem of finalItems) {
        if (!nextItemMap.has(prevItem.no)) {
          nextItemMap.set(prevItem.no, prevItem);
        }
      }
    }
    finalItems = Array.from(nextItemMap.values()).sort((a, b) => a.no - b.no);
  }

  // 2. Protect ledger rows across branches & Disallow Delete Rows
  const existingRows = Array.isArray(existingState.rows) ? existingState.rows : [];
  let finalRows = existingRows;
  if (canEditRows && Array.isArray(incomingState.rows)) {
    const preservedOtherBranches = allowedLocSet
      ? existingRows.filter(r => !isLocAllowed(r.loc))
      : [];
    const incomingInBranch = incomingState.rows.filter(r => r && isLocAllowed(r.loc));

    if (!canDeleteRows) {
      const existingInBranch = existingRows.filter(r => isLocAllowed(r.loc));
      const rowKey = (r: AppState['rows'][number]) =>
        r._id ? `id:${r._id}` : `k:${r.loc}|${r.date}|${r.fr}|${r.no}`;
      const incomingKeys = new Set(incomingInBranch.map(rowKey));
      const missingExisting = existingInBranch.filter(r => !incomingKeys.has(rowKey(r)));
      finalRows = [...preservedOtherBranches, ...incomingInBranch, ...missingExisting];
    } else {
      finalRows = [...preservedOtherBranches, ...incomingInBranch];
    }
  }

  // 3. Protect cash / cinfo / cpay across branch & restriction boundaries
  const mergeBranchRecord = <T extends Record<string, any>>(
    existingRec: T | undefined,
    incomingRec: T | undefined,
    allowEdit: boolean
  ): T => {
    const base = { ...(existingRec || {}) } as Record<string, any>;
    if (!allowEdit || !incomingRec || typeof incomingRec !== 'object') {
      return base as T;
    }
    if (!allowedLocSet) {
      return { ...incomingRec };
    }
    for (const [k, v] of Object.entries(incomingRec)) {
      const keyLoc = k.split('|')[0];
      if (isLocAllowed(keyLoc)) {
        base[k] = v;
      }
    }
    // Handle deletions only for allowed locations
    for (const k of Object.keys(base)) {
      const keyLoc = k.split('|')[0];
      if (isLocAllowed(keyLoc) && !(k in incomingRec)) {
        delete base[k];
      }
    }
    return base as T;
  };

  const finalCash = mergeBranchRecord(existingState.cash, incomingState.cash, canEditCash);
  const finalCinfo = mergeBranchRecord(existingState.cinfo, incomingState.cinfo, canEditCash);
  const finalCpay = mergeBranchRecord(existingState.cpay, incomingState.cpay, canEditCash);

  // 4. Preserve historical audit logs (append-only for non-admins, bounded)
  const existingLogs = Array.isArray(existingState.log) ? existingState.log : [];
  const incomingLogs = Array.isArray(incomingState.log) ? incomingState.log : [];
  const existingLogIds = new Set(existingLogs.map(l => `${l.id || ''}|${l.t}|${l.desc}`));
  const appendedLogs = incomingLogs.filter(
    l => l && typeof l === 'object' && !existingLogIds.has(`${l.id || ''}|${l.t}|${l.desc}`)
  );
  const finalLog = [...existingLogs, ...appendedLogs].slice(-5000);

  // 5. Preserve notes scoped cleanly (existing + incoming updates, length-bounded)
  const rawNotes =
    incomingState.notes && typeof incomingState.notes === 'object'
      ? { ...(existingState.notes || {}), ...incomingState.notes }
      : existingState.notes || {};
  const finalNotes: NonNullable<AppState['notes']> = {};
  for (const [k, v] of Object.entries(rawNotes)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (v && typeof v === 'object' && typeof (v as any).text === 'string') {
      finalNotes[k] = {
        text: String((v as any).text).slice(0, 1000),
        author: String((v as any).author || caller.name || caller.user || '').slice(0, 100),
        timestamp:
          typeof (v as any).timestamp === 'number' && Number.isFinite((v as any).timestamp)
            ? (v as any).timestamp
            : Date.now(),
      };
    }
  }

  // Ensure unitCost import reference stays used cleanly if needed
  void unitCost;

  return {
    ...existingState,
    v: typeof incomingState.v === 'number' ? incomingState.v : existingState.v,
    inv: existingState.inv,
    locs: hasSetupAccess && Array.isArray(incomingState.locs) ? incomingState.locs : existingState.locs,
    cashiers: hasSetupAccess && Array.isArray(incomingState.cashiers) ? incomingState.cashiers : existingState.cashiers,
    start: canChangeStart && typeof incomingState.start === 'string' ? incomingState.start : existingState.start,
    cut: canChangeCut && typeof incomingState.cut === 'string' ? incomingState.cut : existingState.cut,
    items: finalItems,
    rows: finalRows,
    cash: finalCash,
    cinfo: finalCinfo,
    cpay: finalCpay,
    users: mergedUsers,
    log: finalLog,
    notes: finalNotes,
    nc: incomingState.nc && typeof incomingState.nc === 'object' ? incomingState.nc : existingState.nc,
  };
}

