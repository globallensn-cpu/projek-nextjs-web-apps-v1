import 'server-only';
import { getServerEnv } from '../config/env';
import { logger } from '@/utils/logger';

export interface AiCredentialStatus {
  isConfigured: boolean;
  model: string;
  source: 'server_env' | 'none';
  keyMasked: string;
}

/**
 * Server-only AI Credential Provider.
 * All Gemini API keys are maintained and accessed strictly on the server side.
 */
export function getActiveAiApiKey(): string {
  const env = getServerEnv();
  const serverKey = (env.GEMINI_API_KEY || '').trim();
  
  if (!serverKey) {
    logger.warn('[AiCredentialProvider] GEMINI_API_KEY is not configured in server environment.');
    return '';
  }

  return serverKey;
}

/**
 * Safe status descriptor to show in admin dashboard without exposing raw secrets.
 */
export function getAiCredentialStatus(): AiCredentialStatus {
  const key = getActiveAiApiKey();
  const isConfigured = Boolean(key && key.length > 5);

  let keyMasked = 'Not Configured';
  if (isConfigured) {
    const prefix = key.slice(0, 4);
    const suffix = key.slice(-4);
    keyMasked = `${prefix}...${suffix}`;
  }

  return {
    isConfigured,
    model: 'gemini-2.5-flash',
    source: isConfigured ? 'server_env' : 'none',
    keyMasked,
  };
}
