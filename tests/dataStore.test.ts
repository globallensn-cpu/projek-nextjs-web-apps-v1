import { describe, it, expect, beforeEach } from 'vitest';
import { memoryStore } from '../lib/server/dataStore';
import {
  clientRepository,
  packageRepository,
  transactionRepository,
  accessCodeRepository,
  bannedDeviceRepository,
} from '../lib/server/repositories';

describe('In-Memory Data Store & Repositories', () => {
  beforeEach(() => {
    memoryStore.initDefaultSeed();
  });

  describe('DataStore Health', () => {
    it('returns healthy status with in-memory persistence info', () => {
      const health = memoryStore.getHealth();
      expect(health.status).toBe('healthy');
      expect(health.mode).toBe('memory');
      expect(health.persistence).toBe('in-memory-non-persistent');
      expect(health.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Client Repository', () => {
    it('can create, retrieve, update, and delete clients', async () => {
      const newClient = {
        id: 'client_test_101',
        name: 'Budi Santoso',
        email: 'budi@test.com',
        accessCode: 'BUDI-TEST-777',
        whatsapp: '08123456789',
        packageId: 'pkg_vip_30',
        packageName: 'Paket VIP 30 Hari',
        price: 99000,
        status: 'active' as const,
        type: 'standard' as const,
        startDate: new Date().toISOString(),
        expiryDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      };

      await clientRepository.save(newClient);
      const retrieved = await clientRepository.getById('client_test_101');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Budi Santoso');
      expect(retrieved?.accessCode).toBe('BUDI-TEST-777');

      await clientRepository.delete('client_test_101');
      const deleted = await clientRepository.getById('client_test_101');
      expect(deleted).toBeNull();
    });
  });

  describe('Package Repository', () => {
    it('retrieves default packages and supports saving new ones', async () => {
      const packages = await packageRepository.getAll();
      expect(packages.length).toBeGreaterThan(0);

      const customPkg = {
        id: 'pkg_custom_99',
        name: 'Paket Custom Enterprise',
        description: 'Paket kustom dengan akses penuh',
        price: 500000,
        durationDays: 90,
        features: ['Full Access', 'Priority Node'],
        toolsIncluded: ['content-ideas', 'photo-prompt'],
        isPopular: false,
        isActive: true,
      };

      await packageRepository.save(customPkg);
      const retrieved = await packageRepository.getById('pkg_custom_99');
      expect(retrieved).toBeDefined();
      expect(retrieved?.price).toBe(500000);
    });
  });

  describe('Transaction Repository', () => {
    it('can save and retrieve transactions', async () => {
      const txn = {
        id: 'txn_test_001',
        customerName: 'Siti Rahma',
        whatsapp: '081999888777',
        planId: 'pkg_vip_30',
        planName: 'Paket VIP 30 Hari',
        amount: 50000,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await transactionRepository.save(txn);
      const txns = await transactionRepository.getAll();
      expect(txns.some((t) => t.id === 'txn_test_001')).toBe(true);
    });
  });

  describe('Access Code Repository', () => {
    it('saves and retrieves custom access codes', async () => {
      const code = {
        id: 'code_custom_1',
        code: 'PROMO-MERDEKA-2026',
        note: 'Promo Merdeka 2026',
        role: 'user' as const,
        createdAt: Date.now(),
      };

      await accessCodeRepository.save(code);
      const allCodes = await accessCodeRepository.getAll();
      expect(allCodes.some((c) => c.code === 'PROMO-MERDEKA-2026')).toBe(true);
    });
  });

  describe('Banned Device Repository', () => {
    it('bans and unbans devices securely', async () => {
      await bannedDeviceRepository.ban('fp_malicious_attacker_01', 'Rate limit abuse');
      let bannedList = await bannedDeviceRepository.getAll();
      expect(bannedList.some((b) => b.id === 'fp_malicious_attacker_01')).toBe(true);

      await bannedDeviceRepository.unban('fp_malicious_attacker_01');
      bannedList = await bannedDeviceRepository.getAll();
      expect(bannedList.some((b) => b.id === 'fp_malicious_attacker_01')).toBe(false);
    });
  });
});
