import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';
import { getServerEnv } from '../config/env';

export interface UserSessionPayload {
  sub: string; // User/Client ID or Access Code ID
  code: string; // The access code or admin identifier
  role: 'admin' | 'user';
  name?: string;
  plan?: string;
  isLifetime?: boolean;
  expiresAt?: number;
  [key: string]: unknown;
}

const COOKIE_NAME = 'satset_session';
const DEFAULT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecretKey(): Uint8Array {
  const env = getServerEnv();
  const secret = env.SESSION_SECRET || 'dev_fallback_secret_must_be_overridden_in_prod_32_bytes_min';
  // Use sha256 to ensure exactly 32-byte key buffer for HMAC-SHA256
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Timing-safe string comparison to prevent timing attacks on access codes and secrets.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare with itself to maintain constant time, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Create a signed JWT session token
 */
export async function createSessionToken(
  payload: UserSessionPayload,
  durationSeconds: number = DEFAULT_EXPIRY_SECONDS
): Promise<string> {
  const key = getSecretKey();
  const now = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + durationSeconds)
    .sign(key);

  return token;
}

/**
 * Verify and decode a signed JWT session token
 */
export async function verifySessionToken(token: string): Promise<UserSessionPayload | null> {
  if (!token || typeof token !== 'string') return null;

  try {
    const key = getSecretKey();
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });

    if (!payload || !payload.code || !payload.role) {
      return null;
    }

    return payload as unknown as UserSessionPayload;
  } catch {
    return null;
  }
}

/**
 * Cookie options helper for session cookie
 */
export function getSessionCookieOptions(durationSeconds: number = DEFAULT_EXPIRY_SECONDS) {
  const env = getServerEnv();
  const isProd = env.NODE_ENV === 'production';
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: durationSeconds,
  };
}

export { COOKIE_NAME };
