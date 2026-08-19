import 'server-only';
import { memoryStore, ClientRecord } from '../dataStore';

export interface IClientRepository {
  getAll(): Promise<ClientRecord[]>;
  getById(id: string): Promise<ClientRecord | null>;
  getByAccessCode(code: string): Promise<ClientRecord | null>;
  save(client: ClientRecord): Promise<ClientRecord>;
  delete(id: string): Promise<boolean>;
}

export class MemoryClientRepository implements IClientRepository {
  async getAll(): Promise<ClientRecord[]> {
    return Array.from(memoryStore.clients.values());
  }

  async getById(id: string): Promise<ClientRecord | null> {
    return memoryStore.clients.get(id) || null;
  }

  async getByAccessCode(code: string): Promise<ClientRecord | null> {
    const clean = code.trim().toUpperCase();
    for (const client of memoryStore.clients.values()) {
      if (client.accessCode && client.accessCode.trim().toUpperCase() === clean) {
        return client;
      }
    }
    return null;
  }

  async save(client: ClientRecord): Promise<ClientRecord> {
    const record: ClientRecord = {
      ...client,
      id: client.id || `cli_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: client.createdAt || new Date().toISOString(),
    };
    memoryStore.clients.set(record.id, record);
    return record;
  }

  async delete(id: string): Promise<boolean> {
    return memoryStore.clients.delete(id);
  }
}

export const clientRepository = new MemoryClientRepository();
