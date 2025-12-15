/**
 * Variant types for sniffbench
 *
 * Supports explicit variant registration for scientific comparison
 * between different agent configurations, with container-based sandboxing
 * for true parallel A/B testing.
 */

import type { AgentConfig, FullMcpServerConfig } from '../runs/types';

/**
 * Container metadata populated after image build
 */
export interface ContainerInfo {
  /** Docker image name: "sniffbench-variant-{name}" */
  imageName: string;
  /** Image tag: "v1" or content-based hash */
  imageTag: string;
  /** ISO timestamp when container was built */
  builtAt: string;
  /** Claude Code version installed in container */
  claudeVersion: string;
}

/**
 * Extended snapshot with full configuration for container building
 * Includes everything needed to reproduce the exact agent environment
 */
export interface SandboxableSnapshot extends AgentConfig {
  /** Full MCP server configurations (for container building) */
  mcpServersFull?: Record<string, FullMcpServerConfig>;
  /** Full CLAUDE.md content (for baking into container) */
  claudeMdContent?: string;
}

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

  /** Configuration snapshot (extended with full MCP config for container building) */
  snapshot: SandboxableSnapshot;

  /** Container info (populated after image build) */
  container?: ContainerInfo;

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
