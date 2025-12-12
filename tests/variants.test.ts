/**
 * Tests for variant registration module
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  VARIANT_STORE_VERSION,
  generateVariantId,
  hashAgentConfig,
  loadVariants,
  saveVariants,
  getVariant,
  findVariantByName,
  findMatchingVariant,
  registerVariant,
  deleteVariant,
  listVariants,
  getVariantCount,
  resolveVariantId,
  Variant,
  VariantStore,
} from '../src/variants';
import { AgentConfig } from '../src/runs';

describe('Variant Store', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sniffbench-variant-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateVariantId', () => {
    it('should generate unique IDs with correct format', () => {
      const id1 = generateVariantId();
      const id2 = generateVariantId();

      expect(id1).toMatch(/^var-\d+-[a-z0-9]{6}$/);
      expect(id2).toMatch(/^var-\d+-[a-z0-9]{6}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('hashAgentConfig', () => {
    it('should produce consistent hashes for same config', () => {
      const config: AgentConfig = {
        name: 'claude-code',
        version: '2.0.55',
        model: 'claude-sonnet-4',
        thinkingEnabled: true,
      };

      const hash1 = hashAgentConfig(config);
      const hash2 = hashAgentConfig(config);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it('should produce different hashes for different configs', () => {
      const config1: AgentConfig = {
        name: 'claude-code',
        version: '2.0.55',
        model: 'claude-sonnet-4',
      };
      const config2: AgentConfig = {
        name: 'claude-code',
        version: '2.0.56',
        model: 'claude-sonnet-4',
      };

      const hash1 = hashAgentConfig(config1);
      const hash2 = hashAgentConfig(config2);

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize array order for consistent hashing', () => {
      const config1: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
        allowedTools: ['a', 'b', 'c'],
      };
      const config2: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
        allowedTools: ['c', 'b', 'a'],
      };

      const hash1 = hashAgentConfig(config1);
      const hash2 = hashAgentConfig(config2);

      expect(hash1).toBe(hash2);
    });

    it('should not include variantId in hash', () => {
      const config1: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
      };
      const config2: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
        variantId: 'var-123',
      };

      const hash1 = hashAgentConfig(config1);
      const hash2 = hashAgentConfig(config2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('loadVariants', () => {
    it('should return empty store when file does not exist', () => {
      const store = loadVariants(tempDir);

      expect(store.version).toBe(VARIANT_STORE_VERSION);
      expect(store.repoPath).toBe(tempDir);
      expect(store.variants).toEqual({});
    });

    it('should load existing store from file', () => {
      const existingStore: VariantStore = {
        version: VARIANT_STORE_VERSION,
        repoPath: tempDir,
        createdAt: new Date().toISOString(),
        variants: {
          'var-123': {
            id: 'var-123',
            name: 'control',
            createdAt: new Date().toISOString(),
            snapshot: {
              name: 'claude-code',
              version: '2.0.55',
              model: 'unknown',
            },
          },
        },
      };

      const sniffbenchDir = path.join(tempDir, '.sniffbench');
      fs.mkdirSync(sniffbenchDir, { recursive: true });
      fs.writeFileSync(
        path.join(sniffbenchDir, 'variants.json'),
        JSON.stringify(existingStore)
      );

      const store = loadVariants(tempDir);

      expect(store.variants['var-123']).toBeDefined();
      expect(store.variants['var-123'].name).toBe('control');
    });
  });

  describe('Variant CRUD operations', () => {
    let store: VariantStore;

    beforeEach(() => {
      store = loadVariants(tempDir);
    });

    it('should register a variant', () => {
      const snapshot: AgentConfig = {
        name: 'claude-code',
        version: '2.0.55',
        model: 'claude-sonnet-4',
      };

      const variant = registerVariant(store, snapshot, {
        name: 'control',
        description: 'Stock configuration',
        changes: ['Initial setup'],
      });

      expect(variant.id).toMatch(/^var-\d+-[a-z0-9]{6}$/);
      expect(variant.name).toBe('control');
      expect(variant.description).toBe('Stock configuration');
      expect(variant.changes).toEqual(['Initial setup']);
      expect(variant.snapshot).toBe(snapshot);
      expect(store.variants[variant.id]).toBe(variant);
    });

    it('should get a variant by ID', () => {
      const snapshot: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
      };

      const variant = registerVariant(store, snapshot, { name: 'test' });

      expect(getVariant(store, variant.id)).toBe(variant);
      expect(getVariant(store, 'nonexistent')).toBeUndefined();
    });

    it('should find variant by name', () => {
      const snapshot: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
      };

      registerVariant(store, snapshot, { name: 'control' });
      registerVariant(store, snapshot, { name: 'treatment' });

      const found = findVariantByName(store, 'control');
      expect(found?.name).toBe('control');

      const notFound = findVariantByName(store, 'nonexistent');
      expect(notFound).toBeUndefined();
    });

    it('should find matching variant by config hash', () => {
      const snapshot1: AgentConfig = {
        name: 'claude-code',
        version: '2.0.55',
        model: 'claude-sonnet-4',
      };
      const snapshot2: AgentConfig = {
        name: 'claude-code',
        version: '2.0.56',
        model: 'claude-sonnet-4',
      };

      registerVariant(store, snapshot1, { name: 'v1' });
      registerVariant(store, snapshot2, { name: 'v2' });

      // Same config as v1
      const matchingConfig: AgentConfig = {
        name: 'claude-code',
        version: '2.0.55',
        model: 'claude-sonnet-4',
      };

      const match = findMatchingVariant(store, matchingConfig);
      expect(match?.name).toBe('v1');

      // Config that doesn't match any variant
      const noMatch = findMatchingVariant(store, {
        name: 'claude-code',
        version: '2.0.99',
        model: 'claude-sonnet-4',
      });
      expect(noMatch).toBeUndefined();
    });

    it('should delete a variant', () => {
      const snapshot: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
      };

      const variant = registerVariant(store, snapshot, { name: 'to-delete' });

      expect(store.variants[variant.id]).toBeDefined();

      const deleted = deleteVariant(store, variant.id);
      expect(deleted).toBe(true);
      expect(store.variants[variant.id]).toBeUndefined();

      const deletedAgain = deleteVariant(store, variant.id);
      expect(deletedAgain).toBe(false);
    });

    it('should list variants sorted by creation date (newest first)', () => {
      const snapshot: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
      };

      const v1 = registerVariant(store, snapshot, { name: 'old' });
      // Manually set older date
      v1.createdAt = new Date('2024-01-01').toISOString();

      const v2 = registerVariant(store, snapshot, { name: 'new' });
      v2.createdAt = new Date('2024-12-01').toISOString();

      const variants = listVariants(store);
      expect(variants[0].name).toBe('new');
      expect(variants[1].name).toBe('old');
    });

    it('should count variants', () => {
      expect(getVariantCount(store)).toBe(0);

      registerVariant(
        store,
        { name: 'claude-code', version: null, model: 'unknown' },
        { name: 'v1' }
      );

      expect(getVariantCount(store)).toBe(1);
    });
  });

  describe('resolveVariantId', () => {
    let store: VariantStore;
    let variant1: Variant;
    let variant2: Variant;

    beforeEach(() => {
      store = loadVariants(tempDir);

      const snapshot: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
      };

      variant1 = registerVariant(store, snapshot, { name: 'control' });
      variant2 = registerVariant(store, snapshot, { name: 'treatment' });
    });

    it('should resolve exact ID match', () => {
      const resolved = resolveVariantId(store, variant1.id);
      expect(resolved).toBe(variant1.id);
    });

    it('should resolve name to variant ID', () => {
      const resolved = resolveVariantId(store, 'control');
      expect(resolved).toBe(variant1.id);
    });

    it('should resolve partial ID prefix when unique', () => {
      // Use a longer prefix to ensure uniqueness
      const prefix = variant2.id.substring(0, 20);
      const resolved = resolveVariantId(store, prefix);
      expect(resolved).toBe(variant2.id);
    });

    it('should return undefined for no match', () => {
      const resolved = resolveVariantId(store, 'nonexistent');
      expect(resolved).toBeUndefined();
    });
  });
});
