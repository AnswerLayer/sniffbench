/**
 * Variant types for sniffbench
 *
 * Supports explicit variant registration for scientific comparison
 * between different agent configurations.
 */

import type { AgentConfig } from '../runs/types';

/**
 * A registered variant - a named configuration snapshot
 */
export interface Variant {
  /** Unique variant ID: "var-{timestamp}-{randomId}" */
  id: string;
  /** User-friendly name: "control", "with-linear-mcp" */
  name: string;
  /** Optional description: "Added Linear MCP server for issue tracking" */
  description?: string;
  /** ISO timestamp when variant was registered */
  createdAt: string;

  /** User-declared changes (explicit documentation of what's different) */
  changes?: string[];

  /** Ambient snapshot at registration time */
  snapshot: AgentConfig;

  /** Flexible metadata for future extensibility */
  metadata?: Record<string, unknown>;
}

/**
 * Root store for all registered variants
 */
export interface VariantStore {
  /** Schema version: "1.0" */
  version: string;
  /** Path to the repo being benchmarked */
  repoPath: string;
  /** ISO timestamp when store was created */
  createdAt: string;
  /** All variants, keyed by variant ID */
  variants: Record<string, Variant>;
}

/**
 * Options for registering a new variant
 */
export interface RegisterVariantOptions {
  /** User-friendly name for the variant */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional list of explicit changes */
  changes?: string[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}
