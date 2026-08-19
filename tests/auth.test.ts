import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSessionToken,
  verifySessionToken,
  timingSafeCompare,
  UserSessionPayload,
} from '../lib/server/auth/session';
import { getServerEnv, isAdminConfigured } from '../lib/server/config/env';

describe('Auth & Session Security Verification', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test_secret_for_jwt_session_signing_must_be_long_enough';
    process.env.ADMIN_ACCESS_CODE = 'TEST-ADMIN-SECURE-12345';
  });

  describe('Timing-Safe Comparison', () => {
    it('returns true for matching strings', () => {
      expect(timingSafeCompare('SECRET_CODE_123', 'SECRET_CODE_123')).toBe(true);
    });

    it('returns false for mismatched strings', () => {
      expect(timingSafeCompare('SECRET_CODE_123', 'WRONG_CODE_456')).toBe(false);
      expect(timingSafeCompare('SHORT', 'LONGER_STRING')).toBe(false);
      expect(timingSafeCompare('', 'SOMETHING')).toBe(false);
    });
  });

  describe('JWT Session Management with jose', () => {
    it('creates and verifies a valid admin session', async () => {
      const payload: UserSessionPayload = {
        sub: 'admin_root',
        code: 'TEST-ADMIN-SECURE-12345',
        role: 'admin',
        name: 'Administrator',
      };

      const token = await createSessionToken(payload, 3600);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const verified = await verifySessionToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.role).toBe('admin');
      expect(verified?.code).toBe('TEST-ADMIN-SECURE-12345');
    });

    it('creates and verifies a valid user session', async () => {
      const payload: UserSessionPayload = {
        sub: 'client_001',
        code: 'USER-ACCESS-CODE-999',
        role: 'user',
        name: 'VIP Client',
        plan: 'Paket Ultra VIP',
      };

      const token = await createSessionToken(payload, 3600);
      const verified = await verifySessionToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.role).toBe('user');
      expect(verified?.code).toBe('USER-ACCESS-CODE-999');
    });

    it('rejects tampered tokens', async () => {
      const payload: UserSessionPayload = {
        sub: 'client_001',
        code: 'USER-ACCESS-CODE-999',
        role: 'user',
      };

      const token = await createSessionToken(payload, 3600);
      const parts = token.split('.');
      // Tamper payload
      const tampered = `${parts[0]}.${parts[1]}tampered.${parts[2]}`;
      const verified = await verifySessionToken(tampered);
      expect(verified).toBeNull();
    });

    it('rejects expired tokens', async () => {
      const payload: UserSessionPayload = {
        sub: 'client_001',
        code: 'USER-ACCESS-CODE-999',
        role: 'user',
      };

      // Expire immediately (negative duration)
      const token = await createSessionToken(payload, -10);
      const verified = await verifySessionToken(token);
      expect(verified).toBeNull();
    });
  });

  describe('Environment Configuration & Validation', () => {
    it('validates server env configuration', () => {
      const env = getServerEnv();
      expect(env).toBeDefined();
      expect(env.ADMIN_ACCESS_CODE).toBe('TEST-ADMIN-SECURE-12345');
      expect(isAdminConfigured()).toBe(true);
    });
  });
});
