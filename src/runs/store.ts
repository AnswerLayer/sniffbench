/**
 * Run store - persistence layer for runs
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Run, RunStore } from './types';

/** Current schema version */
export const RUN_STORE_VERSION = '2.0';

/**
 * Get the run store path for a project
 */
export function getRunStorePath(projectRoot: string = process.cwd()): string {
  return path.join(projectRoot, '.sniffbench', 'runs.json');
}

/**
 * Generate a unique run ID
 * Format: run-{timestamp}-{6char random}
 */
export function generateRunId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `run-${timestamp}-${random}`;
}

/**
 * Load runs from disk
 * Returns empty store if file doesn't exist
 */
export function loadRuns(projectRoot: string): RunStore {
  const storePath = getRunStorePath(projectRoot);

  if (fs.existsSync(storePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
      // Validate version
      if (data.version !== RUN_STORE_VERSION) {
        console.warn(`Warning: runs.json version mismatch (expected ${RUN_STORE_VERSION}, got ${data.version})`);
      }
      // Defensive parsing with defaults for missing/invalid fields
      return {
        version: typeof data.version === 'string' ? data.version : RUN_STORE_VERSION,
        repoPath: typeof data.repoPath === 'string' ? data.repoPath : projectRoot,
        createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
        runs: data && typeof data.runs === 'object' && data.runs ? data.runs : {},
      };
    } catch (err) {
      console.error('Failed to load runs.json:', err);
      // Return empty store on error
    }
  }

  // Return empty store
  return {
    version: RUN_STORE_VERSION,
    repoPath: projectRoot,
    createdAt: new Date().toISOString(),
    runs: {},
  };
}

/**
 * Save runs to disk
 */
export function saveRuns(projectRoot: string, store: RunStore): void {
  const storePath = getRunStorePath(projectRoot);
  const dir = path.dirname(storePath);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

/**
 * Get a specific run by ID
 * Returns undefined if not found
 */
export function getRun(store: RunStore, runId: string): Run | undefined {
  return store.runs[runId];
}

/**
 * Find runs by label
 * Returns all runs with matching label
 */
export function findRunsByLabel(store: RunStore, label: string): Run[] {
  return Object.values(store.runs).filter(r => r.label === label);
}

/**
 * Add a new run to the store
 * Returns the run ID
 */
export function addRun(store: RunStore, run: Run): string {
  store.runs[run.id] = run;
  return run.id;
}

/**
 * Delete a run from the store
 * Returns true if deleted, false if not found
 */
export function deleteRun(store: RunStore, runId: string): boolean {
  if (store.runs[runId]) {
    delete store.runs[runId];
    return true;
  }
  return false;
}

/**
 * List all runs, sorted by creation date (newest first)
 */
export function listRuns(store: RunStore): Run[] {
  return Object.values(store.runs).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Get run count
 */
export function getRunCount(store: RunStore): number {
  return Object.keys(store.runs).length;
}

/**
 * Resolve a run ID from either a full ID or a label
 * If label matches multiple runs, returns the most recent
 */
export function resolveRunId(store: RunStore, idOrLabel: string): string | undefined {
  // First try exact ID match
  if (store.runs[idOrLabel]) {
    return idOrLabel;
  }

  // Try label match (return most recent)
  const matching = findRunsByLabel(store, idOrLabel);
  if (matching.length > 0) {
    // Sort by date and return newest
    matching.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return matching[0].id;
  }

  // Try partial ID match (prefix)
  const partialMatches = Object.keys(store.runs).filter(id => id.startsWith(idOrLabel));
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  return undefined;
}
