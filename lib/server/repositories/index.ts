import 'server-only';
import {
  memoryStore,
  PackageRecord,
  ConfigRecord,
  AiAgentRecord,
  AccessCodeRecord,
  AnnouncementRecord,
  PromptFormulaRecord,
  TrackingEventRecord,
  LearningItemRecord,
  CategoryTaxonomyRecord,
  AffiliateRecord,
  BannedDeviceRecord,
} from '../dataStore';

export class MemoryPackageRepository {
  async getAll(): Promise<PackageRecord[]> {
    return Array.from(memoryStore.packages.values());
  }
  async getById(id: string): Promise<PackageRecord | null> {
    return memoryStore.packages.get(id) || null;
  }
  async save(pkg: PackageRecord): Promise<PackageRecord> {
    const record = { ...pkg, updatedAt: new Date().toISOString() };
    memoryStore.packages.set(record.id, record);
    return record;
  }
  async delete(id: string): Promise<boolean> {
    return memoryStore.packages.delete(id);
  }
}

export class MemoryConfigRepository {
  async get(id: string): Promise<ConfigRecord | null> {
    return memoryStore.configs.get(id) || null;
  }
  async save(id: string, data: Record<string, unknown>): Promise<ConfigRecord> {
    const existing = memoryStore.configs.get(id) || { id };
    const updated = { ...existing, ...data, id, updatedAt: Date.now() };
    memoryStore.configs.set(id, updated);
    return updated;
  }
}

export class MemoryAiAgentRepository {
  async getAll(): Promise<AiAgentRecord[]> {
    return Array.from(memoryStore.aiAgents.values());
  }
  async getById(id: string): Promise<AiAgentRecord | null> {
    return memoryStore.aiAgents.get(id) || null;
  }
  async save(agent: AiAgentRecord): Promise<AiAgentRecord> {
    const record = { ...agent, updatedAt: new Date().toISOString() };
    memoryStore.aiAgents.set(record.id, record);
    return record;
  }
  async delete(id: string): Promise<boolean> {
    return memoryStore.aiAgents.delete(id);
  }
}

export class MemoryAccessCodeRepository {
  async getAll(): Promise<AccessCodeRecord[]> {
    return Array.from(memoryStore.accessCodes.values());
  }
  async getByCode(code: string): Promise<AccessCodeRecord | null> {
    const clean = code.trim().toUpperCase();
    for (const record of memoryStore.accessCodes.values()) {
      if (record.code.trim().toUpperCase() === clean) {
        return record;
      }
    }
    return null;
  }
  async save(codeItem: AccessCodeRecord): Promise<AccessCodeRecord> {
    const record: AccessCodeRecord = {
      ...codeItem,
      id: codeItem.code.toUpperCase(),
      code: codeItem.code.toUpperCase(),
      createdAt: codeItem.createdAt || Date.now(),
    };
    memoryStore.accessCodes.set(record.code, record);
    return record;
  }
  async delete(code: string): Promise<boolean> {
    return memoryStore.accessCodes.delete(code.toUpperCase());
  }
}

export class MemoryAnnouncementRepository {
  async getAll(): Promise<AnnouncementRecord[]> {
    return Array.from(memoryStore.announcements.values());
  }
  async save(announcement: AnnouncementRecord): Promise<AnnouncementRecord> {
    const record = { ...announcement, id: announcement.id || `ann_${Date.now()}` };
    memoryStore.announcements.set(record.id, record);
    return record;
  }
  async delete(id: string): Promise<boolean> {
    return memoryStore.announcements.delete(id);
  }
}

export class MemoryPromptFormulaRepository {
  async getAll(): Promise<PromptFormulaRecord[]> {
    return Array.from(memoryStore.promptFormulas.values());
  }
  async save(formula: PromptFormulaRecord): Promise<PromptFormulaRecord> {
    const record = { ...formula, id: formula.id || `pf_${Date.now()}` };
    memoryStore.promptFormulas.set(record.id, record);
    return record;
  }
  async delete(id: string): Promise<boolean> {
    return memoryStore.promptFormulas.delete(id);
  }
}

export class MemoryTrackingRepository {
  async getAll(): Promise<TrackingEventRecord[]> {
    return Array.from(memoryStore.trackingEvents.values());
  }
  async log(event: Partial<TrackingEventRecord>): Promise<TrackingEventRecord> {
    const record: TrackingEventRecord = {
      id: event.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      eventType: event.eventType || 'unknown',
      clientAccessCode: event.clientAccessCode,
      timestamp: event.timestamp || Date.now(),
      metadata: event.metadata || {},
    };
    memoryStore.trackingEvents.set(record.id, record);
    return record;
  }
}

export class MemoryLearningRepository {
  async getAll(): Promise<LearningItemRecord[]> {
    return Array.from(memoryStore.learningQueue.values());
  }
  async add(item: Partial<LearningItemRecord>): Promise<LearningItemRecord> {
    const record: LearningItemRecord = {
      id: item.id || `learn_${Date.now()}`,
      input: item.input || '',
      output: item.output || '',
      category: item.category || 'general',
      score: item.score,
      status: item.status || 'pending',
      createdAt: Date.now(),
    };
    memoryStore.learningQueue.set(record.id, record);
    return record;
  }
  async updateStatus(id: string, status: 'pending' | 'approved' | 'rejected'): Promise<boolean> {
    const found = memoryStore.learningQueue.get(id);
    if (!found) return false;
    found.status = status;
    memoryStore.learningQueue.set(id, found);
    return true;
  }
}

export class MemoryAffiliateRepository {
  async getAll(): Promise<AffiliateRecord[]> {
    return Array.from(memoryStore.affiliates.values());
  }
  async getByCode(code: string): Promise<AffiliateRecord | null> {
    return memoryStore.affiliates.get(code.toUpperCase()) || null;
  }
  async save(affiliate: AffiliateRecord): Promise<AffiliateRecord> {
    const record = { ...affiliate, code: affiliate.code.toUpperCase() };
    memoryStore.affiliates.set(record.code, record);
    return record;
  }
}

export class MemoryBannedDeviceRepository {
  async getAll(): Promise<BannedDeviceRecord[]> {
    return Array.from(memoryStore.bannedDevices.values());
  }
  async isBanned(deviceId: string): Promise<boolean> {
    return memoryStore.bannedDevices.has(deviceId);
  }
  async ban(deviceId: string, reason: string): Promise<BannedDeviceRecord> {
    const record: BannedDeviceRecord = { id: deviceId, deviceId, reason, createdAt: Date.now() };
    memoryStore.bannedDevices.set(deviceId, record);
    return record;
  }
  async unban(deviceId: string): Promise<boolean> {
    return memoryStore.bannedDevices.delete(deviceId);
  }
}

export * from './clientRepository';
export * from './transactionRepository';

export const packageRepository = new MemoryPackageRepository();
export const configRepository = new MemoryConfigRepository();
export const aiAgentRepository = new MemoryAiAgentRepository();
export const accessCodeRepository = new MemoryAccessCodeRepository();
export const announcementRepository = new MemoryAnnouncementRepository();
export const promptFormulaRepository = new MemoryPromptFormulaRepository();
export const trackingRepository = new MemoryTrackingRepository();
export const learningRepository = new MemoryLearningRepository();
export const affiliateRepository = new MemoryAffiliateRepository();
export const bannedDeviceRepository = new MemoryBannedDeviceRepository();
