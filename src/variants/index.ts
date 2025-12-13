/**
 * Variant registration module
 *
 * Provides explicit variant registration for scientific comparison
 * between different agent configurations.
 */

// Types
export type {
  Variant,
  VariantStore,
  RegisterVariantOptions,
  ContainerInfo,
  SandboxableSnapshot,
} from './types';

// Store operations
export {
  VARIANT_STORE_VERSION,
  getVariantStorePath,
  generateVariantId,
  hashAgentConfig,
  loadVariants,
  saveVariants,
  getVariant,
  findVariantByName,
  findVariantsByConfigHash,
  findMatchingVariant,
  registerVariant,
  deleteVariant,
  listVariants,
  getVariantCount,
  resolveVariantId,
} from './store';
