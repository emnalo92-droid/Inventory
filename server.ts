import express from 'express';
import http from 'http';
import os from 'os';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOrCreateUser } from './src/db/users.ts';
import { getLedgerState, saveLedgerState, addAuditLog, getRecentAuditLogs } from './src/db/ledger.ts';
import { optionalAuth, requireAuth, type AuthRequest } from './src/middleware/auth.ts';

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
  // If explicitly production and not in dev container with port flag, use PORT
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

async function startServer() {
  const app = express();
  const PORT = getPort();
  const HOST = getHost();
  const isProd = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Windows / Local Host Server Discovery & Network Info
  app.get('/api/server-info', (_req, res) => {
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
      timestamp: new Date().toISOString()
    });
  });

  // User Profile Sync (Firebase Auth to PostgreSQL)
  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || '';
      const name = req.body?.name || req.user?.name;

      if (!uid || !email) {
        return res.status(400).json({ error: 'Missing UID or email in token' });
      }

      const user = await getOrCreateUser(uid, email, name);
      res.json({ success: true, user });
    } catch (error: any) {
      console.error('Error syncing user:', error);
      res.status(500).json({ error: error.message || 'Failed to sync user' });
    }
  });

  // In-memory cache for shared ledger state to provide zero-interruption fallbacks during scale-to-zero wake-up
  let cachedLedgerData: { state: any; updatedAt: any; updatedBy: any } | null = null;

  // Fetch shared ledger state from Cloud SQL
  app.get('/api/ledger', optionalAuth, async (_req, res) => {
    try {
      const ledger = await getLedgerState('shared_ledger');
      if (!ledger) {
        if (cachedLedgerData) {
          return res.json({ found: true, ...cachedLedgerData });
        }
        return res.json({ found: false, state: null });
      }
      cachedLedgerData = {
        state: ledger.stateData,
        updatedAt: ledger.updatedAt,
        updatedBy: ledger.updatedBy
      };
      res.json({ found: true, ...cachedLedgerData });
    } catch (error: any) {
      console.warn('Notice on getLedgerState:', error?.message || error);
      if (cachedLedgerData) {
        return res.json({ found: true, ...cachedLedgerData, fromCache: true });
      }
      res.status(500).json({ error: 'Database is re-connecting. Please retry in a moment.' });
    }
  });

  // Save shared ledger state to Cloud SQL
  app.post('/api/ledger/save', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const { state, updatedBy } = req.body;
      if (!state || typeof state !== 'object') {
        return res.status(400).json({ error: 'Invalid state payload' });
      }

      const inv = state.inv || 'Main Store';
      const startDate = state.start || '';
      const cutDate = state.cut || '';
      const author = updatedBy || (req.user?.email || 'Store Terminal');

      // Update in-memory cache immediately so concurrent reads never block
      cachedLedgerData = {
        state,
        updatedAt: new Date().toISOString(),
        updatedBy: author
      };

      const saved = await saveLedgerState('shared_ledger', inv, startDate, cutDate, state, author);
      res.json({ success: true, id: saved.id, updatedAt: saved.updatedAt });
    } catch (error: any) {
      console.warn('Notice on saveLedgerState:', error?.message || error);
      res.status(500).json({ error: 'Failed to persist ledger state in Cloud SQL' });
    }
  });

  // Audit Logs
  app.get('/api/logs', optionalAuth, async (_req, res) => {
    try {
      const logs = await getRecentAuditLogs(50);
      res.json({ success: true, logs });
    } catch (error: any) {
      console.error('Failed to get audit logs:', error);
      res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }
  });

  app.post('/api/logs', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const { timestamp, username, tab, action, description, date, location } = req.body;
      const user = username || req.user?.email || 'Staff';
      const logged = await addAuditLog(
        timestamp || new Date().toISOString(),
        user,
        tab || 'system',
        action || 'Update',
        description || '',
        date,
        location
      );
      res.json({ success: true, log: logged });
    } catch (error: any) {
      console.error('Failed to add audit log:', error);
      res.status(500).json({ error: 'Failed to record audit log' });
    }
  });

  // Multi-user Live Presence tracking (in-memory on server, saves 100% of Firestore write quota)
  const presenceMap = new Map<string, any>();

  app.get('/api/presence', (_req, res) => {
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

  app.post('/api/presence', (req, res) => {
    const data = req.body;
    if (data && (data.id || data.userId)) {
      const key = String(data.userId || data.id);
      presenceMap.set(key, { ...data, lastSeen: Date.now() });
    }
    res.json({ success: true });
  });

  app.post('/api/presence/clear', (req, res) => {
    const { id, userId } = req.body;
    const key = String(userId || id);
    if (key) {
      presenceMap.delete(key);
    }
    res.json({ success: true });
  });

  // Vite middleware in dev or static files in production
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer
        }
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
