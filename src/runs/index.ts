/**
 * Run tracking module
 *
 * Provides multi-run storage with agent configuration capture
 * for meaningful comparison between different agent setups.
 */

// Types
export type {
  BehaviorMetrics,
  McpServerConfig,
  FullMcpServerConfig,
  AgentConfig,
  CaseRun,
  Run,
  RunStore,
  LegacyBaseline,
  LegacyBaselineStore,
} from './types';

// Store operations
export {
  RUN_STORE_VERSION,
  getRunStorePath,
  generateRunId,
  loadRuns,
  saveRuns,
  getRun,
  findRunsByLabel,
  addRun,
  deleteRun,
  listRuns,
  getRunCount,
  resolveRunId,
} from './store';

// Agent config capture
export {
  findClaudeMd,
  hashClaudeMd,
  readClaudeConfig,
  readClaudeSettings,
  readProjectSettings,
  readProjectMcpConfig,
  extractMcpServers,
  extractFullMcpServers,
  extractToolAllowlists,
  getPermissionMode,
  getThinkingEnabled,
  captureAgentConfig,
  capturePartialAgentConfig,
  captureSandboxableSnapshot,
  readClaudeMdContent,
  formatAgentConfig,
  diffAgentConfig,
} from './config';

// Migration
export {
  getLegacyBaselinePath,
  loadLegacyBaselines,
  needsMigration,
  migrateBaselinesV1ToRuns,
  performMigration,
  getMigrationInfo,
  defaultBehaviorMetrics,
} from './migration';
