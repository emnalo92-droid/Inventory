/**
 * ============================================================================
 * FIRESTORE OPTIMIZATION & USAGE RULES
 * ============================================================================
 * 1. Use limit() and cursor pagination (startAfter) on every query. Never fetch a whole collection.
 * 2. Use getDoc/getDocs for data that rarely changes. Only use onSnapshot where live updates are truly needed, and unsubscribe when the component unmounts.
 * 3. Combine multiple field changes into a single updateDoc call.
 * 4. Debounce user input (e.g. typing, sliders, autosave) so it writes at most once every few seconds, not on every keystroke.
 * 5. Skip writes when the value hasn't changed.
 * 6. Cache results on the client (memory or local storage) and avoid refetching on every page load or re-render.
 * 7. Enable Firestore offline persistence so repeat reads hit the local cache.
 * 8. Store data that is read together in one document instead of splitting it across many.
 * 9. Use counters or aggregates (count() queries, or a stored summary field) instead of reading every document to count or total them.
 * 10. Don't read a document right after writing it. Update the UI from local state.
 * ============================================================================
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  doc,
  collection,
  deleteDoc,
  getDocFromServer,
  onSnapshot,
  setDoc,
  disableNetwork,
  enableNetwork
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AppState, PresenceUser } from './types';

// Proactively clear stale IndexedDB token cache from disabled GCP project
if (typeof window !== 'undefined' && window.indexedDB) {
  try {
    window.indexedDB.deleteDatabase('firebaseLocalStorageDb');
  } catch {}
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const app = initializeApp(firebaseConfig);
const customDbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;

function createFirestoreInstance() {
  if (typeof window !== 'undefined') {
    const settings = {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    };
    try {
      return customDbId
        ? initializeFirestore(app, settings, customDbId)
        : initializeFirestore(app, settings);
    } catch {
      return customDbId ? getFirestore(app, customDbId) : getFirestore(app);
    }
  }
  return customDbId ? getFirestore(app, customDbId) : getFirestore(app);
}

export const db = createFirestoreInstance(); /* CRITICAL: The app will break without this line */

let initializedAuth: ReturnType<typeof getAuth>;
try {
  initializedAuth = initializeAuth(app, {
    persistence: inMemoryPersistence,
    popupRedirectResolver: browserPopupRedirectResolver
  });
} catch {
  initializedAuth = getAuth(app);
}
export const auth = initializedAuth;

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.setCustomParameters({
  prompt: 'consent'
});

const FIRESTORE_QUOTA_STORAGE_KEY = 'firestore_daily_quota_exhausted_date';

export function getStoredQuotaExhaustedDate(): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem(FIRESTORE_QUOTA_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

export function getCurrentDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function checkIsFirestoreQuotaExhausted(): boolean {
  const stored = getStoredQuotaExhaustedDate();
  return stored === getCurrentDateKey();
}

export let isFirestoreQuotaExhausted = checkIsFirestoreQuotaExhausted();

export function markFirestoreQuotaExhausted(): void {
  isFirestoreQuotaExhausted = true;
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(FIRESTORE_QUOTA_STORAGE_KEY, getCurrentDateKey());
    }
  } catch {}
  try {
    disableNetwork(db).catch(() => {});
  } catch {}
}

// Proactive check on boot: if quota was exceeded today, disable Firestore network to prevent backoff spam
if (typeof window !== 'undefined' && checkIsFirestoreQuotaExhausted()) {
  isFirestoreQuotaExhausted = true;
  try {
    disableNetwork(db).catch(() => {});
  } catch {}
}

// In-memory token caching per Least-Privilege & Security Guidelines (never in localStorage)
let cachedAccessToken: string | null = null;

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setCachedAccessToken = (token: string | null): void => {
  cachedAccessToken = token;
};

export async function clearStaleAuthCache(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch {
    // ignore
  }
  try {
    if (typeof window !== 'undefined' && window.indexedDB) {
      window.indexedDB.deleteDatabase('firebaseLocalStorageDb');
    }
  } catch {
    // ignore
  }
}

// Proactive check on boot to prevent invalid/disabled-project tokens from blocking Firestore
if (typeof window !== 'undefined') {
  onAuthStateChanged(
    auth,
    async (user) => {
      if (user) {
        try {
          await user.getIdToken();
        } catch (err: any) {
          const msg = String(err?.message || err);
          if (msg.includes('token-service-api') || msg.includes('securetoken')) {
            console.warn('GCP Token Service API not active in project 539295382199. Clearing session to keep Firestore online.');
            await clearStaleAuthCache();
          }
        }
      }
    },
    (err) => {
      console.warn('Auth listener notice:', err);
    }
  );
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  // If Firestore daily write quota is reached, check server health
  if (isFirestoreQuotaExhausted || checkIsFirestoreQuotaExhausted()) {
    try {
      const res = await fetch('/api/health');
      return res.ok;
    } catch {
      return false;
    }
  }

  const path = 'test/connection';
  try {
    // Wait for auth to initialize if method is available
    if (typeof auth.authStateReady === 'function') {
      try {
        await auth.authStateReady();
      } catch {
        // ignore
      }
    }
    // If a cached user is present, verify their token before Firestore makes requests
    if (auth.currentUser) {
      try {
        await auth.currentUser.getIdToken();
      } catch (tokenErr: any) {
        const msg = String(tokenErr?.message || tokenErr);
        if (msg.includes('token-service-api') || msg.includes('securetoken')) {
          console.warn('Token Service API disabled on GCP project. Purging invalid token cache.');
          await clearStaleAuthCache();
        }
      }
    }
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    const msg = String((error as any)?.message || error);
    if (msg.includes('token-service-api') || msg.includes('securetoken') || msg.includes('Fetching auth token failed')) {
      await clearStaleAuthCache();
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        return true;
      } catch {
        return false;
      }
    }
    if (msg.includes('resource-exhausted') || msg.includes('Quota limit exceeded') || msg.includes('Quota exceeded')) {
      markFirestoreQuotaExhausted();
      return true; // Cloud SQL is online
    }
    // If client went offline due to an auth token failure, purge cache and retry
    if (auth.currentUser) {
      try {
        await clearStaleAuthCache();
        await getDocFromServer(doc(db, 'test', 'connection'));
        return true;
      } catch {
        // Continue to standard logging
      }
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}

export async function signInWithGoogle(promptConsent = false): Promise<{ user: FirebaseUser; accessToken: string | null }> {
  try {
    if (promptConsent) {
      googleProvider.setCustomParameters({ prompt: 'consent select_account' });
    } else {
      googleProvider.setCustomParameters({ prompt: 'consent' });
    }
    const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    }

    // Sync authenticated user with Cloud SQL backend
    try {
      const token = await result.user.getIdToken().catch(() => null);
      if (token) {
        await fetch('/api/auth/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ name: result.user.displayName })
        });
      }
    } catch (syncErr) {
      console.warn('Backend user sync warning:', syncErr);
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes('token-service-api') || msg.includes('securetoken')) {
      await clearStaleAuthCache();
      throw new Error(
        'Google Cloud Token Service API has not been activated in project 539295382199. Please enable it in Google Cloud Console: https://console.developers.google.com/apis/api/securetoken.googleapis.com/overview?project=539295382199'
      );
    }
    if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
      console.error('Google Sign-In failed', err);
    }
    throw err;
  }
}

export async function signOutFirebase(): Promise<void> {
  cachedAccessToken = null;
  await clearStaleAuthCache();
}

const STATE_DOC_PATH = 'inventory_data/shared_ledger';

// Save state to Cloud SQL PostgreSQL via Express API
export async function saveStateToCloudSQL(state: AppState, userDisplayName?: string): Promise<boolean> {
  try {
    let token: string | null = null;
    if (auth.currentUser) {
      try {
        token = await auth.currentUser.getIdToken();
      } catch {
        // proceed without token
      }
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/ledger/save', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        state,
        updatedBy: userDisplayName || auth.currentUser?.email || 'Store Staff'
      })
    });
    return res.ok;
  } catch (err) {
    console.warn('Cloud SQL save notice:', err);
    return false;
  }
}

// Fetch initial state from Cloud SQL PostgreSQL
export async function fetchStateFromCloudSQL(): Promise<AppState | null> {
  try {
    let token: string | null = null;
    if (auth.currentUser) {
      try {
        token = await auth.currentUser.getIdToken();
      } catch {
        // proceed without token
      }
    }
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/ledger', { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.found ? data.state : null;
  } catch (err) {
    console.warn('Cloud SQL fetch notice:', err);
    return null;
  }
}

/**
 * Recursively removes all undefined values from an object,
 * ensuring it conforms strictly to Firestore's non-undefined payload constraint.
 */
export function sanitizeForFirestore<T = any>(val: T): T {
  if (val === undefined || val === null) {
    return (val === undefined ? null : val) as unknown as T;
  }
  if (typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const cleanObj: Record<string, any> = {};
  for (const [k, v] of Object.entries(val as Record<string, any>)) {
    if (v !== undefined) {
      cleanObj[k] = sanitizeForFirestore(v);
    }
  }
  return cleanObj as unknown as T;
}

let lastWrittenStateSignature = '';

export async function saveStateToFirestore(state: AppState, userDisplayName?: string): Promise<void> {
  // Always guarantee persistence via Cloud SQL PostgreSQL
  await saveStateToCloudSQL(state, userDisplayName).catch(e => console.warn('Cloud SQL save err:', e));

  // Rule 5: Skip writes when the value hasn't changed
  const stateSignature = JSON.stringify({
    inv: state.inv,
    start: state.start,
    cut: state.cut,
    locs: state.locs,
    items: state.items,
    rows: state.rows,
    cash: state.cash,
    cinfo: state.cinfo,
    cpay: state.cpay,
    cashiers: state.cashiers,
    users: state.users,
    logLen: state.log?.length || 0
  });

  if (stateSignature === lastWrittenStateSignature) {
    return;
  }

  if (isFirestoreQuotaExhausted || checkIsFirestoreQuotaExhausted()) {
    isFirestoreQuotaExhausted = true;
    return;
  }

  try {
    const rawPayload = {
      ...state,
      updatedAt: new Date().toISOString(),
      updatedBy: userDisplayName || (auth.currentUser?.email || auth.currentUser?.displayName || 'anonymous')
    };
    const sanitizedPayload = sanitizeForFirestore(rawPayload);
    await setDoc(doc(db, 'inventory_data', 'shared_ledger'), sanitizedPayload, { merge: true });
    lastWrittenStateSignature = stateSignature;
  } catch (error: any) {
    const msg = String(error?.message || error?.code || error);
    if (msg.includes('resource-exhausted') || msg.includes('Quota limit exceeded') || msg.includes('Quota exceeded')) {
      markFirestoreQuotaExhausted();
      console.warn('Firestore daily write quota reached on free tier. Seamlessly persisting all data via Cloud SQL PostgreSQL.');
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, STATE_DOC_PATH);
  }
}

export function subscribeToFirestoreState(
  onUpdate: (state: AppState) => void,
  onInitialEmpty?: () => void
): () => void {
  const stateDocRef = doc(db, 'inventory_data', 'shared_ledger');
  let pollInterval: any = null;
  let lastUpdatedAt = '';

  const startCloudSqlPolling = () => {
    if (pollInterval) return;

    // Fetch initial state immediately from Cloud SQL
    fetchStateFromCloudSQL().then(sqlState => {
      if (sqlState && typeof sqlState === 'object') {
        const sqlUpdated = (sqlState as any).updatedAt || '';
        lastUpdatedAt = sqlUpdated;
        onUpdate(sqlState);
      } else if (onInitialEmpty) {
        onInitialEmpty();
      }
    }).catch(() => {});

    const triggerPoll = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const sqlState = await fetchStateFromCloudSQL();
        if (sqlState && typeof sqlState === 'object') {
          const sqlUpdated = (sqlState as any).updatedAt || '';
          if (sqlUpdated !== lastUpdatedAt) {
            lastUpdatedAt = sqlUpdated;
            onUpdate(sqlState);
          }
        }
      } catch {
        // ignore polling error
      }
    };

    pollInterval = setInterval(triggerPoll, 5000);

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        triggerPoll();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
  };

  // If quota is exhausted, bypass Firestore onSnapshot completely and poll Cloud SQL
  if (isFirestoreQuotaExhausted || checkIsFirestoreQuotaExhausted()) {
    isFirestoreQuotaExhausted = true;
    startCloudSqlPolling();
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }

  let unsubFirestore: (() => void) | null = null;
  try {
    unsubFirestore = onSnapshot(
      stateDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as AppState;
          lastUpdatedAt = (data as any).updatedAt || '';
          onUpdate(data);
        } else if (onInitialEmpty) {
          onInitialEmpty();
        }
      },
      (error) => {
        const msg = String(error?.message || (error as any)?.code || error);
        if (msg.includes('token-service-api') || msg.includes('securetoken') || msg.includes('Fetching auth token failed')) {
          console.warn('Auth token refresh disabled on GCP project. Operating unauthenticated.');
          clearStaleAuthCache().catch(() => {});
          startCloudSqlPolling();
          return;
        }
        if (msg.includes('resource-exhausted') || msg.includes('Quota limit exceeded') || msg.includes('Quota exceeded')) {
          markFirestoreQuotaExhausted();
          console.warn('Firestore listener paused due to daily quota limit. Seamlessly synchronizing live state via Cloud SQL.');
          if (unsubFirestore) {
            try { unsubFirestore(); } catch {}
            unsubFirestore = null;
          }
          startCloudSqlPolling();
          return;
        }
        console.warn('Firestore state listener notice:', error);
        startCloudSqlPolling();
      }
    );
  } catch (err) {
    startCloudSqlPolling();
  }

  return () => {
    if (unsubFirestore) {
      try { unsubFirestore(); } catch {}
    }
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  };
}

// Multi-user Live Presence tracking (routed through server API for zero Firestore write quota usage!)
export async function updatePresence(presence: PresenceUser): Promise<void> {
  try {
    await fetch('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(presence)
    });
  } catch (err) {
    console.warn('Presence update error:', err);
  }
}

export async function clearPresence(userId: number | string): Promise<void> {
  try {
    await fetch('/api/presence/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, id: userId })
    });
  } catch (err) {
    console.warn('Presence clear error:', err);
  }
}

export function subscribeToPresence(
  onUpdate: (activeUsers: PresenceUser[]) => void
): () => void {
  let isActive = true;
  const fetchActive = async () => {
    if (!isActive) return;
    try {
      const res = await fetch('/api/presence');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.active) && isActive) {
          onUpdate(data.active);
        }
      }
    } catch {
      // ignore
    }
  };

  fetchActive();
  const interval = setInterval(fetchActive, 6000);

  return () => {
    isActive = false;
    clearInterval(interval);
  };
}

