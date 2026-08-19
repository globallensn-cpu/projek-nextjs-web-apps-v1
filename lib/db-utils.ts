import { getDataStoreHealth } from '../db/dbService';

/**
 * Data Store Utility Helper
 * Provides robust connection management, retry logic, and health checking.
 */

// Helper to execute an operation with automatic retry on transient failures
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;
      const isTransient =
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT';

      if (!isTransient || attempt >= maxRetries) {
        console.error(`[DB Error] Operation failed after ${attempt} attempts:`, error);
        throw error;
      }

      console.warn(`[DB Warning] Transient error, retrying (${attempt}/${maxRetries}) in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw new Error('Unreachable');
}

/**
 * Perform a database health check.
 * Useful for monitoring endpoints and liveness probes.
 */
export async function checkDatabaseHealth(): Promise<{
  status: string;
  latencyMs: number;
  error?: string;
  mode?: string;
  persistence?: string;
}> {
  const start = Date.now();
  try {
    const res = await getDataStoreHealth();
    return {
      status: res.ok ? 'healthy' : 'degraded',
      latencyMs: Date.now() - start,
      error: res.ok ? undefined : res.detail,
      mode: res.mode,
      persistence: res.persistence,
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error.message || String(error),
    };
  }
}
