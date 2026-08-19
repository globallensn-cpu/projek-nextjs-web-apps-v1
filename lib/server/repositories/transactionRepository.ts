import 'server-only';
import { memoryStore, TransactionRecord } from '../dataStore';

export interface ITransactionRepository {
  getAll(): Promise<TransactionRecord[]>;
  getById(id: string): Promise<TransactionRecord | null>;
  save(transaction: TransactionRecord): Promise<TransactionRecord>;
  delete(id: string): Promise<boolean>;
}

export class MemoryTransactionRepository implements ITransactionRepository {
  async getAll(): Promise<TransactionRecord[]> {
    return Array.from(memoryStore.transactions.values()).sort((a, b) => {
      const timeA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
      const timeB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
      return timeB - timeA;
    });
  }

  async getById(id: string): Promise<TransactionRecord | null> {
    return memoryStore.transactions.get(id) || null;
  }

  async save(transaction: TransactionRecord): Promise<TransactionRecord> {
    const record: TransactionRecord = {
      ...transaction,
      id: transaction.id || `TX-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: transaction.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    memoryStore.transactions.set(record.id, record);
    return record;
  }

  async delete(id: string): Promise<boolean> {
    return memoryStore.transactions.delete(id);
  }
}

export const transactionRepository = new MemoryTransactionRepository();
