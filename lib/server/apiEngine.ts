import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { logger } from '@/utils/logger';
import {
  createSessionToken,
  verifySessionToken,
  timingSafeCompare,
  COOKIE_NAME,
  getSessionCookieOptions,
} from './auth/session';
import { getServerEnv, isAdminConfigured } from './config/env';
import {
  initDbSeed,
  getDataStoreHealth,
  dbGetClients,
  dbSaveClient,
  dbDeleteClient,
  dbGetPackages,
  dbSavePackage,
  dbDeletePackage,
  dbGetTransactions,
  dbSaveTransaction,
  dbDeleteTransaction,
  dbGetQrisConfig,
  dbSaveQrisConfig,
  dbGetContactSettings,
  dbSaveContactSettings,
  dbGetLoginUiSettings,
  dbSaveLoginUiSettings,
  dbGetUserUiSettings,
  dbSaveUserUiSettings,
  dbGetAiAgents,
  dbSaveAiAgent,
  dbDeleteAiAgent,
  dbGetCategoryTaxonomy,
  dbSaveCategoryTaxonomyItem,
  dbGetCategoryProposals,
  dbSaveCategoryProposal,
  dbGetSystemMemory,
  dbSaveSystemMemory,
  dbGetAuditLogs,
  dbAddAuditLog,
  dbGetAccessCodes,
  dbSaveAccessCode,
  dbDeleteAccessCode,
  dbGetAnnouncements,
  dbSaveAnnouncement,
  dbDeleteAnnouncement,
  dbGetFormulas,
  dbSaveFormula,
  dbDeleteFormula,
  dbGetAffiliates,
  dbSaveAffiliate,
  dbDeleteAffiliate,
  dbGetActiveGenerations,
  dbSaveActiveGenerations,
  dbGetTrackingEvents,
  dbAddTrackingEvent,
  dbGetLearningQueue,
  dbSaveLearningQueueItem,
  dbGetBannedDevices,
  dbSaveBannedDevice,
  dbDeleteBannedDevice,
  dbGetApiKeys,
  dbSaveApiKeys,
  dbGetGrowthState,
  dbSaveGrowthState,
} from '@/db/dbService';
import { runIndonesianQueryCouncil } from '@/agents/agentIndonesianQueryCouncil';
import { runStructuredPromptArchitect, isStructureSchemaConsistent } from '@/agents/agentStructuredPromptArchitect';
import { buildAEOPipelinePrompt, formatAEOOutputToMarkdown } from '@/agents/aeoAgentPipeline';
import { dispatchRealtimeBroadcast } from '@/agents/agentRealtimeBroadcastDispatcher';
import {
  evaluateGrowthAndScale,
  getGrowthScalingState,
  rollbackGrowthScalingVersion,
  setFullAutoMode,
  DEFAULT_GROWTH_STATE,
} from '@/lib/admin/growthScaling';
import { DEFAULT_AI_AGENTS } from '@/lib/admin/aiAgents';
import { getModelRoutingPlan } from '@/routing/modelRouter';

// Seed DB on start
let dbInitialized = false;
async function ensureDbInit() {
  if (!dbInitialized) {
    try {
      await initDbSeed();
      dbInitialized = true;
    } catch (e) {
      console.warn('[DbInit Warning]', e);
    }
  }
}

// Banned Devices Cache
interface BannedDeviceItem {
  id: string;
  fingerprint: string;
  ip: string;
  accessCode: string;
  reason: string;
  bannedAt: string;
  bannedBy: string;
}
const bannedDevicesMap = new Map<string, BannedDeviceItem>();

async function loadBannedDevices() {
  try {
    const list = await dbGetBannedDevices();
    bannedDevicesMap.clear();
    for (const b of list) {
      bannedDevicesMap.set(b.id, b);
      if (b.fingerprint) bannedDevicesMap.set(b.fingerprint, b);
      if (b.ip) bannedDevicesMap.set(b.ip, b);
      if (b.accessCode) bannedDevicesMap.set(b.accessCode.toUpperCase(), b);
    }
  } catch (e) {
    logger.warn('[Security Engine] Failed loading banned devices:', e);
  }
}

function isDeviceOrIpBanned(ip: string, fingerprint?: string, accessCode?: string): { banned: boolean; reason?: string } {
  const cleanIp = (ip || '').replace('::ffff:', '').trim();
  const cleanFp = (fingerprint || '').trim();
  const cleanCode = (accessCode || '').trim().toUpperCase();

  for (const item of bannedDevicesMap.values()) {
    if (cleanFp && item.fingerprint && item.fingerprint === cleanFp) {
      return { banned: true, reason: item.reason || 'Perangkat ini telah diblokir secara permanen.' };
    }
    if (cleanIp && item.ip && item.ip === cleanIp) {
      return { banned: true, reason: item.reason || 'Alamat IP Anda telah diblokir secara permanen.' };
    }
    if (cleanCode && item.accessCode && item.accessCode.toUpperCase() === cleanCode) {
      return { banned: true, reason: item.reason || 'Kode Akses ini telah diblokir karena aktivitas mencurigakan.' };
    }
  }
  return { banned: false };
}

// Active generations tracking
const activeGenerationsMap = new Map<string, any>();
const liveEventsQueue: any[] = [];
const promptResponseCache = new Map<string, { timestamp: number; text: string; modelUsed: string; promptArchitect?: any }>();
const PROMPT_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const tiktokCache = new Map<string, { timestamp: number; data: any }>();
const TIKTOK_CACHE_TTL_MS = 10 * 60 * 1000;
const serverKeyCooldowns = new Map<string, number>();

function broadcastLiveEvent(evt: any) {
  const fullEvt = { ...evt, timestamp: Date.now(), id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` };
  liveEventsQueue.push(fullEvt);
  if (liveEventsQueue.length > 200) {
    liveEventsQueue.shift();
  }
}

// System Memory
let systemMemoryState: any = null;
async function getSystemMemory() {
  if (!systemMemoryState) {
    try {
      systemMemoryState = await dbGetSystemMemory();
    } catch {
      systemMemoryState = {
        totalExecutions: 350,
        successfulPromptsCount: 342,
        learnedKnowledgeBase: ['Hook visual di 3 detik pertama meningkatkan retention rate hingga 68%.'],
        viralHookPatterns: [{ id: 'hk_01', pattern: 'Jangan beli [produk] sebelum tau 3 hal ini!', category: 'umum', confidence: 95 }],
        categoryUsage: { videoPrompt: 120, contentIdeas: 90, photoPrompt: 40 },
        formulas: ['Hook BLUFF + 3 Adegan Visual + CTA Spesifik'],
        lastUpdated: new Date().toISOString(),
      };
    }
  }
  return systemMemoryState;
}

async function recordExecution(type: 'videoPrompt' | 'contentIdeas' | 'photoPrompt', keyInsight?: string) {
  const memory = await getSystemMemory();
  if (!memory.categoryUsage) {
    memory.categoryUsage = { videoPrompt: 0, contentIdeas: 0, photoPrompt: 0 };
  }
  memory.totalExecutions = (memory.totalExecutions || 0) + 1;
  memory.successfulPromptsCount = (memory.successfulPromptsCount || 0) + 1;
  memory.categoryUsage[type] = (memory.categoryUsage[type] || 0) + 1;
  if (keyInsight && !memory.learnedKnowledgeBase.includes(keyInsight)) {
    memory.learnedKnowledgeBase.push(keyInsight);
  }
  memory.lastUpdated = new Date().toISOString();
  try {
    await dbSaveSystemMemory(memory);
  } catch {}
}

function getInjectedSystemInstruction(baseInstruction: string, memory: any): string {
  const level = Math.floor((memory?.totalExecutions || 0) / 5) + 1;
  const knowledgeBase = (memory?.learnedKnowledgeBase || []).slice(-5);
  const memoryContext = `\n---[BACKEND ADAPTIVE MEMORY CONTEXT]\nLevel Pemikiran System: Level ${level} (Total Eksekusi: ${memory?.totalExecutions || 0})\nFormulas/Knowledge Terakumulasi:\n${knowledgeBase.map((k: string, i: number) => `${i + 1}. ${k}`).join('\n')}\n---Gunakan konteks pengetahuan di atas untuk mengoptimalkan ketajaman output script/prompt.`;
  return (baseInstruction || '') + memoryContext;
}

function isRealApiKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const k = key.trim();
  if (k.length < 10) return false;
  if (k.includes('demo_key') || k.includes('backup_key_satset') || k.includes('satset_01') || k.includes('satset_02')) {
    return false;
  }
  return true;
}

function normalizeGeminiModel(inputModel: string): string {
  const m = (inputModel || '').toLowerCase().trim();
  if (m === 'gemini-3.6-flash') return 'gemini-3.6-flash';
  if (m === 'gemini-3.1-pro-preview' || m === 'gemini-3.1-pro') return 'gemini-3.1-pro-preview';
  if (m === 'gemini-3.1-flash-lite' || m === 'gemini-3.5-flash-lite') return 'gemini-3.1-flash-lite';
  if (m === 'gemini-2.0-flash' || m === 'gemini-1.5-flash') return 'gemini-3.6-flash';
  if (m === 'gemini-2.0-flash-lite' || m === 'gemini-1.5-flash-lite') return 'gemini-3.1-flash-lite';
  if (m === 'gemini-2.0-pro' || m === 'gemini-1.5-pro') return 'gemini-3.1-pro-preview';
  return inputModel || 'gemini-3.6-flash';
}

async function getClientIsolatedKeys(customApiKeyHeader?: string, clientAccessCode?: string): Promise<string[]> {
  let userCustomKeys: string[] = [];
  if (customApiKeyHeader && customApiKeyHeader.trim()) {
    userCustomKeys = customApiKeyHeader
      .split(/[\n,]+/)
      .map((k) => k.trim())
      .filter((k) => isRealApiKey(k));
  }
  let boundKeys: string[] = [];
  if (clientAccessCode && clientAccessCode !== 'GUEST') {
    const cleanCode = clientAccessCode.trim().toUpperCase();
    try {
      const keysArr = await dbGetApiKeys();
      boundKeys = keysArr
        .filter((k: any) => k.status === 'active' && k.accessCode && k.accessCode.toUpperCase() === cleanCode && isRealApiKey(k.key))
        .map((k: any) => k.key);
    } catch {}
  }
  const clientKeys = Array.from(new Set([...userCustomKeys, ...boundKeys])).filter((k) => isRealApiKey(k));
  if (clientKeys.length > 0) return clientKeys;

  const systemKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
  let globalKeys: string[] = [];
  try {
    const keysArr = await dbGetApiKeys();
    globalKeys = keysArr
      .filter((k: any) => k.status === 'active' && (!k.accessCode || k.accessCode === 'SYSTEM' || k.accessCode === 'GLOBAL') && isRealApiKey(k.key))
      .map((k: any) => k.key);
  } catch {}
  const candidateKeys = Array.from(new Set([...(isRealApiKey(systemKey) ? [systemKey] : []), ...globalKeys])).filter((k) => isRealApiKey(k));
  const now = Date.now();
  const availableKeys = candidateKeys.filter((k) => {
    const cd = serverKeyCooldowns.get(k);
    return !cd || cd < now;
  });
  return availableKeys.length > 0 ? availableKeys : candidateKeys;
}

async function callGeminiWithFallback(
  userSelectedModel: string,
  promptPayload: any,
  customApiKeyHeader?: string,
  clientAccessCode?: string
): Promise<{ text: string; modelUsed: string }> {
  const keyCandidates = await getClientIsolatedKeys(customApiKeyHeader, clientAccessCode);
  const primaryModel = normalizeGeminiModel(userSelectedModel);

  const TOP_MODEL_HIERARCHY = [
    'gemini-3.1-pro-preview',
    'gemini-3.1-pro',
    'gemini-3.6-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
  ];

  let candidateModels = Array.from(new Set([primaryModel, ...TOP_MODEL_HIERARCHY])).filter((m): m is string => Boolean(m && m.trim().length > 0));

  try {
    const plan = getModelRoutingPlan(userSelectedModel, customApiKeyHeader);
    if (plan && plan.targetModels && plan.targetModels.length > 0) {
      const mappedModels = plan.targetModels.map((m) => normalizeGeminiModel(m));
      candidateModels = Array.from(new Set([primaryModel, ...mappedModels, ...TOP_MODEL_HIERARCHY])).filter((m): m is string => Boolean(m && m.trim().length > 0));
    }
  } catch {}

  if (keyCandidates.length === 0) {
    throw new Error('API Key Gemini tidak dikonfigurasi. Silakan atur di Pengaturan Anti Limit.');
  }

  let lastError: any = null;
  const memory = await getSystemMemory();

  for (let kIdx = 0; kIdx < keyCandidates.length; kIdx++) {
    const activeKey = keyCandidates[kIdx];
    let aiInstance: GoogleGenAI;
    try {
      aiInstance = new GoogleGenAI({
        apiKey: activeKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
    } catch {
      continue;
    }

    for (const targetModel of candidateModels) {
      let attempts = 0;
      const maxAttempts = 2;
      while (attempts < maxAttempts) {
        attempts++;
        try {
          const isThinkingModel = targetModel === 'gemini-3.1-pro-preview' || targetModel === 'gemini-3.1-pro';
          const baseConfig = promptPayload.config || {};
          const requestConfig: any = { ...baseConfig };
          const rawInstruction = requestConfig.systemInstruction || 'You are an elite AI assistant.';
          requestConfig.systemInstruction = getInjectedSystemInstruction(rawInstruction, memory);
          if (isThinkingModel) {
            requestConfig.thinkingConfig = { thinkingLevel: 'HIGH' };
            delete requestConfig.maxOutputTokens;
          }

          const response = await aiInstance.models.generateContent({
            model: targetModel,
            contents: promptPayload.contents,
            config: requestConfig,
          });

          if (response && response.text) {
            return { text: response.text, modelUsed: targetModel };
          }
        } catch (err: any) {
          lastError = err;
          const errMsg = String(err?.message || err || '');
          const status = err?.status || err?.statusCode || 0;
          const isDeadKey =
            status === 403 ||
            errMsg.includes('403') ||
            errMsg.includes('API_KEY_INVALID') ||
            errMsg.includes('API key not found') ||
            errMsg.includes('PERMISSION_DENIED') ||
            errMsg.includes('UNAUTHENTICATED');
          const isRateLimitOrQuota =
            status === 429 ||
            errMsg.includes('429') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('Quota exceeded') ||
            errMsg.includes('limit: 0');

          if (isDeadKey || isRateLimitOrQuota) {
            serverKeyCooldowns.set(activeKey, Date.now() + 5 * 60 * 1000);
          }

          if (isDeadKey) {
            attempts = maxAttempts;
            break;
          }
          if (isRateLimitOrQuota) {
            attempts = maxAttempts;
            break;
          }
          if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('demand')) {
            const jitter = Math.floor(Math.random() * 2000);
            await new Promise((resolve) => setTimeout(resolve, 1000 + jitter));
          } else {
            attempts = maxAttempts;
            break;
          }
        }
      }
    }
  }

  const errorMsg = String(lastError?.message || lastError || '');
  if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('Quota exceeded')) {
    const err: any = new Error('Batas kuota harian/menit AI Gemini telah terlampaui (429 Rate Limit). Silakan tambahkan API Key cadangan di menu Anti Limit API.');
    err.statusCode = 429;
    throw err;
  }
  throw lastError || new Error('Gagal menghasilkan prompt dari AI Gemini.');
}

function extractUrlFromText(text: string): string {
  if (!text) return '';
  const match = text.match(/(https?:\/\/[^\s]+)/i);
  return match ? match[1].trim() : text.trim();
}

async function verifyAdminAuth(req: NextRequest, body?: any): Promise<boolean> {
  // 1. Check signed session cookie
  const sessionCookie = req.cookies.get(COOKIE_NAME)?.value;
  if (sessionCookie) {
    const session = await verifySessionToken(sessionCookie);
    if (session && session.role === 'admin') {
      return true;
    }
  }

  // 2. Check Authorization Bearer (signed token)
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const session = await verifySessionToken(token);
    if (session && session.role === 'admin') {
      return true;
    }
  }

  // 3. Check direct ADMIN_ACCESS_CODE with timingSafeCompare if configured
  const env = getServerEnv();
  const configuredAdminCode = env.ADMIN_ACCESS_CODE.trim();

  if (configuredAdminCode.length >= 8) {
    const providedCode = (
      req.headers.get('x-access-code') ||
      req.headers.get('x-admin-code') ||
      req.headers.get('x-client-access-code') ||
      body?.accessCode ||
      ''
    ).trim();

    if (providedCode && timingSafeCompare(providedCode, configuredAdminCode)) {
      return true;
    }
  }

  return false;
}

// Master API Dispatcher for Next.js App Router
export async function handleApiRequest(req: NextRequest, routePath: string): Promise<NextResponse> {
  await ensureDbInit();
  const method = req.method.toUpperCase();
  const normalizedPath = routePath.replace(/^\/+|\/+$/g, '');
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
  const fingerprint = req.headers.get('x-device-fingerprint') || '';
  const accessCodeHeader = req.headers.get('x-access-code') || req.headers.get('x-client-access-code') || '';

  // Parse Body safely
  let body: any = {};
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    try {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        body = await req.json();
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await req.formData();
        body = Object.fromEntries(formData.entries());
      }
    } catch {}
  }

  // Security Check (except unban or health)
  if (!normalizedPath.includes('banned-devices/unban') && normalizedPath !== 'health' && normalizedPath !== 'ping') {
    const banCheck = isDeviceOrIpBanned(clientIp, fingerprint, accessCodeHeader || body?.accessCode);
    if (banCheck.banned) {
      return NextResponse.json(
        {
          error: `Akses Ditolak! Perangkat atau IP Anda telah diblokir secara permanen. Alasan: ${banCheck.reason}`,
          code: 'DEVICE_BANNED',
          isBanned: true,
          reason: banCheck.reason,
        },
        { status: 403 }
      );
    }
  }

  const customApiKeyHeader = req.headers.get('x-custom-api-key') || body?.customApiKey || '';
  const clientAccessCode = (accessCodeHeader || body?.accessCode || body?.clientId || 'GUEST').trim();

  try {
    // -------------------------------------------------------------
    // 1. HEALTH & DIAGNOSTICS
    // -------------------------------------------------------------
    if (normalizedPath === 'health' || normalizedPath === 'ping' || normalizedPath === '') {
      return NextResponse.json({
        status: 'ok',
        version: '1.0.0',
        platform: 'Next.js App Router (Production Ready)',
        timestamp: new Date().toISOString(),
      });
    }

    if (normalizedPath === 'health/data-store' || normalizedPath === 'health/db' || normalizedPath === 'db-health') {
      const health = await getDataStoreHealth();
      return NextResponse.json({
        ok: health.ok,
        status: health.ok ? 'healthy' : 'degraded',
        mode: health.mode,
        persistence: health.persistence,
        detail: health.detail,
        timestamp: health.timestamp,
      });
    }

    // -------------------------------------------------------------
    // 2. AI GENERATION ENDPOINTS
    // -------------------------------------------------------------
    if (normalizedPath === 'generate-prompt' && method === 'POST') {
      const {
        mimeType,
        base64Data,
        model = 'gemini-3.6-flash',
        targetAI = 'general',
        segmentDuration = '10',
      } = body;

      if (!base64Data || !mimeType) {
        return NextResponse.json({ error: 'Data video dan tipe MIME diperlukan' }, { status: 400 });
      }

      let aiGuide = 'Format prompt siap pakai universal untuk semua AI Video Generator (Sora, Runway Gen-3, Kling, Luma, Pika).';
      if (targetAI === 'runway') aiGuide = 'Format prompt dioptimalkan khusus untuk Runway Gen-3 Alpha. Gunakan deskripsi kamera presisi.';
      if (targetAI === 'sora') aiGuide = 'Format prompt dioptimalkan khusus untuk OpenAI Sora dengan fotorealisme tinggi.';
      if (targetAI === 'kling') aiGuide = 'Format prompt dioptimalkan untuk Kling AI dengan tekstur visual detail.';
      if (targetAI === 'luma') aiGuide = 'Format prompt dioptimalkan untuk Luma Dream Machine.';

      const sec = parseInt(segmentDuration, 10) || 10;
      const promptText = `Anda adalah AI Video Prompt Engineer & Sinematografer Kelas Dunia.\nAnalisis video/skrip ini dengan presisi tinggi. ${aiGuide}\nPECAH & BAGI seluruh durasi video menjadi beberapa segmen prompt klip terpisah dengan durasi masing-masing sekitar ${sec} detik.\nUntuk SETIAP segmen klip, sertakan Style, Environment, Tone & Pacing, Camera, Lighting, Actions, Background Sound, Transition, dan Master Prompt AI Video siap copy.`;

      let promptPayload: any = {
        contents: { parts: [] },
        config: { systemInstruction: 'You are an elite video prompt engineering AI.' },
      };

      if (mimeType === 'text/plain') {
        const rawUserText = Buffer.from(base64Data, 'base64').toString('utf-8');
        promptPayload.contents.parts.push({ text: `KONSEP VIDEO/SKRIP USER:\n"""\n${rawUserText}\n"""\n\nTUGAS:\n${promptText}` });
      } else {
        promptPayload.contents.parts.push({ inlineData: { mimeType, data: base64Data } });
        promptPayload.contents.parts.push({ text: promptText });
      }

      const result = await callGeminiWithFallback(model, promptPayload, customApiKeyHeader, clientAccessCode);
      const architect = runStructuredPromptArchitect(result.text, targetAI);
      await recordExecution('videoPrompt', 'Optimasi dynamic video prompt splitting');

      return NextResponse.json({
        prompt: result.text,
        modelUsed: result.modelUsed,
        promptArchitect: architect,
      });
    }

    if (normalizedPath === 'generate-photo-prompt' && method === 'POST') {
      const {
        mimeType,
        base64Data,
        model = 'gemini-3.6-flash',
        targetGenerator = 'midjourney',
        photoStyle = 'commercial',
        aspectRatio = '--ar 16:9',
        negativePrompt,
      } = body;

      if (!base64Data || !mimeType) {
        return NextResponse.json({ error: 'Data gambar/teks dan tipe MIME diperlukan' }, { status: 400 });
      }

      const promptText = `Anda adalah Master Director of Photography Sinematik Global dan Spesialis Google AEO.\nUbah input ini menjadi Master Prompt AI Image Generator (${targetGenerator.toUpperCase()}) bergaya ${photoStyle.toUpperCase()} dengan rasio ${aspectRatio}.\nSertakan format prompt siap copy dalam blok kode Markdown [Master Shot], [Subject], [Environment], [Lighting], [Camera & Optics], [Texture & Quality].`;

      let promptPayload: any = {
        contents: { parts: [] },
        config: { systemInstruction: 'You are an elite photography prompt engineer and AEO specialist.' },
      };

      if (mimeType === 'text/plain') {
        const rawUserText = Buffer.from(base64Data, 'base64').toString('utf-8');
        promptPayload.contents.parts.push({ text: `KONSEP FOTO USER:\n"""\n${rawUserText}\n"""\n\nTUGAS:\n${promptText}` });
      } else {
        promptPayload.contents.parts.push({ inlineData: { mimeType, data: base64Data } });
        promptPayload.contents.parts.push({ text: promptText });
      }

      const result = await callGeminiWithFallback(model, promptPayload, customApiKeyHeader, clientAccessCode);
      await recordExecution('photoPrompt', 'Optimasi Google AEO visual multimodal');

      return NextResponse.json({
        prompt: result.text,
        modelUsed: result.modelUsed,
      });
    }

    if (normalizedPath === 'generate-content-ideas' && method === 'POST') {
      const { topic = 'Ide Konten Viral', contentType = 'video_pendek', tone = 'edukatif_menarik', model = 'gemini-3.6-flash' } = body;
      const promptPayload = {
        contents: {
          parts: [
            {
              text: `Buat 5 Ide Konten TikTok Viral, Hook 3 Detik Pertama, Skrip Video Lengkap, dan Call to Action untuk Topik: "${topic}", Kategori: "${contentType}", Tone: "${tone}".`,
            },
          ],
        },
        config: { systemInstruction: 'Anda adalah Konsultan Strategi Konten TikTok FYP Teratas di Indonesia.' },
      };

      const result = await callGeminiWithFallback(model, promptPayload, customApiKeyHeader, clientAccessCode);
      await recordExecution('contentIdeas', `Optimasi formula hook untuk topik: ${topic}`);

      return NextResponse.json({
        contentIdeasResult: result.text,
        modelUsed: result.modelUsed,
      });
    }

    if (normalizedPath === 'generate-tiktok-shop-ideas' && method === 'POST') {
      const { productName = 'Produk Viral', category = 'Fashion & Beauty', price = 'Rp 99.000', model = 'gemini-3.6-flash' } = body;
      const promptPayload = {
        contents: {
          parts: [
            {
              text: `Buat Strategi Konten Affiliate TikTok Shop Lengkap untuk Produk: "${productName}", Kategori: "${category}", Kisaran Harga: "${price}".\nSertakan 5 Formula Hook FOMO/Solutif, Skrip Live Shopping, Skrip Video VT 30 Detik, dan Optimasi Keranjang Kuning.`,
            },
          ],
        },
        config: { systemInstruction: 'Anda adalah Pakar Penjualan TikTok Shop & Affiliate Marketing Nomor 1.' },
      };

      const result = await callGeminiWithFallback(model, promptPayload, customApiKeyHeader, clientAccessCode);
      await recordExecution('contentIdeas', `Optimasi affiliate sales funnel untuk: ${productName}`);

      return NextResponse.json({
        ideas: result.text,
        modelUsed: result.modelUsed,
      });
    }

    if (normalizedPath === 'transcribe-audio' && method === 'POST') {
      const { base64Data, mimeType = 'audio/mp3', model = 'gemini-3.6-flash' } = body;
      if (!base64Data) {
        return NextResponse.json({ error: 'Data audio diperlukan' }, { status: 400 });
      }
      const promptPayload = {
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: 'Transkripsikan audio ini dengan sangat akurat kata per kata dalam Bahasa Indonesia. Sertakan timestamp jika memungkinkan.' },
          ],
        },
      };
      const result = await callGeminiWithFallback(model, promptPayload, customApiKeyHeader, clientAccessCode);
      return NextResponse.json({ transcript: result.text, modelUsed: result.modelUsed });
    }

    // -------------------------------------------------------------
    // 3. TIKTOK DOWNLOADER & PROXY
    // -------------------------------------------------------------
    if (normalizedPath === 'tiktok/info' && method === 'POST') {
      const { url } = body;
      if (!url || typeof url !== 'string') {
        return NextResponse.json({ error: 'URL TikTok tidak boleh kosong' }, { status: 400 });
      }
      let cleanUrl = extractUrlFromText(url);
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl;
      }

      // Check Cache
      const cached = tiktokCache.get(cleanUrl);
      if (cached && Date.now() - cached.timestamp < TIKTOK_CACHE_TTL_MS) {
        return NextResponse.json(cached.data);
      }

      // Provider 1: TikWM
      try {
        const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}&hd=1`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' },
        });
        const data = await response.json();
        if (data && data.code === 0 && data.data) {
          const v = data.data;
          const result = {
            id: v.id || String(Date.now()),
            title: v.title || 'TikTok Video',
            cover: v.cover || v.origin_cover || '',
            play: v.play || '',
            wmplay: v.wmplay || v.play || '',
            hdplay: v.hdplay || v.play || '',
            music: v.music || '',
            musicTitle: v.music_info?.title || 'Original Audio',
            musicAuthor: v.music_info?.author || v.author?.nickname || '',
            author: {
              id: v.author?.id || '',
              uniqueId: v.author?.unique_id || 'tiktok_user',
              nickname: v.author?.nickname || 'TikTok Creator',
              avatar: v.author?.avatar || '',
            },
            stats: {
              playCount: v.play_count || 0,
              diggCount: v.digg_count || 0,
              commentCount: v.comment_count || 0,
              shareCount: v.share_count || 0,
            },
            images: v.images || null,
          };
          tiktokCache.set(cleanUrl, { timestamp: Date.now(), data: result });
          return NextResponse.json(result);
        }
      } catch {}

      // Provider 2: Tiklydown fallback
      try {
        const fb = await fetch(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(cleanUrl)}`);
        const fbData = await fb.json();
        if (fbData && (fbData.video || fbData.url)) {
          const result = {
            id: fbData.id || String(Date.now()),
            title: fbData.title || 'TikTok Video',
            cover: fbData.cover || '',
            play: fbData.video?.noWatermark || fbData.url || '',
            wmplay: fbData.video?.watermark || fbData.url || '',
            hdplay: fbData.video?.noWatermark || fbData.url || '',
            music: fbData.music?.url || '',
            musicTitle: fbData.music?.title || 'Audio',
            musicAuthor: fbData.music?.author || '',
            author: {
              id: fbData.author?.id || '',
              uniqueId: fbData.author?.unique_id || 'user',
              nickname: fbData.author?.nickname || 'TikTok User',
              avatar: fbData.author?.avatar || '',
            },
            stats: {
              playCount: fbData.stats?.playCount || 0,
              diggCount: fbData.stats?.likeCount || 0,
              commentCount: fbData.stats?.commentCount || 0,
              shareCount: fbData.stats?.shareCount || 0,
            },
            images: fbData.images || null,
          };
          tiktokCache.set(cleanUrl, { timestamp: Date.now(), data: result });
          return NextResponse.json(result);
        }
      } catch {}

      return NextResponse.json({ error: 'Gagal mengambil informasi video TikTok. Pastikan link video publik dan valid.' }, { status: 400 });
    }

    if (normalizedPath === 'tiktok/proxy' && method === 'GET') {
      const url = req.nextUrl.searchParams.get('url');
      if (!url) {
        return new NextResponse('URL parameter is required', { status: 400 });
      }
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
            Referer: 'https://www.tiktok.com/',
          },
        });
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Cache-Control', 'public, max-age=86400');
        return new NextResponse(response.body, { status: response.status, headers });
      } catch (err: any) {
        return new NextResponse(`Proxy error: ${err.message}`, { status: 502 });
      }
    }

    // -------------------------------------------------------------
    // 4. PACKAGES & ACCESS CODES
    // -------------------------------------------------------------
    if (normalizedPath === 'packages' && method === 'GET') {
      const packages = await dbGetPackages();
      return NextResponse.json(packages);
    }

    if (normalizedPath === 'admin/packages' && method === 'POST') {
      const isAuth = verifyAdminAuth(req, body);
      if (!isAuth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const pkg = body;
      await dbSavePackage(pkg);
      return NextResponse.json({ success: true, package: pkg });
    }

    if (normalizedPath === 'access-codes' && method === 'GET') {
      const codes = await dbGetAccessCodes();
      return NextResponse.json(codes);
    }

    if (normalizedPath === 'access-codes' && method === 'POST') {
      const { code, note } = body;
      if (!code) return NextResponse.json({ error: 'Kode diperlukan' }, { status: 400 });
      const item = { code: code.trim().toUpperCase(), note: note || '', createdAt: Date.now() };
      await dbSaveAccessCode(item);
      return NextResponse.json({ success: true, item });
    }

    if (normalizedPath === 'access-codes/remove' && method === 'POST') {
      const { code } = body;
      if (!code) return NextResponse.json({ error: 'Kode diperlukan' }, { status: 400 });
      await dbDeleteAccessCode(code.trim().toUpperCase());
      return NextResponse.json({ success: true });
    }

    // -------------------------------------------------------------
    // AUTHENTICATION & SESSION ENDPOINTS
    // -------------------------------------------------------------
    if ((normalizedPath === 'auth/session' || normalizedPath === 'auth/me') && method === 'GET') {
      const sessionCookie = req.cookies.get(COOKIE_NAME)?.value;
      const authHeader = req.headers.get('authorization') || '';
      const token = sessionCookie || (authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '');

      if (!token) {
        return NextResponse.json({ authenticated: false, session: null }, { status: 401 });
      }

      const session = await verifySessionToken(token);
      if (!session) {
        return NextResponse.json({ authenticated: false, session: null }, { status: 401 });
      }

      return NextResponse.json({
        authenticated: true,
        session: {
          code: session.code,
          role: session.role,
          name: session.name || (session.role === 'admin' ? 'Administrator' : 'Klien Satset'),
          email: session.email,
        },
      });
    }

    if (normalizedPath === 'auth/logout' && method === 'POST') {
      const response = NextResponse.json({
        success: true,
        data: { message: 'Logged out successfully' },
      });
      response.cookies.set({
        ...getSessionCookieOptions(0),
        value: '',
        maxAge: 0,
        expires: new Date(0),
      });
      return response;
    }

    if ((normalizedPath === 'verify-access-code' || normalizedPath === 'auth/login') && method === 'POST') {
      const rawCode = body?.code || body?.accessCode;
      if (!rawCode || typeof rawCode !== 'string') {
        return NextResponse.json(
          {
            success: false,
            valid: false,
            error: {
              code: 'BAD_REQUEST',
              message: 'Kode akses tidak boleh kosong',
            },
          },
          { status: 400 }
        );
      }
      const cleanCode = rawCode.trim();

      // Master admin check via server environment variable
      const env = getServerEnv();
      const configuredAdmin = env.ADMIN_ACCESS_CODE.trim();

      if (configuredAdmin.length >= 8 && timingSafeCompare(cleanCode, configuredAdmin)) {
        const token = await createSessionToken({
          sub: 'admin_root',
          code: configuredAdmin,
          role: 'admin',
          name: 'Administrator',
        });

        const adminData = {
          role: 'admin' as const,
          name: 'Administrator',
          code: configuredAdmin,
        };

        const response = NextResponse.json({
          success: true,
          valid: true,
          data: adminData,
          ...adminData,
        });

        response.cookies.set({
          ...getSessionCookieOptions(),
          value: token,
        });

        return response;
      }

      // Check clients list
      const clients = await dbGetClients();
      const client = clients.find((c) => c.accessCode && c.accessCode.toUpperCase() === cleanCode.toUpperCase());
      if (client) {
        if (client.status === 'suspended') {
          return NextResponse.json(
            {
              success: false,
              valid: false,
              error: {
                code: 'ACCOUNT_SUSPENDED',
                message: 'Akun Anda sedang ditangguhkan.',
              },
            },
            { status: 403 }
          );
        }
        if (client.status === 'expired') {
          return NextResponse.json(
            {
              success: false,
              valid: false,
              error: {
                code: 'ACCOUNT_EXPIRED',
                message: 'Masa aktif kode akses telah kedaluwarsa.',
              },
            },
            { status: 403 }
          );
        }

        const token = await createSessionToken({
          sub: client.id || `cli_${cleanCode}`,
          code: client.accessCode,
          role: 'user',
          name: client.name || 'Klien Satset',
          email: client.email,
          plan: client.packageName,
        });

        const userData = {
          role: 'user' as const,
          name: client.name,
          email: client.email,
          code: client.accessCode,
          packageName: client.packageName,
        };

        const response = NextResponse.json({
          success: true,
          valid: true,
          data: userData,
          ...userData,
        });

        response.cookies.set({
          ...getSessionCookieOptions(),
          value: token,
        });

        return response;
      }

      // Check access codes list
      const codes = await dbGetAccessCodes();
      const foundCode = codes.find((c) => c.code.toUpperCase() === cleanCode.toUpperCase());
      if (foundCode) {
        const token = await createSessionToken({
          sub: `code_${cleanCode}`,
          code: foundCode.code,
          role: 'user',
          name: foundCode.note || 'Pengguna SatSet',
        });

        const codeData = {
          role: 'user' as const,
          name: foundCode.note || 'Pengguna SatSet',
          code: foundCode.code,
        };

        const response = NextResponse.json({
          success: true,
          valid: true,
          data: codeData,
          ...codeData,
        });

        response.cookies.set({
          ...getSessionCookieOptions(),
          value: token,
        });

        return response;
      }

      return NextResponse.json(
        {
          success: false,
          valid: false,
          error: {
            code: 'AUTH_INVALID_ACCESS_CODE',
            message: 'Kode Akses tidak valid atau telah kedaluwarsa.',
          },
        },
        { status: 401 }
      );
    }

    // -------------------------------------------------------------
    // 5. CLIENTS & API KEYS
    // -------------------------------------------------------------
    if ((normalizedPath === 'clients' || normalizedPath === 'admin/clients') && method === 'GET') {
      const clients = await dbGetClients();
      return NextResponse.json(clients);
    }

    if ((normalizedPath === 'clients' || normalizedPath === 'admin/clients') && method === 'POST') {
      const client = body;
      await dbSaveClient(client);
      return NextResponse.json({ success: true, client });
    }

    if ((normalizedPath === 'apikeys' || normalizedPath === 'admin/apikeys') && method === 'GET') {
      const keys = await dbGetApiKeys();
      return NextResponse.json(keys);
    }

    if ((normalizedPath === 'apikeys' || normalizedPath === 'admin/apikeys') && method === 'POST') {
      const keys = Array.isArray(body) ? body : [body];
      await dbSaveApiKeys(keys);
      return NextResponse.json({ success: true, keys });
    }

    // -------------------------------------------------------------
    // 6. QRIS & TRANSACTIONS
    // -------------------------------------------------------------
    if ((normalizedPath === 'qris' || normalizedPath === 'admin/qris') && method === 'GET') {
      const qris = await dbGetQrisConfig();
      return NextResponse.json(qris);
    }

    if ((normalizedPath === 'qris' || normalizedPath === 'admin/qris') && method === 'POST') {
      await dbSaveQrisConfig(body);
      return NextResponse.json({ success: true, config: body });
    }

    if (normalizedPath === 'transactions' && method === 'GET') {
      const txs = await dbGetTransactions();
      return NextResponse.json(txs);
    }

    if (normalizedPath === 'transactions' && method === 'POST') {
      const tx = body;
      if (!tx.id) tx.id = `trx_${Date.now()}`;
      await dbSaveTransaction(tx);
      broadcastLiveEvent({ type: 'transaction_created', transaction: tx });
      return NextResponse.json({ success: true, transaction: tx });
    }

    if (normalizedPath === 'transactions/proof' && method === 'POST') {
      const { transactionId, proofImageUrl, proofImageBase64 } = body;
      const txs = await dbGetTransactions();
      const found = txs.find((t) => t.id === transactionId);
      if (found) {
        found.proofImageBase64 = proofImageBase64 || proofImageUrl || '';
        found.paymentProofBase64 = proofImageBase64 || proofImageUrl || '';
        found.status = 'AWAITING_VERIFICATION' as any;
        found.updatedAt = Date.now();
        await dbSaveTransaction(found);
        broadcastLiveEvent({ type: 'transaction_updated', transaction: found });
        return NextResponse.json({ success: true, transaction: found });
      }
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    }

    if (normalizedPath === 'transactions/approve' && method === 'POST') {
      const { transactionId } = body;
      const txs = await dbGetTransactions();
      const found = txs.find((t) => t.id === transactionId);
      if (found) {
        found.status = 'APPROVED' as any;
        if (!found.accessCode) {
          found.accessCode = `SATSET-${Math.floor(100000 + Math.random() * 900000)}`;
        }
        found.updatedAt = Date.now();
        await dbSaveTransaction(found);

        // Auto create client record
        const newClient = {
          id: `cli_${Date.now()}`,
          accessCode: found.accessCode,
          name: found.customerName || (found as any).clientName || 'Pelanggan Baru',
          whatsapp: found.whatsapp || (found as any).clientWhatsapp || '',
          email: found.email || (found as any).clientEmail || '',
          packageId: found.planId || (found as any).packageId || 'pkg_basic',
          packageName: found.packageName || found.planName || 'Paket Standar',
          price: found.amount || found.totalPrice || 50000,
          startDate: new Date().toISOString(),
          expiryDate: new Date(Date.now() + 30 * 86400000).toISOString(),
          status: 'active' as const,
          type: 'standard' as const,
          createdAt: new Date().toISOString(),
          toolUsage: { tiktokDownloader: 0, contentIdeas: 0, videoToPrompt: 0, photoPrompt: 0, frameExtractor: 0 },
        };
        await dbSaveClient(newClient);
        broadcastLiveEvent({ type: 'transaction_approved', transaction: found, client: newClient });
        return NextResponse.json({ success: true, transaction: found, client: newClient });
      }
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    }

    if (normalizedPath === 'transactions/reject' && method === 'POST') {
      const { transactionId, reason } = body;
      const txs = await dbGetTransactions();
      const found = txs.find((t) => t.id === transactionId);
      if (found) {
        found.status = 'REJECTED' as any;
        found.rejectReason = reason || 'Bukti transfer tidak valid';
        found.updatedAt = Date.now();
        await dbSaveTransaction(found);
        broadcastLiveEvent({ type: 'transaction_rejected', transaction: found });
        return NextResponse.json({ success: true, transaction: found });
      }
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    }

    // -------------------------------------------------------------
    // 7. SETTINGS & CUSTOMIZERS
    // -------------------------------------------------------------
    if ((normalizedPath === 'contact-settings' || normalizedPath === 'admin/contact-settings') && method === 'GET') {
      const s = await dbGetContactSettings();
      return NextResponse.json(s);
    }
    if ((normalizedPath === 'contact-settings' || normalizedPath === 'admin/contact-settings') && method === 'POST') {
      await dbSaveContactSettings(body);
      return NextResponse.json({ success: true, settings: body });
    }

    if ((normalizedPath === 'user-ui-settings' || normalizedPath === 'admin/user-ui-settings') && method === 'GET') {
      const s = await dbGetUserUiSettings();
      return NextResponse.json(s);
    }
    if ((normalizedPath === 'user-ui-settings' || normalizedPath === 'admin/user-ui-settings') && method === 'POST') {
      await dbSaveUserUiSettings(body);
      return NextResponse.json({ success: true, settings: body });
    }

    if ((normalizedPath === 'login-ui-settings' || normalizedPath === 'admin/login-ui-settings') && method === 'GET') {
      const s = await dbGetLoginUiSettings();
      return NextResponse.json(s);
    }
    if ((normalizedPath === 'login-ui-settings' || normalizedPath === 'admin/login-ui-settings') && method === 'POST') {
      await dbSaveLoginUiSettings(body);
      return NextResponse.json({ success: true, settings: body });
    }

    // -------------------------------------------------------------
    // 8. SECURITY & BANNED DEVICES
    // -------------------------------------------------------------
    if (normalizedPath === 'security/check-banned' && method === 'POST') {
      const check = isDeviceOrIpBanned(clientIp, fingerprint, accessCodeHeader || body?.accessCode);
      return NextResponse.json(check);
    }

    if (normalizedPath === 'security/report-violation' && method === 'POST') {
      const { reason = 'Console inspection violation' } = body;
      const bannedItem: BannedDeviceItem = {
        id: `ban_${Date.now()}`,
        fingerprint: fingerprint || '',
        ip: clientIp,
        accessCode: (accessCodeHeader || body?.accessCode || '').toUpperCase(),
        reason,
        bannedAt: new Date().toISOString(),
        bannedBy: 'SECURITY_AUTO_GUARD',
      };
      bannedDevicesMap.set(bannedItem.id, bannedItem);
      if (bannedItem.fingerprint) bannedDevicesMap.set(bannedItem.fingerprint, bannedItem);
      if (bannedItem.ip) bannedDevicesMap.set(bannedItem.ip, bannedItem);
      await dbSaveBannedDevice(bannedItem);
      return NextResponse.json({ banned: true, bannedItem });
    }

    if (normalizedPath === 'admin/banned-devices' && method === 'GET') {
      const list = await dbGetBannedDevices();
      return NextResponse.json(list);
    }

    if (normalizedPath === 'admin/banned-devices/unban' && method === 'POST') {
      const { id } = body;
      if (id) {
        await dbDeleteBannedDevice(id);
        bannedDevicesMap.delete(id);
      }
      return NextResponse.json({ success: true });
    }

    if (normalizedPath === 'admin/audit-logs' && method === 'GET') {
      const logs = await dbGetAuditLogs();
      return NextResponse.json(logs);
    }

    // -------------------------------------------------------------
    // 9. SYSTEM INTELLIGENCE & AGENTS
    // -------------------------------------------------------------
    if (normalizedPath === 'system-intelligence' && method === 'GET') {
      const mem = await getSystemMemory();
      const level = Math.floor((mem.totalExecutions || 0) / 5) + 1;
      return NextResponse.json({
        level,
        title: level >= 10 ? 'Master TikTok Strategist & FYP Engineer' : 'Analis Konten Viral Pro',
        totalExecutions: mem.totalExecutions || 0,
        knowledgeCount: (mem.learnedKnowledgeBase || []).length,
        learnedWisdom: (mem.learnedKnowledgeBase || []).slice(-10),
      });
    }

    if (normalizedPath === 'admin/system-memory' && method === 'GET') {
      const mem = await getSystemMemory();
      return NextResponse.json(mem);
    }

    if (normalizedPath === 'agents' || normalizedPath === 'admin/agents') {
      if (method === 'GET') {
        const agents = await dbGetAiAgents();
        return NextResponse.json(agents.length ? agents : DEFAULT_AI_AGENTS);
      }
      if (method === 'POST') {
        const agents = Array.isArray(body) ? body : [body];
        for (const a of agents) await dbSaveAiAgent(a);
        return NextResponse.json({ success: true });
      }
    }

    if (normalizedPath.startsWith('agents/') && normalizedPath.endsWith('/toggle') && method === 'POST') {
      const agentId = normalizedPath.split('/')[1];
      const agents = await dbGetAiAgents();
      const found = agents.find((a) => a.id === agentId);
      if (found) {
        found.status = found.status === 'active' ? 'inactive' : 'active';
        await dbSaveAiAgent(found);
        return NextResponse.json({ success: true, agent: found });
      }
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (normalizedPath === 'announcements') {
      if (method === 'GET') {
        const ann = await dbGetAnnouncements();
        return NextResponse.json(ann);
      }
      if (method === 'POST') {
        await dbSaveAnnouncement(body);
        return NextResponse.json({ success: true, announcement: body });
      }
    }

    if (normalizedPath.startsWith('announcements/') && method === 'DELETE') {
      const id = normalizedPath.split('/')[1];
      await dbDeleteAnnouncement(id);
      return NextResponse.json({ success: true });
    }

    if (normalizedPath === 'formulas') {
      if (method === 'GET') {
        const formulas = await dbGetFormulas();
        return NextResponse.json(formulas);
      }
      if (method === 'POST') {
        await dbSaveFormula(body);
        return NextResponse.json({ success: true, formula: body });
      }
    }

    if (normalizedPath.startsWith('formulas/') && method === 'DELETE') {
      const id = normalizedPath.split('/')[1];
      await dbDeleteFormula(id);
      return NextResponse.json({ success: true });
    }

    if (normalizedPath === 'affiliates') {
      if (method === 'GET') {
        const aff = await dbGetAffiliates();
        return NextResponse.json(aff);
      }
      if (method === 'POST') {
        await dbSaveAffiliate(body);
        return NextResponse.json({ success: true, affiliate: body });
      }
    }

    if (normalizedPath.startsWith('affiliates/') && method === 'DELETE') {
      const id = normalizedPath.split('/')[1];
      await dbDeleteAffiliate(id);
      return NextResponse.json({ success: true });
    }

    if (normalizedPath === 'events/live' || normalizedPath === 'events') {
      if (method === 'GET') {
        return NextResponse.json(liveEventsQueue.slice(-50));
      }
      if (method === 'POST') {
        broadcastLiveEvent(body);
        return NextResponse.json({ success: true });
      }
    }

    if (normalizedPath === 'events/poll' && method === 'POST') {
      const { lastTimestamp = 0 } = body;
      const filtered = liveEventsQueue.filter((e) => e.timestamp > lastTimestamp);
      return NextResponse.json({ events: filtered, latestTimestamp: Date.now() });
    }

    if (normalizedPath === 'analytics/usage-summary' && method === 'GET') {
      const clients = await dbGetClients();
      const mem = await getSystemMemory();
      const totalClients = clients.length;
      const activeClients = clients.filter((c) => c.status === 'active').length;
      return NextResponse.json({
        totalClients,
        activeClients,
        totalExecutions: mem.totalExecutions || 350,
        categoryUsage: mem.categoryUsage || { videoPrompt: 120, contentIdeas: 90, photoPrompt: 40 },
        systemIntelligenceLevel: Math.floor((mem.totalExecutions || 0) / 5) + 1,
      });
    }

    // Default 404 for unhandled API routes
    return NextResponse.json({ error: `Endpoint /api/${normalizedPath} not found` }, { status: 404 });
  } catch (err: any) {
    logger.warn(`[API Error /api/${normalizedPath}]`, err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Terjadi kesalahan pada server saat memproses permintaan.' },
      { status: err?.statusCode || 500 }
    );
  }
}
