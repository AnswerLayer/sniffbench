/**
 * Migration from baselines v1.0 to runs v2.0
 *
 * Converts legacy single-baseline-per-case storage to multi-run format.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Run,
  RunStore,
  CaseRun,
  LegacyBaselineStore,
  LegacyBaseline,
  BehaviorMetrics,
} from './types';
import { RUN_STORE_VERSION, generateRunId } from './store';

/**
 * Default behavior metrics for legacy baselines without metrics
 */
export function defaultBehaviorMetrics(): BehaviorMetrics {
  return {
    totalTokens: 0,
    toolCount: 0,
    costUsd: 0,
    explorationRatio: 0,
    cacheHitRatio: 0,
    avgToolDurationMs: 0,
    tokensPerTool: 0,
    tokensPerRead: 0,
    readCount: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

/**
 * Get path to legacy baselines file
 */
export function getLegacyBaselinePath(projectRoot: string): string {
  return path.join(projectRoot, '.sniffbench', 'baselines.json');
}

/**
 * Load legacy baselines (v1.0 format)
 * Returns null if file doesn't exist
 */
export function loadLegacyBaselines(projectRoot: string): LegacyBaselineStore | null {
  const baselinePath = getLegacyBaselinePath(projectRoot);

  if (!fs.existsSync(baselinePath)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    return data as LegacyBaselineStore;
  } catch {
    return null;
  }
}

/**
 * Check if migration is needed
 * Returns true if baselines.json exists but runs.json does not
 */
export function needsMigration(projectRoot: string): boolean {
  const baselinePath = getLegacyBaselinePath(projectRoot);
  const runsPath = path.join(projectRoot, '.sniffbench', 'runs.json');

  return fs.existsSync(baselinePath) && !fs.existsSync(runsPath);
}

/**
 * Convert a legacy baseline to a case run
 */
function baselineToCaseRun(baseline: LegacyBaseline): CaseRun {
  return {
    answer: baseline.answer,
    grade: baseline.grade,
    gradedAt: baseline.gradedAt,
    gradedBy: baseline.gradedBy,
    notes: baseline.notes,
    behaviorMetrics: baseline.behaviorMetrics || defaultBehaviorMetrics(),
  };
}

/**
 * Migrate baselines v1.0 to runs v2.0 format
 *
 * Creates a single run labeled "baseline-migrated" containing all existing baselines.
 * The original baselines.json is preserved as a backup.
 *
 * @param projectRoot - Project root directory
 * @returns The new RunStore, or null if no migration needed
 */
export function migrateBaselinesV1ToRuns(projectRoot: string): RunStore | null {
  const legacyStore = loadLegacyBaselines(projectRoot);

  if (!legacyStore) {
    return null;
  }

  // Check if there are any baselines to migrate
  const baselineCount = Object.keys(legacyStore.baselines).length;
  if (baselineCount === 0) {
    return null;
  }

  // Create a single run from all baselines
  const runId = generateRunId();
  const cases: Record<string, CaseRun> = {};

  for (const [caseId, baseline] of Object.entries(legacyStore.baselines)) {
    cases[caseId] = baselineToCaseRun(baseline);
  }

  // Use earliest gradedAt as run creation time
  let earliestGrade = new Date().toISOString();
  for (const baseline of Object.values(legacyStore.baselines)) {
    if (baseline.gradedAt && baseline.gradedAt < earliestGrade) {
      earliestGrade = baseline.gradedAt;
    }
  }

  const run: Run = {
    id: runId,
    label: 'baseline-migrated',
    createdAt: earliestGrade,
    agent: {
      name: 'unknown',
      version: null,
      model: 'unknown',
      // No CLAUDE.md hash available from v1
    },
    cases,
  };

  const newStore: RunStore = {
    version: RUN_STORE_VERSION,
    repoPath: legacyStore.repoPath || projectRoot,
    createdAt: legacyStore.createdAt || new Date().toISOString(),
    runs: {
      [runId]: run,
    },
  };

  return newStore;
}

/**
 * Perform migration and save to disk
 * Also creates a backup of the original baselines.json
 *
 * @param projectRoot - Project root directory
 * @returns true if migration was performed, false if not needed
 */
export function performMigration(projectRoot: string): boolean {
  if (!needsMigration(projectRoot)) {
    return false;
  }

  const newStore = migrateBaselinesV1ToRuns(projectRoot);
  if (!newStore) {
    return false;
  }

  // Create backup of original baselines.json
  const baselinePath = getLegacyBaselinePath(projectRoot);
  const backupPath = baselinePath + '.backup';

  if (fs.existsSync(baselinePath) && !fs.existsSync(backupPath)) {
    fs.copyFileSync(baselinePath, backupPath);
  }

  // Save new runs.json
  const runsPath = path.join(projectRoot, '.sniffbench', 'runs.json');
  fs.writeFileSync(runsPath, JSON.stringify(newStore, null, 2));

  return true;
}

/**
 * Get migration summary info
 */
export function getMigrationInfo(projectRoot: string): {
  needed: boolean;
  baselineCount: number;
  oldestBaseline?: string;
} {
  const legacyStore = loadLegacyBaselines(projectRoot);

  if (!legacyStore) {
    return { needed: false, baselineCount: 0 };
  }

  const baselineCount = Object.keys(legacyStore.baselines).length;

  let oldestBaseline: string | undefined;
  for (const baseline of Object.values(legacyStore.baselines)) {
    if (baseline.gradedAt) {
      if (!oldestBaseline || baseline.gradedAt < oldestBaseline) {
        oldestBaseline = baseline.gradedAt;
      }
    }
  }

  return {
    needed: needsMigration(projectRoot),
    baselineCount,
    oldestBaseline,
  };
}
