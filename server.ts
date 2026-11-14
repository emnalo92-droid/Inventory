import express from 'express';
import http from 'http';
import os from 'os';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOrCreateUser } from './src/db/users.ts';
import { getLedgerState, saveLedgerState, addAuditLog, getRecentAuditLogs } from './src/db/ledger.ts';
import { requireAuth, requireFirebaseAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  canServerUserEdit,
  checkRateLimit,
  clearRateLimit,
  computePasswordVersion,
  enforceServerSavePermissions,
  hashPasswordScrypt,
  isServerUserAdmin,
  parseCookieHeader,
  recordRateLimitFailure,
  revokeSessionJti,
  sanitizeStateForClient,
  sanitizeUserForClient,
  setRuntimeSessionSecret,
  signSessionToken,
  stripUnsafeKeys,
  validatePasswordStrength,
  verifyPassword,
  verifySessionToken,
} from './src/lib/security.ts';
import { ensureServerTenUsers, getServerSeedState } from './src/lib/seed-users.ts';
import type { AppState, User } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLanIps(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    const ifaceList = interfaces[name];
    if (ifaceList) {
      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
  }
  return ips;
}

function getPort(): number {
  for (let i = 0; i < process.argv.length; i++) {
    if ((process.argv[i] === '--port' || process.argv[i] === '-p') && process.argv[i + 1]) {
      const p = parseInt(process.argv[i + 1], 10);
      if (!isNaN(p)) return p;
    }
  }
  if (process.env.NODE_ENV === 'production' && process.env.PORT) {
    const p = parseInt(process.env.PORT, 10);
    if (!isNaN(p)) return p;
  }
  return 3000;
}

function getHost(): string {
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--host' && process.argv[i + 1]) {
      return process.argv[i + 1];
    }
  }
  return '0.0.0.0';
}

function setSessionCookie(req: express.Request, res: express.Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https';
  const maxAgeSec = 12 * 60 * 60;
  const parts = [
    `inv_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: express.Request, res: express.Response): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    'inv_session=',
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

async function startServer() {
  const app = express();
  const PORT = getPort();
  const HOST = getHost();
  const isProd = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers middleware (preserves iframe compatibility and Google Sign-In popups)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Origin-Agent-Cluster', '?1');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const isHttps =
      req.secure ||
      req.headers['x-forwarded-proto'] === 'https';
    if (isHttps) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  // Prevent browser/proxy caching of authenticated API responses and strip prototype-pollution keys
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (req.body && typeof req.body === 'object') {
      req.body = stripUnsafeKeys(req.body);
    }
    next();
  });

  // Origin & Referer check for cookie-authenticated API mutations to defend against cross-site request forgery
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }
    const authHeader = req.headers.authorization || '';
    // Requests using explicit Authorization tokens (Session / Bearer) cannot be forged by cross-origin form/cookie CSRF
    if (authHeader.startsWith('Session ') || authHeader.startsWith('Bearer ')) {
      return next();
    }
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const origin = req.headers.origin;
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        if (host && originHost !== host) {
          return res.status(403).json({ error: 'Forbidden: Cross-origin request rejected' });
        }
      } catch {
        return res.status(403).json({ error: 'Forbidden: Invalid origin header' });
      }
    } else if (req.headers.referer) {
      try {
        const refHost = new URL(req.headers.referer).host;
        if (host && refHost !== host) {
          return res.status(403).json({ error: 'Forbidden: Cross-origin referer rejected' });
        }
      } catch {
        return res.status(403).json({ error: 'Forbidden: Invalid referer header' });
      }
    }
    next();
  });

  // Initialize persistent session secret (prefer env var, fallback to DB-stored secret)
  if (process.env.SESSION_SECRET) {
    setRuntimeSessionSecret(process.env.SESSION_SECRET);
  } else {
    try {
      const secretRow = await getLedgerState('__session_secret__');
      const existingSecret = (secretRow?.stateData as any)?.secret;
      if (typeof existingSecret === 'string' && existingSecret.length >= 32) {
        setRuntimeSessionSecret(existingSecret);
      } else {
        const generated = crypto.randomBytes(32).toString('hex');
        setRuntimeSessionSecret(generated);
        await saveLedgerState('__session_secret__', '__system__', '', '', { secret: generated }, 'system');
      }
    } catch {
      // Fallback ephemeral runtime secret already initialized
    }
  }

  // In-memory cache for shared ledger state
  let cachedLedgerData: { state: AppState; updatedAt: any; updatedBy: any } | null = null;

  async function loadServerLedger(): Promise<{ state: AppState; updatedAt: any; updatedBy: any }> {
    try {
      const ledger = await getLedgerState('shared_ledger');
      if (ledger && ledger.stateData && typeof ledger.stateData === 'object') {
        const rawState = ledger.stateData as AppState;
        const normalizedState: AppState = {
          ...rawState,
          users: ensureServerTenUsers(rawState.users),
        };
        cachedLedgerData = {
          state: normalizedState,
          updatedAt: ledger.updatedAt,
          updatedBy: ledger.updatedBy,
        };
        return cachedLedgerData;
      }
    } catch (err) {
      if (cachedLedgerData) return cachedLedgerData;
      console.warn('loadServerLedger DB notice, falling back to seed state:', (err as any)?.message || err);
    }

    if (cachedLedgerData) return cachedLedgerData;
    const seed = getServerSeedState();
    cachedLedgerData = {
      state: seed,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    };
    return cachedLedgerData;
  }

  async function persistServerLedger(state: AppState, author: string) {
    const inv = state.inv || 'Main Store';
    const startDate = state.start || '';
    const cutDate = state.cut || '';
    cachedLedgerData = {
      state,
      updatedAt: new Date().toISOString(),
      updatedBy: author,
    };
    return await saveLedgerState('shared_ledger', inv, startDate, cutDate, state as unknown as Record<string, unknown>, author);
  }

  function resolveCallerFromLedger(req: AuthRequest, users: User[]): User | null {
    if (req.sessionUser) {
      const found = users.find(u => u.id === req.sessionUser!.userId);
      if (found) {
        if (req.sessionUser.pwv && req.sessionUser.pwv !== computePasswordVersion(found)) {
          return null;
        }
        return found;
      }
    }
    if (req.user && req.user.email && req.user.email_verified === true) {
      const emailLower = req.user.email.toLowerCase();
      const matched = users.find(
        u =>
          (u.email && u.email.toLowerCase() === emailLower) ||
          (emailLower === 'em.nalo92@gmail.com' && (u.isOwner || u.id === 1 || u.user === 'enalo'))
      );
      if (matched) return matched;
    }
    return null;
  }

  // Public health check (no sensitive metadata)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Authenticate with Employee Name / Username / Email + Password (with brute-force rate limiting)
  app.post('/api/auth/login', async (req, res) => {
    try {
      const usernameInput = String(req.body?.username || '').trim().toLowerCase().slice(0, 120);
      const passwordInput = String(req.body?.password || '').slice(0, 200);
      if (!usernameInput || !passwordInput) {
        return res.status(400).json({ error: 'Username and password are required.' });
      }

      const ipKey = `login:ip:${req.ip || 'unknown'}`;
      const userKey = `login:user:${usernameInput}`;
      const ipLimit = checkRateLimit(ipKey, 15, 15 * 60 * 1000);
      const userLimit = checkRateLimit(userKey, 8, 15 * 60 * 1000);
      if (!ipLimit.allowed || !userLimit.allowed) {
        const retrySec = Math.max(ipLimit.retryAfterSec, userLimit.retryAfterSec);
        res.setHeader('Retry-After', String(retrySec));
        return res.status(429).json({
          error: `Too many failed sign-in attempts. Please try again in ${Math.ceil(retrySec / 60)} minute(s).`,
        });
      }

      const ledger = await loadServerLedger();
      const users = ensureServerTenUsers(ledger.state.users);
      const matched =
        users.find(
          u =>
            (u.email && u.email.trim().toLowerCase() === usernameInput) ||
            (usernameInput === 'em.nalo92@gmail.com' && (u.id === 1 || u.user === 'enalo' || u.isOwner))
        ) ||
        users.find(u => u.user && u.user.trim().toLowerCase() === usernameInput) ||
        users.find(u => u.name && u.name.trim().toLowerCase() === usernameInput);

      if (!matched) {
        recordRateLimitFailure(ipKey);
        recordRateLimitFailure(userKey);
        await new Promise(r => setTimeout(r, 350));
        return res.status(401).json({ error: 'Employee Name, Username, or Email not found.' });
      }

      const { valid, needsUpgrade } = verifyPassword(passwordInput, matched.salt, matched.hash);
      if (!valid) {
        recordRateLimitFailure(ipKey);
        recordRateLimitFailure(userKey);
        await new Promise(r => setTimeout(r, 350));
        return res.status(401).json({ error: 'Incorrect password. Please verify your password credentials.' });
      }

      clearRateLimit(ipKey);
      clearRateLimit(userKey);

      let activeUser = matched;
      // Transparently upgrade legacy SHA-256 hash to scrypt on valid login
      if (needsUpgrade) {
        const upgraded = hashPasswordScrypt(passwordInput);
        activeUser = { ...matched, salt: upgraded.salt, hash: upgraded.hash };
        const updatedUsers = users.map(u => (u.id === activeUser.id ? activeUser : u));
        const nextState = { ...ledger.state, users: updatedUsers };
        await persistServerLedger(nextState, activeUser.name || activeUser.user).catch(() => {});
      }

      const token = signSessionToken(activeUser);
      setSessionCookie(req, res, token);
      return res.json({
        success: true,
        token,
        user: sanitizeUserForClient(activeUser),
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Authentication service failed.' });
    }
  });

  // Authenticate via verified Google Firebase ID token (must match owner or pre-registered user email)
  app.post('/api/auth/firebase-login', requireFirebaseAuth, async (req: AuthRequest, res) => {
    try {
      const fbLimitKey = `fblogin:ip:${req.ip || 'unknown'}`;
      const fbLimit = checkRateLimit(fbLimitKey, 15, 15 * 60 * 1000);
      if (!fbLimit.allowed) {
        res.setHeader('Retry-After', String(fbLimit.retryAfterSec));
        return res.status(429).json({ error: 'Too many authentication attempts. Please try again later.' });
      }

      const uid = req.user?.uid;
      const email = req.user?.email || '';
      const rawName = req.body?.name || req.user?.name;
      const name = typeof rawName === 'string' ? rawName.trim().slice(0, 120) : undefined;
      if (!uid || !email || req.user?.email_verified !== true) {
        recordRateLimitFailure(fbLimitKey);
        return res.status(403).json({ error: 'Verified Google email is required.' });
      }

      const emailLower = email.toLowerCase();
      const ledger = await loadServerLedger();
      const users = ensureServerTenUsers(ledger.state.users);

      const matched = users.find(
        u =>
          (u.email && u.email.toLowerCase() === emailLower) ||
          (emailLower === 'em.nalo92@gmail.com' && (u.isOwner || u.id === 1 || u.user === 'enalo'))
      );

      if (!matched) {
        return res.status(403).json({
          error: 'This Google account is not registered in User Access. Please sign in with staff credentials or ask an administrator to link your email.',
        });
      }

      await getOrCreateUser(uid, email, name).catch(err => console.warn('Postgres user sync notice:', err));

      const effectiveUser: User = {
        ...matched,
        email: matched.email || email,
        isOwner: matched.isOwner || emailLower === 'em.nalo92@gmail.com',
        role: emailLower === 'em.nalo92@gmail.com' ? 'Owner' : matched.role,
      };

      const token = signSessionToken(effectiveUser);
      setSessionCookie(req, res, token);
      return res.json({
        success: true,
        token,
        user: sanitizeUserForClient(effectiveUser),
      });
    } catch (error) {
      console.error('Firebase login error:', error);
      return res.status(500).json({ error: 'Failed to authenticate Firebase account.' });
    }
  });

  // Current authenticated session check
  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const ledger = await loadServerLedger();
      const caller = resolveCallerFromLedger(req, ledger.state.users);
      if (!caller) {
        return res.status(401).json({ error: 'Session user no longer exists or credentials changed.' });
      }
      return res.json({
        authenticated: true,
        user: sanitizeUserForClient(caller),
      });
    } catch (error) {
      console.error('Session check error:', error);
      return res.status(500).json({ error: 'Failed to verify session.' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Session ')) {
      const parsed = verifySessionToken(authHeader.slice('Session '.length).trim());
      if (parsed) revokeSessionJti(parsed.jti, parsed.exp);
    }
    const cookies = parseCookieHeader(req.headers.cookie);
    if (cookies.inv_session) {
      const parsedCookie = verifySessionToken(cookies.inv_session);
      if (parsedCookie) revokeSessionJti(parsedCookie.jti, parsedCookie.exp);
    }
    clearSessionCookie(req, res);
    res.json({ success: true });
  });

  // Change own password (authenticated user, rate-limited)
  app.post('/api/auth/change-password', requireAuth, async (req: AuthRequest, res) => {
    try {
      const oldPassword = String(req.body?.oldPassword || '').slice(0, 200);
      const newPassword = String(req.body?.newPassword || '').slice(0, 200);
      const pwError = validatePasswordStrength(newPassword);
      if (pwError) {
        return res.status(400).json({ error: pwError });
      }

      const ledger = await loadServerLedger();
      const users = ensureServerTenUsers(ledger.state.users);
      const caller = resolveCallerFromLedger(req, users);
      if (!caller) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }

      const pwKey = `changepw:user:${caller.id}`;
      const limit = checkRateLimit(pwKey, 8, 15 * 60 * 1000);
      if (!limit.allowed) {
        return res.status(429).json({ error: 'Too many incorrect password attempts. Try again later.' });
      }

      const { valid } = verifyPassword(oldPassword, caller.salt, caller.hash);
      if (!valid) {
        recordRateLimitFailure(pwKey);
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }

      clearRateLimit(pwKey);
      const { salt, hash } = hashPasswordScrypt(newPassword);
      const updatedUser: User = { ...caller, salt, hash };
      const nextState: AppState = {
        ...ledger.state,
        users: users.map(u => (u.id === caller.id ? updatedUser : u)),
      };

      await persistServerLedger(nextState, caller.name || caller.user);

      // Re-issue a fresh session token bound to the new password version
      const newToken = signSessionToken(updatedUser);
      setSessionCookie(req, res, newToken);
      return res.json({ success: true, token: newToken, user: sanitizeUserForClient(updatedUser) });
    } catch (error) {
      console.error('Change password error:', error);
      return res.status(500).json({ error: 'Failed to update password.' });
    }
  });

  // Admin: set or reset any user's password on the server using scrypt
  app.post('/api/users/set-password', requireAuth, async (req: AuthRequest, res) => {
    try {
      const targetUserId = Number(req.body?.userId);
      const newPassword = String(req.body?.newPassword || '').trim().slice(0, 200);
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ error: 'Valid userId is required.' });
      }
      const pwError = validatePasswordStrength(newPassword);
      if (pwError) {
        return res.status(400).json({ error: pwError });
      }

      const ledger = await loadServerLedger();
      const users = ensureServerTenUsers(ledger.state.users);
      const caller = resolveCallerFromLedger(req, users);
      if (!caller || !isServerUserAdmin(caller)) {
        return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
      }

      const target = users.find(u => u.id === targetUserId);
      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const { salt, hash } = hashPasswordScrypt(newPassword);
      const updatedUser: User = { ...target, salt, hash };
      const nextState: AppState = {
        ...ledger.state,
        users: users.map(u => (u.id === targetUserId ? updatedUser : u)),
      };

      await persistServerLedger(nextState, caller.name || caller.user);
      // If admin changed their own password, refresh their session token
      if (caller.id === targetUserId) {
        const newToken = signSessionToken(updatedUser);
        setSessionCookie(req, res, newToken);
        return res.json({ success: true, token: newToken, user: sanitizeUserForClient(updatedUser) });
      }
      return res.json({ success: true, user: sanitizeUserForClient(updatedUser) });
    } catch (error) {
      console.error('Admin set password error:', error);
      return res.status(500).json({ error: 'Failed to update user password.' });
    }
  });

  // Admin: create a new user with server-side scrypt hashing
  app.post('/api/users/create', requireAuth, async (req: AuthRequest, res) => {
    try {
      const cleanName = String(req.body?.name || '').trim().slice(0, 120);
      const cleanUser = String(req.body?.user || '').trim().toLowerCase().slice(0, 64);
      const cleanPw = String(req.body?.password || '').trim().slice(0, 200);
      const all = Boolean(req.body?.all);
      const locs = Array.isArray(req.body?.locs) ? req.body.locs.map((l: unknown) => String(l).slice(0, 150)) : [];
      const acc = Array.isArray(req.body?.acc) && req.body.acc.length > 0 ? req.body.acc.map((a: unknown) => String(a).slice(0, 80)) : ['View Only'];
      const resArr = Array.isArray(req.body?.res) ? req.body.res.map((r: unknown) => String(r).slice(0, 80)) : [];
      const email = req.body?.email ? String(req.body.email).trim().slice(0, 180) : undefined;

      if (!cleanName || !cleanUser) {
        return res.status(400).json({ error: 'Employee name and username are required.' });
      }
      const pwError = validatePasswordStrength(cleanPw);
      if (pwError) {
        return res.status(400).json({ error: pwError });
      }

      const ledger = await loadServerLedger();
      const users = ensureServerTenUsers(ledger.state.users);
      const caller = resolveCallerFromLedger(req, users);
      if (!caller || !isServerUserAdmin(caller)) {
        return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
      }

      if (users.some(u => u.user && u.user.toLowerCase() === cleanUser)) {
        return res.status(409).json({ error: `Username "${cleanUser}" is already taken.` });
      }

      const maxId = users.reduce((m, u) => Math.max(m, u.id), 0);
      const { salt, hash } = hashPasswordScrypt(cleanPw);

      const newUser: User = {
        id: maxId + 1,
        name: cleanName,
        user: cleanUser,
        ...(email ? { email } : {}),
        all,
        locs: all ? [] : locs,
        acc,
        res: resArr,
        salt,
        hash,
      };

      const nextState: AppState = {
        ...ledger.state,
        users: [...users, newUser],
      };

      await persistServerLedger(nextState, caller.name || caller.user);
      return res.json({ success: true, user: sanitizeUserForClient(newUser) });
    } catch (error) {
      console.error('Create user error:', error);
      return res.status(500).json({ error: 'Failed to create user.' });
    }
  });

  // Windows / Local Host Server Discovery & Network Info (Administrator-only)
  app.get('/api/server-info', requireAuth, async (req: AuthRequest, res) => {
    const ledger = await loadServerLedger();
    const caller = resolveCallerFromLedger(req, ledger.state.users);
    if (!caller || !isServerUserAdmin(caller)) {
      return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
    }
    const lanIps = getLanIps();
    const hostName = os.hostname();
    res.json({
      status: 'online',
      hostname: hostName,
      hostnameUrl: `http://${hostName}:${PORT}`,
      hostnameLocalUrl: `http://${hostName.toLowerCase()}.local:${PORT}`,
      platform: os.platform(),
      arch: os.arch(),
      port: PORT,
      host: HOST,
      localUrl: `http://localhost:${PORT}`,
      lanIps,
      lanUrls: lanIps.map(ip => `http://${ip}:${PORT}`),
      isWindows: os.platform() === 'win32',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // User Profile Sync (Firebase Auth to PostgreSQL, restricted to authorized users)
  app.post('/api/auth/sync', requireFirebaseAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || '';
      const rawName = req.body?.name || req.user?.name;
      const name = typeof rawName === 'string' ? rawName.trim().slice(0, 120) : undefined;

      if (!uid || !email || req.user?.email_verified !== true) {
        return res.status(400).json({ error: 'Missing verified UID or email in token' });
      }

      const ledger = await loadServerLedger();
      const caller = resolveCallerFromLedger(req, ledger.state.users);
      if (!caller) {
        return res.status(403).json({ error: 'Forbidden: Account is not authorized.' });
      }

      const user = await getOrCreateUser(uid, email, name);
      res.json({ success: true, user });
    } catch (error: any) {
      console.error('Error syncing user:', error);
      res.status(500).json({ error: 'Failed to sync user profile.' });
    }
  });

  // Fetch shared ledger state from Cloud SQL (authenticated + credentials stripped)
  app.get('/api/ledger', requireAuth, async (req: AuthRequest, res) => {
    try {
      const ledger = await getLedgerState('shared_ledger');
      if (!ledger) {
        if (cachedLedgerData) {
          const caller = resolveCallerFromLedger(req, cachedLedgerData.state.users);
          if (!caller) return res.status(403).json({ error: 'Forbidden' });
          return res.json({
            found: true,
            state: sanitizeStateForClient(cachedLedgerData.state),
            updatedAt: cachedLedgerData.updatedAt,
            updatedBy: cachedLedgerData.updatedBy,
          });
        }
        return res.json({ found: false, state: null });
      }

      const normalizedState: AppState = {
        ...(ledger.stateData as AppState),
        users: ensureServerTenUsers((ledger.stateData as AppState).users),
      };
      const caller = resolveCallerFromLedger(req, normalizedState.users);
      if (!caller) {
        return res.status(403).json({ error: 'Forbidden: Account is not authorized.' });
      }

      cachedLedgerData = {
        state: normalizedState,
        updatedAt: ledger.updatedAt,
        updatedBy: ledger.updatedBy,
      };
      res.json({
        found: true,
        state: sanitizeStateForClient(normalizedState),
        updatedAt: cachedLedgerData.updatedAt,
        updatedBy: cachedLedgerData.updatedBy,
      });
    } catch (error: any) {
      console.warn('Notice on getLedgerState:', error?.message || error);
      if (cachedLedgerData) {
        const caller = resolveCallerFromLedger(req, cachedLedgerData.state.users);
        if (!caller) return res.status(403).json({ error: 'Forbidden' });
        return res.json({
          found: true,
          state: sanitizeStateForClient(cachedLedgerData.state),
          updatedAt: cachedLedgerData.updatedAt,
          updatedBy: cachedLedgerData.updatedBy,
          fromCache: true,
        });
      }
      res.status(500).json({ error: 'Database is re-connecting. Please retry in a moment.' });
    }
  });

  // Save shared ledger state to Cloud SQL (authenticated + granular RBAC + hash preservation)
  app.post('/api/ledger/save', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { state: incomingState, updatedBy } = req.body;
      if (
        !incomingState ||
        typeof incomingState !== 'object' ||
        !Array.isArray(incomingState.rows) ||
        !Array.isArray(incomingState.items)
      ) {
        return res.status(400).json({ error: 'Invalid state payload' });
      }
      if (incomingState.items.length > 20000 || incomingState.rows.length > 100000) {
        return res.status(413).json({ error: 'Ledger payload exceeds safety size limits.' });
      }

      const existing = await loadServerLedger();
      const existingUsers = ensureServerTenUsers(existing.state.users);
      const caller = resolveCallerFromLedger(req, existingUsers);
      if (!caller) {
        return res.status(403).json({ error: 'Forbidden: Account is not authorized.' });
      }

      const isAdmin = isServerUserAdmin(caller);
      if (!canServerUserEdit(caller)) {
        return res.status(403).json({ error: 'Forbidden: Account is in Read-Only mode.' });
      }

      // Protect users array and password hashes/salts from tampering or overwriting with masked hashes
      let mergedUsers: User[] = existingUsers;
      if (isAdmin && Array.isArray(incomingState.users)) {
        const existingById = new Map(existingUsers.map(u => [u.id, u]));
        mergedUsers = ensureServerTenUsers(
          incomingState.users.map((u: User) => {
            const prevUser = existingById.get(u.id);
            const hasClientNewRealHash =
              typeof u.hash === 'string' &&
              u.hash.length > 0 &&
              u.hash !== '__set__' &&
              typeof u.salt === 'string' &&
              u.salt.length > 0;
            return {
              ...u,
              salt: hasClientNewRealHash ? u.salt : (prevUser?.salt || ''),
              hash: hasClientNewRealHash ? u.hash : (prevUser?.hash || ''),
            };
          })
        );
      }

      const finalState = enforceServerSavePermissions(caller, existing.state, incomingState, mergedUsers);
      const author = caller.name || caller.user || String(updatedBy || '').slice(0, 120) || 'Store Terminal';
      const saved = await persistServerLedger(finalState, author);
      res.json({ success: true, id: saved.id, updatedAt: saved.updatedAt });
    } catch (error: any) {
      console.warn('Notice on saveLedgerState:', error?.message || error);
      res.status(500).json({ error: 'Failed to persist ledger state in Cloud SQL' });
    }
  });

  // Audit Logs (authenticated + caller-verified + input-bounded)
  app.get('/api/logs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const ledger = await loadServerLedger();
      const caller = resolveCallerFromLedger(req, ledger.state.users);
      if (!caller) {
        return res.status(403).json({ error: 'Forbidden: Account is not authorized.' });
      }
      const logs = await getRecentAuditLogs(50);
      res.json({ success: true, logs });
    } catch (error: any) {
      console.error('Failed to get audit logs:', error);
      res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }
  });

  app.post('/api/logs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const ledger = await loadServerLedger();
      const caller = resolveCallerFromLedger(req, ledger.state.users);
      if (!caller) {
        return res.status(403).json({ error: 'Forbidden: Account is not authorized.' });
      }
      const timestamp = String(req.body?.timestamp || new Date().toISOString()).slice(0, 64);
      const tab = String(req.body?.tab || 'system').slice(0, 50);
      const action = String(req.body?.action || 'Update').slice(0, 50);
      const description = String(req.body?.description || '').slice(0, 500);
      const date = req.body?.date ? String(req.body.date).slice(0, 32) : undefined;
      const location = req.body?.location ? String(req.body.location).slice(0, 150) : undefined;
      const user = String(caller.name || caller.user || 'Staff').slice(0, 100);
      const logged = await addAuditLog(timestamp, user, tab, action, description, date, location);
      res.json({ success: true, log: logged });
    } catch (error: any) {
      console.error('Failed to add audit log:', error);
      res.status(500).json({ error: 'Failed to record audit log' });
    }
  });

  // Multi-user Live Presence tracking (authenticated, bound to authenticated user ID)
  const presenceMap = new Map<string, any>();

  app.get('/api/presence', requireAuth, async (req: AuthRequest, res) => {
    const ledger = await loadServerLedger();
    const caller = resolveCallerFromLedger(req, ledger.state.users);
    if (!caller) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const now = Date.now();
    const active: any[] = [];
    for (const [key, val] of presenceMap.entries()) {
      if (now - (val.lastSeen || 0) < 60000) {
        active.push(val);
      } else {
        presenceMap.delete(key);
      }
    }
    res.json({ success: true, active });
  });

  app.post('/api/presence', requireAuth, async (req: AuthRequest, res) => {
    const data = req.body;
    const ledger = await loadServerLedger();
    const caller = resolveCallerFromLedger(req, ledger.state.users);
    if (!caller) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const key = String(caller.id);
    if (presenceMap.size > 500) {
      const now = Date.now();
      for (const [k, v] of presenceMap.entries()) {
        if (now - (v.lastSeen || 0) >= 60000) presenceMap.delete(k);
      }
    }
    presenceMap.set(key, {
      id: key,
      userId: caller.id,
      name: String(caller.name || caller.user).slice(0, 100),
      user: String(caller.user).slice(0, 64),
      loc: String(data?.loc || '').slice(0, 150),
      tab: String(data?.tab || 'entry').slice(0, 50),
      shift: data?.shift === 'PM' ? 'PM' : 'AM',
      date: String(data?.date || '').slice(0, 32),
      lastSeen: Date.now(),
    });
    res.json({ success: true });
  });

  app.post('/api/presence/clear', requireAuth, async (req: AuthRequest, res) => {
    const ledger = await loadServerLedger();
    const caller = resolveCallerFromLedger(req, ledger.state.users);
    if (caller) {
      presenceMap.delete(String(caller.id));
    }
    res.json({ success: true });
  });

  // Explicit JSON 404 for unknown /api routes instead of falling back to SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Vite middleware in dev or static files in production
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, HOST, () => {
    const lanIps = getLanIps();
    console.log(`Server listening on http://${HOST}:${PORT}`);
    if (lanIps.length > 0) {
      console.log(`[Host Server] Available on local network (LAN / Wi-Fi):`);
      lanIps.forEach(ip => console.log(`  -> http://${ip}:${PORT}`));
    }
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
