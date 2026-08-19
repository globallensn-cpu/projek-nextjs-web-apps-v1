import 'server-only';
import { UserDoc } from './schema';

const usersStore = new Map<string, UserDoc>();

export async function getOrCreateUser(
  uid: string,
  email: string,
  name?: string
): Promise<UserDoc> {
  const existing = usersStore.get(uid);
  const now = new Date().toISOString();

  if (existing) {
    const updatedUser: UserDoc = {
      ...existing,
      email: email || existing.email,
      name: name !== undefined ? name : existing.name,
      updatedAt: now,
    };
    usersStore.set(uid, updatedUser);
    return updatedUser;
  }

  const newUser: UserDoc = {
    uid,
    email,
    name: name || null,
    role: 'user',
    accessCode: null,
    createdAt: now,
    updatedAt: now,
  };

  usersStore.set(uid, newUser);
  return newUser;
}

export async function getUserById(uid: string): Promise<UserDoc | null> {
  return usersStore.get(uid) || null;
}

export async function updateUserRole(uid: string, role: UserDoc['role']): Promise<void> {
  const existing = usersStore.get(uid);
  if (existing) {
    existing.role = role;
    existing.updatedAt = new Date().toISOString();
    usersStore.set(uid, existing);
  }
}
