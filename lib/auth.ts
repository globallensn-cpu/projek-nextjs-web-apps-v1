import { getClients } from './admin/clients';

export interface UserSession {
  code: string;
  role: 'admin' | 'user';
  name?: string;
  email?: string;
  loginTime: number;
}

export interface AccessCodeItem {
  code: string;
  note: string;
  createdAt: number;
}

const STORAGE_SESSION_KEY = 'satset_user_session';
const STORAGE_CODES_KEY = 'satset_valid_access_codes';

export function getAccessCodes(): AccessCodeItem[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_CODES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveAccessCodes(codes: AccessCodeItem[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_CODES_KEY, JSON.stringify(codes));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('satset_access_codes_updated'));
    }
  } catch {
    // ignore
  }
}

export function addSpecificAccessCode(code: string, note: string = 'Pembelian Paket Satset'): AccessCodeItem {
  const current = getAccessCodes();
  const existing = current.find(c => c.code.toUpperCase() === code.toUpperCase());
  if (existing) return existing;
  
  const newItem: AccessCodeItem = {
    code: code.toUpperCase(),
    note,
    createdAt: Date.now(),
  };
  const updated = [newItem, ...current];
  saveAccessCodes(updated);

  // Sync to backend
  fetch('/api/access-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: newItem.code, note: newItem.note }),
  }).catch(() => {});

  return newItem;
}

export function removeAccessCode(codeToRemove: string) {
  const current = getAccessCodes();
  const updated = current.filter((item) => item.code.toUpperCase() !== codeToRemove.toUpperCase());
  saveAccessCodes(updated);

  // Sync to backend
  fetch('/api/access-codes/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: codeToRemove }),
  }).catch(() => {});
}

/**
 * Authoritative asynchronous access verification via server API
 */
export async function verifyAccessCodeAsync(input: string): Promise<{
  success: boolean;
  role?: 'admin' | 'user';
  email?: string;
  code?: string;
  name?: string;
  error?: string;
}> {
  const cleaned = input.trim();
  if (!cleaned) {
    return { success: false, error: 'Masukkan Kode Akses Anda.' };
  }

  try {
    const response = await fetch('/api/verify-access-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessCode: cleaned }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.success) {
        const session: UserSession = {
          code: data.code || cleaned,
          role: data.role || 'user',
          name: data.name || (data.role === 'admin' ? 'Administrator' : 'Klien Satset'),
          email: data.email,
          loginTime: Date.now(),
        };
        setUserSession(session);
        return data;
      }
      return { success: false, error: data?.error || 'Kode Akses tidak valid.' };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || 'Autentikasi gagal. Pastikan Kode Akses benar.',
      };
    }
  } catch (e: any) {
    return {
      success: false,
      error: 'Terjadi kesalahan saat menghubungi server autentikasi.',
    };
  }
}

/**
 * Synchronous client-only validation fallback for cached UI state
 */
export function verifyAccessCode(input: string): {
  success: boolean;
  role?: 'admin' | 'user';
  email?: string;
  code?: string;
  name?: string;
  error?: string;
} {
  const cleaned = input.trim().toUpperCase();
  if (!cleaned) {
    return { success: false, error: 'Masukkan Kode Akses Anda.' };
  }

  // Lookup in client cache
  const clients = getClients();
  const foundClient = clients.find((c) => c.accessCode && c.accessCode.toUpperCase() === cleaned);

  if (foundClient) {
    if (foundClient.status === 'suspended') {
      return {
        success: false,
        error: 'Akses Anda saat ini ditangguhkan. Silakan hubungi administrator.',
      };
    }
    if (foundClient.status === 'expired') {
      return {
        success: false,
        error: 'Masa aktif kode akses telah kedaluwarsa. Silakan perpanjang paket Anda.',
      };
    }
    return {
      success: true,
      role: 'user',
      code: foundClient.accessCode,
      name: foundClient.name || 'Klien Satset',
      email: foundClient.email,
    };
  }

  return {
    success: false,
    error: 'Kode Akses tidak terdaftar. Gunakan verifikasi online.',
  };
}

export function getUserSession(): UserSession | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (raw) {
      const session: UserSession = JSON.parse(raw);
      if (session && session.code) {
        return session;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function setUserSession(session: UserSession | null) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!session) {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    } else {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore
  }
}

export async function logoutUser() {
  setUserSession(null);
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // ignore
  }
}
