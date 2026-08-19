import 'server-only';
import { z } from 'zod';

export const ServerEnvSchema = z.object({
  GEMINI_API_KEY: z.string().default(''),
  APP_URL: z.string().default(''),
  ADMIN_ACCESS_CODE: z.string().default(''),
  SESSION_SECRET: z.string().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv && process.env.NODE_ENV !== 'test') {
    return cachedEnv;
  }

  const parsed = ServerEnvSchema.parse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    APP_URL: process.env.APP_URL || '',
    ADMIN_ACCESS_CODE: process.env.ADMIN_ACCESS_CODE || '',
    SESSION_SECRET: process.env.SESSION_SECRET || '',
    NODE_ENV: process.env.NODE_ENV || 'development',
  });

  if (process.env.NODE_ENV !== 'test') {
    cachedEnv = parsed;
  }

  return parsed;
}

export function isAdminConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.ADMIN_ACCESS_CODE && env.ADMIN_ACCESS_CODE.trim().length >= 8);
}
