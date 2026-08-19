import 'server-only';
import { verifySessionToken, timingSafeCompare, COOKIE_NAME } from '../lib/server/auth/session';
import { getServerEnv, isAdminConfigured } from '../lib/server/config/env';
import { logger } from '../utils/logger';

export interface AuthUser {
  uid: string;
  code: string;
  role: 'admin' | 'user';
  name?: string;
  admin?: boolean;
}

export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined> | { get: (name: string) => { value: string } | undefined };
  user?: AuthUser;
}

/**
 * Extract session token from cookie or Authorization header
 */
export async function extractAndVerifySession(req: AuthRequest): Promise<AuthUser | null> {
  // 1. Try extracting from Cookie
  let token: string | undefined;

  if (req.cookies) {
    if (typeof (req.cookies as any).get === 'function') {
      token = (req.cookies as any).get(COOKIE_NAME)?.value;
    } else {
      token = (req.cookies as Record<string, string | undefined>)[COOKIE_NAME];
    }
  }

  // 2. Try parsing Cookie header string if cookies object not parsed
  if (!token && req.headers['cookie']) {
    const rawCookieHeader = Array.isArray(req.headers['cookie'])
      ? req.headers['cookie'].join('; ')
      : req.headers['cookie'];
    const match = rawCookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    if (match) {
      token = decodeURIComponent(match[1]);
    }
  }

  // 3. Fallback to Authorization: Bearer <signed-jwt>
  if (!token) {
    const authHeader = req.headers['authorization'];
    const rawAuth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (rawAuth && rawAuth.startsWith('Bearer ')) {
      token = rawAuth.substring(7).trim();
    }
  }

  if (!token) {
    return null;
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return null;
  }

  return {
    uid: payload.sub,
    code: payload.code,
    role: payload.role,
    name: payload.name,
    admin: payload.role === 'admin',
  };
}

export const requireAdminRole = async (
  req: AuthRequest,
  res: any,
  next: () => void
) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: Session missing' });
  }

  if (req.user.admin !== true || req.user.role !== 'admin') {
    logger.warn(`Forbidden: Non-admin attempt on admin endpoint: ${req.user.uid}`);
    return res.status(403).json({ error: 'Forbidden: Requires Admin Role' });
  }

  next();
};

export const requireAuth = async (
  req: AuthRequest,
  res: any,
  next: () => void
) => {
  const user = await extractAndVerifySession(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid session token' });
  }

  req.user = user;
  return next();
};
