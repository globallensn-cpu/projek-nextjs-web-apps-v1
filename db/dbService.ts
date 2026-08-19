import 'server-only';
import {
  clientRepository,
  transactionRepository,
  packageRepository,
  configRepository,
  aiAgentRepository,
  accessCodeRepository,
  announcementRepository,
  promptFormulaRepository,
  trackingRepository,
  learningRepository,
  affiliateRepository,
  bannedDeviceRepository,
} from '../lib/server/repositories';
import { memoryStore, DataStoreHealth } from '../lib/server/dataStore';
import { AiAgentItem, DEFAULT_AI_AGENTS } from '../lib/admin/aiAgents';
import { ClientItem, DEFAULT_CLIENTS } from '../lib/admin/clients';
import { PackageItem, DEFAULT_PACKAGES } from '../lib/admin/packages';
import { Transaction, QrisConfig } from '../lib/payment';
import { ContactSettings, DEFAULT_CONTACT_SETTINGS } from '../lib/admin/contactSettings';
import { AuditLogItem, DEFAULT_AUDIT_LOGS } from '../lib/admin/auditLog';
import { GrowthScalingState, DEFAULT_GROWTH_STATE } from '../lib/admin/growthScaling';

export class DatabaseError extends Error {
  public statusCode: number;
  public code?: string | number;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'DatabaseError';
    const err = originalError as { code?: string | number; status?: number } | undefined;
    this.code = err?.code || err?.status;
    this.statusCode = 500;
  }
}

export async function getDataStoreHealth(): Promise<{
  ok: boolean;
  status: string;
  mode: string;
  persistence: string;
  detail: string;
  timestamp: string;
}> {
  const health: DataStoreHealth = memoryStore.getHealth();
  return {
    ok: health.status === 'healthy',
    status: 'OPERATIONAL',
    mode: health.mode,
    persistence: health.persistence,
    detail: health.detail,
    timestamp: new Date(health.timestamp).toISOString(),
  };
}

export async function testDataStoreHealth(): Promise<{
  ok: boolean;
  status: string;
  code?: string | number;
  message?: string;
  projectId: string;
  dataStoreId: string;
  timestamp: string;
}> {
  const health = await getDataStoreHealth();
  return {
    ok: health.ok,
    status: 'OPERATIONAL',
    message: health.detail,
    projectId: 'satset-ai-local',
    dataStoreId: 'data-store',
    timestamp: health.timestamp,
  };
}

const DEFAULT_QRIS_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%23ffffff"/><rect x="20" y="20" width="260" height="260" fill="none" stroke="%233525cd" stroke-width="4"/><path d="M40 40h70v70H40zM190 40h70v70h-70zM40 190h70v70H40z" fill="%233525cd"/><path d="M55 55h40v40H55zM205 55h40v40h-40zM55 205h40v40H55z" fill="%23ffffff"/><path d="M130 40h30v30h-30zM130 90h40v40h-40zM180 130h30v30h-30zM130 180h40v40h-40zM190 190h30v30h-30zM230 220h30v30h-30zM150 240h30v30h-30z" fill="%233525cd"/><text x="150" y="280" font-family="sans-serif" font-size="12" font-weight="bold" fill="%233525cd" text-anchor="middle">QRIS SATSET OFFICIAL</text></svg>`;
const DEFAULT_QRIS: QrisConfig = {
  imageBase64: DEFAULT_QRIS_SVG,
  merchantName: 'Tools Satset Official (QRIS ALL PAYMENT)',
};
const DEFAULT_TRANSACTIONS: Transaction[] = [];

export const ALL_23_AI_AGENTS: AiAgentItem[] = [
  ...DEFAULT_AI_AGENTS,
  {
    id: 'agent_ingestion_monitor',
    name: 'Agent Monitor Ingestion & URL Fetcher',
    role: 'Memantau URL/submission baru',
    model: 'gemini-3.1-flash-lite',
    status: 'active',
    callsCount: 32,
    approvedPatternsCount: 0,
    rejectedPatternsCount: 0,
  },
];

export async function initDbSeed() {
  memoryStore.initDefaultSeed();
}

// In-Memory store maps for generic config docs
const customDocStore = new Map<string, Record<string, unknown>>();

async function getDocData<T>(collectionName: string, docId: string, fallbackDefault: T): Promise<T> {
  const key = `${collectionName}:${docId}`;
  const found = customDocStore.get(key);
  if (found !== undefined) {
    return found as unknown as T;
  }
  return fallbackDefault;
}

async function saveDoc(collectionName: string, id: string, data: unknown): Promise<void> {
  const key = `${collectionName}:${id}`;
  customDocStore.set(key, data as Record<string, unknown>);
}

async function deleteDoc(collectionName: string, id: string): Promise<void> {
  const key = `${collectionName}:${id}`;
  customDocStore.delete(key);
}

// Client Operations
export async function dbGetClients(): Promise<ClientItem[]> {
  const list = await clientRepository.getAll();
  return list.length > 0 ? (list as unknown as ClientItem[]) : DEFAULT_CLIENTS;
}
export async function dbSaveClient(client: ClientItem): Promise<void> {
  await clientRepository.save(client as any);
}
export async function dbDeleteClient(id: string): Promise<void> {
  await clientRepository.delete(id);
}

// Package Operations
export async function dbGetPackages(): Promise<PackageItem[]> {
  const list = await packageRepository.getAll();
  return list.length > 0 ? (list as unknown as PackageItem[]) : DEFAULT_PACKAGES;
}
export async function dbSavePackage(pkg: PackageItem): Promise<void> {
  await packageRepository.save(pkg as any);
}
export async function dbDeletePackage(id: string): Promise<void> {
  await packageRepository.delete(id);
}

// Transaction Operations
export async function dbGetTransactions(): Promise<Transaction[]> {
  const list = await transactionRepository.getAll();
  return list as unknown as Transaction[];
}
export async function dbSaveTransaction(txn: Transaction): Promise<void> {
  await transactionRepository.save(txn as any);
}
export async function dbDeleteTransaction(id: string): Promise<void> {
  await transactionRepository.delete(id);
}

// QRIS Config
export async function dbGetQrisConfig(): Promise<QrisConfig> {
  return getDocData('configs', 'qris', DEFAULT_QRIS);
}
export async function dbSaveQrisConfig(config: QrisConfig): Promise<void> {
  return saveDoc('configs', 'qris', config);
}

// Contact Settings
export async function dbGetContactSettings(): Promise<ContactSettings> {
  return getDocData('configs', 'contactSettings', DEFAULT_CONTACT_SETTINGS);
}
export async function dbSaveContactSettings(settings: ContactSettings): Promise<void> {
  return saveDoc('configs', 'contactSettings', settings);
}

// Audit Logs
export async function dbGetAuditLogs(): Promise<AuditLogItem[]> {
  const logs = await getDocData<AuditLogItem[]>('configs', 'auditLogs', DEFAULT_AUDIT_LOGS);
  return logs;
}
export async function dbAddAuditLog(log: AuditLogItem): Promise<void> {
  const logs = await dbGetAuditLogs();
  const updated = [log, ...logs].slice(0, 200);
  await saveDoc('configs', 'auditLogs', updated);
}

// Growth Scaling State
export async function dbGetGrowthState(): Promise<GrowthScalingState> {
  return getDocData('configs', 'growthState', DEFAULT_GROWTH_STATE);
}
export async function dbSaveGrowthState(state: GrowthScalingState): Promise<void> {
  return saveDoc('configs', 'growthState', state);
}

// AI Agents
export async function dbGetAiAgents(): Promise<AiAgentItem[]> {
  const list = await aiAgentRepository.getAll();
  return list.length > 0 ? (list as unknown as AiAgentItem[]) : ALL_23_AI_AGENTS;
}
export async function dbSaveAiAgent(agent: AiAgentItem): Promise<void> {
  await aiAgentRepository.save(agent as any);
}
export async function dbDeleteAiAgent(id: string): Promise<void> {
  await aiAgentRepository.delete(id);
}

// Access Codes
export async function dbGetAccessCodes(): Promise<any[]> {
  const list = await accessCodeRepository.getAll();
  return list;
}
export async function dbSaveAccessCode(code: any): Promise<void> {
  await accessCodeRepository.save(code);
}
export async function dbDeleteAccessCode(code: string): Promise<void> {
  await accessCodeRepository.delete(code);
}

// Active Generations
export async function dbGetActiveGenerations(): Promise<any> {
  return getDocData('configs', 'activeGenerations', {});
}
export async function dbSaveActiveGenerations(data: any): Promise<void> {
  return saveDoc('configs', 'activeGenerations', data);
}

// Events (Tracking)
export async function dbGetTrackingEvents(): Promise<any[]> {
  return trackingRepository.getAll();
}
export async function dbAddTrackingEvent(event: any): Promise<void> {
  await trackingRepository.log(event);
}

// Learning Queue
export async function dbGetLearningQueue(): Promise<any[]> {
  return learningRepository.getAll();
}
export async function dbSaveLearningQueueItem(item: any): Promise<void> {
  await learningRepository.add(item);
}

// System Memory
export async function dbGetSystemMemory(): Promise<any> {
  const defaultMem = {
    totalExecutions: 350,
    successfulPromptsCount: 342,
    learnedKnowledgeBase: ['Hook visual di 3 detik pertama meningkatkan retention rate hingga 68%.'],
    viralHookPatterns: [{ id: 'hk_01', pattern: 'Jangan beli [produk] sebelum tau 3 hal ini!', category: 'umum', confidence: 95 }],
    categoryUsage: { fashion: 120, beauty_grooming: 90 },
    formulas: ['Hook BLUFF + 3 Adegan Visual + CTA Spesifik'],
    lastUpdated: new Date().toISOString(),
  };
  return getDocData('configs', 'systemMemory', defaultMem);
}
export async function dbSaveSystemMemory(mem: any): Promise<void> {
  return saveDoc('configs', 'systemMemory', mem);
}

// API Keys
export async function dbGetApiKeys(): Promise<any[]> {
  const data = await getDocData<{ keys: any[] }>('configs', 'apiKeys', { keys: [] });
  return data?.keys || [];
}
export async function dbSaveApiKeys(keys: any[]): Promise<void> {
  return saveDoc('configs', 'apiKeys', { keys });
}

// Category Taxonomy
export async function dbGetCategoryTaxonomy(): Promise<any[]> {
  return getDocData('configs', 'categoryTaxonomy', []);
}
export async function dbSaveCategoryTaxonomyItem(item: any): Promise<void> {
  const items = await dbGetCategoryTaxonomy();
  const filtered = items.filter((i: any) => i.id !== item.id);
  await saveDoc('configs', 'categoryTaxonomy', [...filtered, item]);
}

// Category Proposals
export async function dbGetCategoryProposals(): Promise<any[]> {
  return getDocData('configs', 'categoryTaxonomyProposals', []);
}
export async function dbSaveCategoryProposal(prop: any): Promise<void> {
  const items = await dbGetCategoryProposals();
  const filtered = items.filter((i: any) => i.id !== prop.id);
  await saveDoc('configs', 'categoryTaxonomyProposals', [...filtered, prop]);
}

// Announcements & Broadcast
export async function dbGetAnnouncements(): Promise<any[]> {
  return announcementRepository.getAll();
}
export async function dbSaveAnnouncement(item: any): Promise<void> {
  await announcementRepository.save(item);
}
export async function dbDeleteAnnouncement(id: string): Promise<void> {
  await announcementRepository.delete(id);
}

// Master Prompt Formulas
export async function dbGetFormulas(): Promise<any[]> {
  return promptFormulaRepository.getAll();
}
export async function dbSaveFormula(item: any): Promise<void> {
  await promptFormulaRepository.save(item);
}
export async function dbDeleteFormula(id: string): Promise<void> {
  await promptFormulaRepository.delete(id);
}

// Affiliate & Referral System
export async function dbGetAffiliates(): Promise<any[]> {
  return affiliateRepository.getAll();
}
export async function dbSaveAffiliate(item: any): Promise<void> {
  await affiliateRepository.save(item);
}
export async function dbDeleteAffiliate(code: string): Promise<void> {
  memoryStore.affiliates.delete(code.toUpperCase());
}

// Pending Schema Changes
export async function dbGetPendingSchemaChanges(): Promise<any[]> {
  return getDocData('configs', 'pendingSchemaChanges', []);
}
export async function dbSavePendingSchemaChange(change: any): Promise<void> {
  const list = await dbGetPendingSchemaChanges();
  const filtered = list.filter((i: any) => i.id !== change.id);
  await saveDoc('configs', 'pendingSchemaChanges', [...filtered, change]);
}

// Banned Devices & Security Enforcement System
export async function dbGetBannedDevices(): Promise<any[]> {
  return bannedDeviceRepository.getAll();
}
export async function dbSaveBannedDevice(device: any): Promise<void> {
  await bannedDeviceRepository.ban(device.id || device.fingerprint || device.ip, device.reason || 'Banned');
}
export async function dbDeleteBannedDevice(id: string): Promise<void> {
  await bannedDeviceRepository.unban(id);
}

// User UI Customization Config
export async function dbGetUserUiSettings(): Promise<any> {
  return getDocData('configs', 'userUiSettings', {
    logoTitle: 'Tools Satset AI',
    logoBadgeText: 'TS',
    logoImageUrl: '',
    logoThemeColor: '#3525cd',
    headerHelpText: 'Bantuan & CS',
    showAntiLimitBadge: true,
    antiLimitBadgeText: 'Anti-Limit AI Engine Active',
    showAnnouncement: true,
    announcementText: '🔥 Update Baru: Model Gemini 2.5 Flash Ultra Aktif. Proses analisis prompt & ide konten 3x lebih cepat!',
    announcementBg: '#1e1b4b',
    announcementTextColor: '#fbbf24',
    toolsConfig: [
      { id: 'pengaturan', label: 'Pengaturan System', badge: 'WAJIB', enabled: true, icon: 'key' },
      { id: 'tiktok', label: 'TikTok Downloader', badge: 'FREE', enabled: true, icon: 'download' },
      { id: 'prompt', label: 'Video-to-Prompt AI', badge: 'HOT', enabled: true, icon: 'video' },
      { id: 'photo', label: 'Prompt Foto Nano', badge: 'ULTRA', enabled: true, icon: 'camera' },
      { id: 'ideas', label: 'Ide Konten AI (AEO)', badge: 'FYP', enabled: true, icon: 'lightbulb' },
      { id: 'shop_ideas', label: 'TikTok Shop to Ideas', badge: 'PRO', enabled: true, icon: 'shopping' },
      { id: 'extractor', label: 'Video Frame Extractor', badge: '8K', enabled: true, icon: 'scissors' },
      { id: 'paket', label: 'Paket Akses & Lisensi', badge: '', enabled: true, icon: 'credit-card' },
    ],
    showWelcomeCard: true,
    welcomeTitle: 'Selamat Datang di Workspace Tools Satset AI',
    welcomeSubtitle: 'Kelola & ciptakan konten viral dari video, prompt foto nano, ide konten FYP hingga ekstraksi frame dalam satu sistem otomatis.',
    pageBgColor: '#fcf8ff',
    primaryColor: '#3525cd',
    sidebarStyle: 'light',
    footerText: '© 2026 Tools Satset AI - Multi-Engine Content Suite',
    supportWaText: 'Hubungi Support CS WhatsApp',
    updatedAt: new Date().toISOString(),
  });
}
export async function dbSaveUserUiSettings(data: any): Promise<void> {
  return saveDoc('configs', 'userUiSettings', data);
}

export async function dbGetLoginUiSettings(): Promise<any> {
  return getDocData('configs', 'loginUiSettings', {
    logoTitle: 'Tools Satset',
    logoBadgeText: 'TS',
    logoImageUrl: '',
    logoThemeColor: '#3525cd',
    headerHelpText: 'Bantuan',
    heroTitle: 'Buat lebih banyak konten dari satu video',
    heroImageUrl: '',
    bannerCardTitle: 'Workspace AI All-in-One',
    bannerCardDescription: 'Generator Ide Konten, Video-to-Prompt, Prompt Foto Nano Banana Ultra, dan Frame Extractor dalam satu platform satset.',
    bannerGradientFrom: '#1e1b4b',
    bannerGradientTo: '#3525cd',
    featurePoints: [
      { id: 'fp_1', icon: 'lightbulb', title: 'Ide konten' },
      { id: 'fp_2', icon: 'video', title: 'Prompt video' },
      { id: 'fp_3', icon: 'camera', title: 'Prompt foto' },
      { id: 'fp_4', icon: 'crop', title: 'Ekstraksi frame' },
    ],
    formTitle: 'Masuk ke workspace Anda',
    formSubtitle: 'Gunakan Kode Akses Anda untuk melanjutkan.',
    inputLabel: 'Kode Akses',
    inputPlaceholder: 'Masukkan kode akses Anda',
    buttonText: 'Masuk ke aplikasi',
    buttonLoadingText: 'Memverifikasi...',
    buttonColor: '#3525cd',
    paketAksesButtonText: 'Belum punya kode akses? Lihat paket akses',
    showPaketAksesLink: true,
    waButtonText: 'Konsultasi melalui WhatsApp',
    showWaButton: true,
    footerItems: ['Akses aman', 'Tanpa password', 'Bantuan langsung'],
    pageBgColor: '#fcf8ff',
    bgPatternUrl: '',
    updatedAt: new Date().toISOString(),
  });
}
export async function dbSaveLoginUiSettings(data: any): Promise<void> {
  return saveDoc('configs', 'loginUiSettings', data);
}
