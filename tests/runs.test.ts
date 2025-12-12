/**
 * Tests for run tracking module
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  RUN_STORE_VERSION,
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
  diffAgentConfig,
} from '../src/runs';
import type { Run, RunStore, AgentConfig } from '../src/runs';

describe('Run Store', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sniffbench-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateRunId', () => {
    it('should generate unique IDs with correct format', () => {
      const id1 = generateRunId();
      const id2 = generateRunId();

      expect(id1).toMatch(/^run-\d+-[a-z0-9]{6}$/);
      expect(id2).toMatch(/^run-\d+-[a-z0-9]{6}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('loadRuns', () => {
    it('should return empty store when file does not exist', () => {
      const store = loadRuns(tempDir);

      expect(store.version).toBe(RUN_STORE_VERSION);
      expect(store.repoPath).toBe(tempDir);
      expect(store.runs).toEqual({});
    });

    it('should load existing store from file', () => {
      const existingStore: RunStore = {
        version: RUN_STORE_VERSION,
        repoPath: tempDir,
        createdAt: new Date().toISOString(),
        runs: {
          'run-123': {
            id: 'run-123',
            label: 'test',
            createdAt: new Date().toISOString(),
            agent: {
              name: 'claude-code',
              version: '2.0.55',
              model: 'claude-sonnet-4',
            },
            cases: {},
          },
        },
      };

      const sniffbenchDir = path.join(tempDir, '.sniffbench');
      fs.mkdirSync(sniffbenchDir, { recursive: true });
      fs.writeFileSync(
        path.join(sniffbenchDir, 'runs.json'),
        JSON.stringify(existingStore)
      );

      const store = loadRuns(tempDir);

      expect(store.runs['run-123']).toBeDefined();
      expect(store.runs['run-123'].label).toBe('test');
    });
  });

  describe('saveRuns', () => {
    it('should create .sniffbench directory and save store', () => {
      const store: RunStore = {
        version: RUN_STORE_VERSION,
        repoPath: tempDir,
        createdAt: new Date().toISOString(),
        runs: {},
      };

      saveRuns(tempDir, store);

      const savedData = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.sniffbench', 'runs.json'), 'utf-8')
      );
      expect(savedData.version).toBe(RUN_STORE_VERSION);
    });
  });

  describe('Run CRUD operations', () => {
    let store: RunStore;

    beforeEach(() => {
      store = loadRuns(tempDir);
    });

    it('should add a run', () => {
      const run: Run = {
        id: 'run-test-123',
        label: 'baseline',
        createdAt: new Date().toISOString(),
        agent: {
          name: 'claude-code',
          version: '2.0.55',
          model: 'claude-sonnet-4',
        },
        cases: {},
      };

      const id = addRun(store, run);

      expect(id).toBe('run-test-123');
      expect(store.runs['run-test-123']).toBe(run);
    });

    it('should get a run by ID', () => {
      const run: Run = {
        id: 'run-get-test',
        createdAt: new Date().toISOString(),
        agent: {
          name: 'claude-code',
          version: null,
          model: 'unknown',
        },
        cases: {},
      };

      addRun(store, run);

      expect(getRun(store, 'run-get-test')).toBe(run);
      expect(getRun(store, 'nonexistent')).toBeUndefined();
    });

    it('should find runs by label', () => {
      const run1: Run = {
        id: 'run-1',
        label: 'baseline',
        createdAt: new Date().toISOString(),
        agent: { name: 'claude-code', version: null, model: 'unknown' },
        cases: {},
      };
      const run2: Run = {
        id: 'run-2',
        label: 'experiment',
        createdAt: new Date().toISOString(),
        agent: { name: 'claude-code', version: null, model: 'unknown' },
        cases: {},
      };
      const run3: Run = {
        id: 'run-3',
        label: 'baseline',
        createdAt: new Date().toISOString(),
        agent: { name: 'claude-code', version: null, model: 'unknown' },
        cases: {},
      };

      addRun(store, run1);
      addRun(store, run2);
      addRun(store, run3);

      const baselines = findRunsByLabel(store, 'baseline');
      expect(baselines).toHaveLength(2);
      expect(baselines.map(r => r.id)).toContain('run-1');
      expect(baselines.map(r => r.id)).toContain('run-3');
    });

    it('should delete a run', () => {
      const run: Run = {
        id: 'run-delete-test',
        createdAt: new Date().toISOString(),
        agent: { name: 'claude-code', version: null, model: 'unknown' },
        cases: {},
      };

      addRun(store, run);
      expect(store.runs['run-delete-test']).toBeDefined();

      const deleted = deleteRun(store, 'run-delete-test');
      expect(deleted).toBe(true);
      expect(store.runs['run-delete-test']).toBeUndefined();

      const deletedAgain = deleteRun(store, 'run-delete-test');
      expect(deletedAgain).toBe(false);
    });

    it('should list runs sorted by creation date (newest first)', () => {
      const oldDate = new Date('2024-01-01').toISOString();
      const newDate = new Date('2024-12-01').toISOString();

      const oldRun: Run = {
        id: 'run-old',
        createdAt: oldDate,
        agent: { name: 'claude-code', version: null, model: 'unknown' },
        cases: {},
      };
      const newRun: Run = {
        id: 'run-new',
        createdAt: newDate,
        agent: { name: 'claude-code', version: null, model: 'unknown' },
        cases: {},
      };

      addRun(store, oldRun);
      addRun(store, newRun);

      const runs = listRuns(store);
      expect(runs[0].id).toBe('run-new');
      expect(runs[1].id).toBe('run-old');
    });

    it('should count runs', () => {
      expect(getRunCount(store)).toBe(0);

      addRun(store, {
        id: 'run-1',
        createdAt: new Date().toISOString(),
        agent: { name: 'claude-code', version: null, model: 'unknown' },
        cases: {},
      });

      expect(getRunCount(store)).toBe(1);
    });
  });

  describe('resolveRunId', () => {
    let store: RunStore;

    beforeEach(() => {
      store = loadRuns(tempDir);

      // Add test runs
      addRun(store, {
        id: 'run-1734567890-abc123',
        label: 'baseline',
        createdAt: new Date('2024-12-01').toISOString(),
        agent: { name: 'claude-code', version: null, model: 'unknown' },
        cases: {},
      });
      addRun(store, {
        id: 'run-1734567891-def456',
        label: 'baseline',
        createdAt: new Date('2024-12-02').toISOString(),
        agent: { name: 'claude-code', version: null, model: 'unknown' },
        cases: {},
      });
    });

    it('should resolve exact ID match', () => {
      const resolved = resolveRunId(store, 'run-1734567890-abc123');
      expect(resolved).toBe('run-1734567890-abc123');
    });

    it('should resolve label to most recent run', () => {
      const resolved = resolveRunId(store, 'baseline');
      expect(resolved).toBe('run-1734567891-def456'); // newer one
    });

    it('should resolve partial ID prefix', () => {
      const resolved = resolveRunId(store, 'run-1734567890');
      expect(resolved).toBe('run-1734567890-abc123');
    });

    it('should return undefined for no match', () => {
      const resolved = resolveRunId(store, 'nonexistent');
      expect(resolved).toBeUndefined();
    });
  });
});

describe('Agent Config', () => {
  describe('diffAgentConfig', () => {
    it('should detect no differences for identical configs', () => {
      const config: AgentConfig = {
        name: 'claude-code',
        version: '2.0.55',
        model: 'claude-sonnet-4',
      };

      const diffs = diffAgentConfig(config, config);
      expect(diffs).toHaveLength(0);
    });

    it('should detect basic field changes', () => {
      const config1: AgentConfig = {
        name: 'claude-code',
        version: '2.0.55',
        model: 'claude-sonnet-4',
      };
      const config2: AgentConfig = {
        name: 'claude-code',
        version: '2.0.56',
        model: 'claude-opus-4',
      };

      const diffs = diffAgentConfig(config1, config2);

      expect(diffs).toContainEqual({
        field: 'Version',
        old: '2.0.55',
        new: '2.0.56',
      });
      expect(diffs).toContainEqual({
        field: 'Model',
        old: 'claude-sonnet-4',
        new: 'claude-opus-4',
      });
    });

    it('should detect MCP server changes', () => {
      const config1: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
        mcpServers: {
          linear: { type: 'stdio', enabled: true },
        },
      };
      const config2: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
        mcpServers: {
          linear: { type: 'stdio', enabled: true },
          github: { type: 'sse', enabled: true },
        },
      };

      const diffs = diffAgentConfig(config1, config2);

      expect(diffs).toContainEqual({
        field: 'MCP: github',
        old: 'none',
        new: 'sse',
      });
    });

    it('should detect allowed tools changes', () => {
      const config1: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
      };
      const config2: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
        allowedTools: ['Bash(osgrep:*)'],
      };

      const diffs = diffAgentConfig(config1, config2);

      expect(diffs).toContainEqual({
        field: 'Allowed Tools',
        old: 'none',
        new: '1 tools',
      });
    });

    it('should detect thinking mode changes', () => {
      const config1: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
        thinkingEnabled: false,
      };
      const config2: AgentConfig = {
        name: 'claude-code',
        version: null,
        model: 'unknown',
        thinkingEnabled: true,
      };

      const diffs = diffAgentConfig(config1, config2);

      expect(diffs).toContainEqual({
        field: 'Thinking',
        old: 'disabled',
        new: 'enabled',
      });
    });
  });
});
