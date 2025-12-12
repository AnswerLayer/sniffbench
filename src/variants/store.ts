/**
 * Variant store - persistence layer for registered variants
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AgentConfig } from '../runs/types';
import { Variant, VariantStore, RegisterVariantOptions } from './types';

/** Current schema version */
export const VARIANT_STORE_VERSION = '1.0';

/**
 * Get the variant store path for a project
 */
export function getVariantStorePath(projectRoot: string = process.cwd()): string {
  return path.join(projectRoot, '.sniffbench', 'variants.json');
}

/**
 * Generate a unique variant ID
 * Format: var-{timestamp}-{6char random}
 */
export function generateVariantId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `var-${timestamp}-${random}`;
}

/**
 * Compute a hash of an AgentConfig for matching
 * Used to auto-link runs to variants
 */
export function hashAgentConfig(config: AgentConfig): string {
  // Create a normalized object with only the fields we want to hash
  const normalized = {
    name: config.name,
    version: config.version,
    model: config.model,
    claudeMdHash: config.claudeMdHash,
    mcpServers: config.mcpServers ? sortObject(config.mcpServers) : undefined,
    allowedTools: config.allowedTools ? [...config.allowedTools].sort() : undefined,
    disallowedTools: config.disallowedTools ? [...config.disallowedTools].sort() : undefined,
    permissionMode: config.permissionMode,
    thinkingEnabled: config.thinkingEnabled,
    // Note: variantId is NOT included in hash (circular dependency)
  };

  const json = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(json, 'utf8').digest('hex').substring(0, 16);
}

/**
 * Sort an object's keys for consistent hashing
 */
function sortObject<T>(obj: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}

/**
 * Load variants from disk
 * Returns empty store if file doesn't exist
 */
export function loadVariants(projectRoot: string): VariantStore {
  const storePath = getVariantStorePath(projectRoot);

  if (fs.existsSync(storePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
      // Validate version
      if (data.version !== VARIANT_STORE_VERSION) {
        console.warn(`Warning: variants.json version mismatch (expected ${VARIANT_STORE_VERSION}, got ${data.version})`);
      }
      return data;
    } catch (err) {
      console.error('Failed to load variants.json:', err);
      // Return empty store on error
    }
  }

  // Return empty store
  return {
    version: VARIANT_STORE_VERSION,
    repoPath: projectRoot,
    createdAt: new Date().toISOString(),
    variants: {},
  };
}

/**
 * Save variants to disk
 */
export function saveVariants(projectRoot: string, store: VariantStore): void {
  const storePath = getVariantStorePath(projectRoot);
  const dir = path.dirname(storePath);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

/**
 * Get a specific variant by ID
 * Returns undefined if not found
 */
export function getVariant(store: VariantStore, variantId: string): Variant | undefined {
  return store.variants[variantId];
}

/**
 * Find a variant by name
 * Returns the first matching variant, or undefined
 */
export function findVariantByName(store: VariantStore, name: string): Variant | undefined {
  return Object.values(store.variants).find(v => v.name === name);
}

/**
 * Find variants by config hash
 * Returns all variants with matching config snapshots
 */
export function findVariantsByConfigHash(store: VariantStore, configHash: string): Variant[] {
  return Object.values(store.variants).filter(v =>
    hashAgentConfig(v.snapshot) === configHash
  );
}

/**
 * Find a matching variant for a given config
 * Returns the first variant whose snapshot matches
 */
export function findMatchingVariant(store: VariantStore, config: AgentConfig): Variant | undefined {
  const configHash = hashAgentConfig(config);
  const matches = findVariantsByConfigHash(store, configHash);
  return matches.length > 0 ? matches[0] : undefined;
}

/**
 * Register a new variant
 * Returns the created variant
 */
export function registerVariant(
  store: VariantStore,
  snapshot: AgentConfig,
  options: RegisterVariantOptions
): Variant {
  const variant: Variant = {
    id: generateVariantId(),
    name: options.name,
    description: options.description,
    createdAt: new Date().toISOString(),
    changes: options.changes,
    snapshot,
    metadata: options.metadata,
  };

  store.variants[variant.id] = variant;
  return variant;
}

/**
 * Delete a variant from the store
 * Returns true if deleted, false if not found
 */
export function deleteVariant(store: VariantStore, variantId: string): boolean {
  if (store.variants[variantId]) {
    delete store.variants[variantId];
    return true;
  }
  return false;
}

/**
 * List all variants, sorted by creation date (newest first)
 */
export function listVariants(store: VariantStore): Variant[] {
  return Object.values(store.variants).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Get variant count
 */
export function getVariantCount(store: VariantStore): number {
  return Object.keys(store.variants).length;
}

/**
 * Resolve a variant ID from either a full ID or a name
 */
export function resolveVariantId(store: VariantStore, idOrName: string): string | undefined {
  // First try exact ID match
  if (store.variants[idOrName]) {
    return idOrName;
  }

  // Try name match
  const byName = findVariantByName(store, idOrName);
  if (byName) {
    return byName.id;
  }

  // Try partial ID match (prefix)
  const partialMatches = Object.keys(store.variants).filter(id => id.startsWith(idOrName));
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  return undefined;
}
