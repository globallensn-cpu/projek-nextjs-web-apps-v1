import 'server-only';

export interface DataStoreHealth {
  status: 'healthy' | 'degraded' | 'error';
  mode: 'memory';
  persistence: 'in-memory-non-persistent';
  detail: string;
  timestamp: number;
}

export interface ClientRecord {
  id: string;
  accessCode: string;
  name: string;
  whatsapp: string;
  email: string;
  packageId: string;
  packageName: string;
  price: number;
  startDate: string;
  expiryDate: string;
  status: 'active' | 'expired' | 'suspended';
  type: 'standard' | 'custom';
  customTools?: string[];
  createdAt: string;
  notes?: string;
}

export interface TransactionRecord {
  id: string;
  customerName?: string;
  clientName?: string;
  whatsapp?: string;
  clientWhatsapp?: string;
  email?: string;
  clientEmail?: string;
  planId?: string;
  packageId?: string;
  planName?: string;
  packageName?: string;
  amount?: number;
  totalPrice?: number;
  paymentMethod?: string;
  status: 'PENDING_PAYMENT' | 'AWAITING_VERIFICATION' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'pending' | 'pending_verification' | 'success' | 'rejected';
  accessCode?: string;
  accessCodeGenerated?: string;
  paymentProofBase64?: string;
  proofImageBase64?: string;
  paymentProofImage?: string;
  rejectReason?: string;
  createdAt: number | string;
  updatedAt: number | string;
  durationDays?: number;
  expiresAt?: string | number;
}

export interface PackageRecord {
  id: string;
  name: string;
  tagline?: string;
  description: string;
  price: number;
  originalPrice?: number;
  durationDays: number;
  features: string[];
  toolsIncluded: string[];
  isPopular?: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConfigRecord {
  id: string;
  [key: string]: unknown;
}

export interface AiAgentRecord {
  id: string;
  name: string;
  role: string;
  description: string;
  systemPrompt: string;
  avatarUrl?: string;
  model: string;
  temperature: number;
  status: 'active' | 'inactive';
  capabilities?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AccessCodeRecord {
  id: string;
  code: string;
  note: string;
  role?: 'admin' | 'user';
  createdAt: number;
}

export interface AnnouncementRecord {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'promo';
  isActive: boolean;
  createdAt: number;
}

export interface PromptFormulaRecord {
  id: string;
  title: string;
  category: string;
  template: string;
  description: string;
  tags: string[];
  createdAt: number;
}

export interface TrackingEventRecord {
  id: string;
  eventType: string;
  clientAccessCode?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface LearningItemRecord {
  id: string;
  input: string;
  output: string;
  category: string;
  score?: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface CategoryTaxonomyRecord {
  id: string;
  name: string;
  subcategories: string[];
  description?: string;
}

export interface AffiliateRecord {
  id: string;
  code: string;
  name: string;
  phone: string;
  commissionRate: number;
  balance: number;
  totalEarnings: number;
  createdAt: number;
}

export interface BannedDeviceRecord {
  id: string;
  deviceId: string;
  reason: string;
  createdAt: number;
}

// In-Memory Global Store State (Isolated across process runtime)
class MemoryDataStore {
  public clients: Map<string, ClientRecord> = new Map();
  public transactions: Map<string, TransactionRecord> = new Map();
  public packages: Map<string, PackageRecord> = new Map();
  public configs: Map<string, ConfigRecord> = new Map();
  public aiAgents: Map<string, AiAgentRecord> = new Map();
  public accessCodes: Map<string, AccessCodeRecord> = new Map();
  public announcements: Map<string, AnnouncementRecord> = new Map();
  public promptFormulas: Map<string, PromptFormulaRecord> = new Map();
  public trackingEvents: Map<string, TrackingEventRecord> = new Map();
  public learningQueue: Map<string, LearningItemRecord> = new Map();
  public categoryTaxonomy: Map<string, CategoryTaxonomyRecord> = new Map();
  public affiliates: Map<string, AffiliateRecord> = new Map();
  public bannedDevices: Map<string, BannedDeviceRecord> = new Map();

  private initialized = false;

  constructor() {
    this.initDefaultSeed();
  }

  public initDefaultSeed(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Seed default packages
    const defaultPackages: PackageRecord[] = [
      {
        id: 'pkg_starter',
        name: 'Paket Starter FYP',
        tagline: 'Cocok untuk Pemula & Kreator TikTok Pemula',
        description: 'Akses generator ide konten FYP, formula hook viral, dan prompt foto sinematik standar.',
        price: 49000,
        originalPrice: 99000,
        durationDays: 30,
        features: [
          'Akses Generator Ide Konten FYP (30 Hari)',
          'Formula Hook 3 Detik Teruji',
          'Photo Prompt Architect (50 style)',
          'Export Script VT & Caption siap pakai',
          'Update Tren Algoritma Berkala',
        ],
        toolsIncluded: ['content-ideas', 'photo-prompt', 'tiktok-downloader'],
        isPopular: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pkg_pro',
        name: 'Paket Pro Affiliate & Video AI',
        tagline: 'Paling Populer untuk TikTok Shop & Video Creator',
        description: 'Akses lengkap Video Prompt Generator (Sora/Runway/Kling), TikTok Shop Affiliate Funnel, & Ekstraktor Frame.',
        price: 99000,
        originalPrice: 199000,
        durationDays: 30,
        features: [
          'Semua Fitur Starter Termasuk',
          'Video Prompt Generator AI (Kling, Runway Gen-3, Sora)',
          'TikTok Shop Affiliate Funnel & Hook Review Produk',
          'Video Frame Extractor & Visual Analysis',
          'Prompt Splitter Multi-Scene',
          'Akses Priority Model Gemini AI Engine',
        ],
        toolsIncluded: [
          'content-ideas',
          'photo-prompt',
          'prompt-splitter',
          'tiktok-downloader',
          'tiktok-shop-ideas',
          'video-frame-extractor',
        ],
        isPopular: true,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pkg_lifetime',
        name: 'Paket Ultra VIP Lifetime',
        tagline: 'Investasi Sekali untuk Akses Selamanya',
        description: 'Akses seumur hidup ke semua tools sekarang dan seluruh pembaruan agent masa depan tanpa biaya langganan.',
        price: 249000,
        originalPrice: 499000,
        durationDays: 3650,
        features: [
          'Akses Selamanya (Lifetime Access) Tanpa Perpanjangan',
          'Bebas Akses Seluruh 6 Tools Kreator & Video AI',
          'Gratis Akses Tool Baru yang Dirilis Mendatang',
          'Akses Multi-Agent Intelligence Assistant',
          'Dukungan VIP & Komunitas Kreator Prioritas',
        ],
        toolsIncluded: [
          'content-ideas',
          'photo-prompt',
          'prompt-splitter',
          'tiktok-downloader',
          'tiktok-shop-ideas',
          'video-frame-extractor',
        ],
        isPopular: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ];

    for (const pkg of defaultPackages) {
      this.packages.set(pkg.id, pkg);
    }

    // Seed default QRIS config
    this.configs.set('qris', {
      id: 'qris',
      qrisImageUrl: '',
      qrisText: '',
      merchantName: 'SATSET AI TOOLS',
      accountNumber: '',
      bankName: 'QRIS / E-Wallet',
      updatedAt: Date.now(),
    });

    // Seed default contact config
    this.configs.set('contact', {
      id: 'contact',
      whatsappAdmin: '6281234567890',
      whatsappSupport: '6281234567890',
      telegramChannel: 'https://t.me/satset_ai',
      emailSupport: 'support@satset.ai',
      updatedAt: Date.now(),
    });
  }

  public getHealth(): DataStoreHealth {
    return {
      status: 'healthy',
      mode: 'memory',
      persistence: 'in-memory-non-persistent',
      detail: 'In-Memory Data Store is active and operating normally.',
      timestamp: Date.now(),
    };
  }
}

// Global singleton instance for server runtime
declare global {
  var __memoryDataStore: MemoryDataStore | undefined;
}

const memoryStore: MemoryDataStore = globalThis.__memoryDataStore || new MemoryDataStore();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__memoryDataStore = memoryStore;
}

export { memoryStore };
