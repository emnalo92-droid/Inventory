import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  parseCookieHeader,
  verifySessionToken,
  type SessionTokenPayload,
} from '../lib/security.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  sessionUser?: SessionTokenPayload;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  // 1. Check Session token header ("Authorization: Session <token>")
  if (authHeader && authHeader.startsWith('Session ')) {
    const token = authHeader.slice('Session '.length).trim();
    const session = verifySessionToken(token);
    if (session) {
      req.sessionUser = session;
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }

  // 2. Check HttpOnly session cookie ("inv_session=<token>")
  const cookies = parseCookieHeader(req.headers.cookie);
  if (cookies.inv_session) {
    const session = verifySessionToken(cookies.inv_session);
    if (session) {
      req.sessionUser = session;
      return next();
    }
  }

  // 3. Check Firebase ID token ("Authorization: Bearer <token>")
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      if (!decodedToken.email || decodedToken.email_verified !== true) {
        return res.status(403).json({ error: 'Forbidden: Verified email required' });
      }
      req.user = decodedToken;
      return next();
    } catch (error) {
      console.error('Error verifying Firebase ID token:', error);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  }

  return res.status(401).json({ error: 'Unauthorized: Authentication required' });
};

// Firebase-only verification helper for /api/auth/firebase-login and /api/auth/sync
export const requireFirebaseAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing Firebase token' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    if (!decodedToken.email || decodedToken.email_verified !== true) {
      return res.status(403).json({ error: 'Forbidden: Verified Google email required' });
    }
    req.user = decodedToken;
    return next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid Firebase token' });
  }
};
