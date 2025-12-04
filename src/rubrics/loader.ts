/**
 * Rubric loader - loads and resolves rubrics from files and built-ins
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import { Rubric, RubricCriterion, RubricReference } from '../cases/types';
import { builtInRubrics, getBuiltInRubric } from './defaults';

/**
 * Rubric registry - holds all available rubrics
 */
export class RubricRegistry {
  private rubrics: Map<string, Rubric> = new Map();
  private loaded: boolean = false;

  constructor() {
    // Pre-populate with built-in rubrics
    for (const [id, rubric] of Object.entries(builtInRubrics)) {
      this.rubrics.set(id, rubric);
    }
  }

  /**
   * Load rubrics from a directory
   */
  async loadFromDirectory(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
        const filePath = path.join(dir, entry.name);
        try {
          const rubric = await this.loadRubricFile(filePath);
          if (rubric) {
            this.rubrics.set(rubric.id, rubric);
          }
        } catch (err) {
          console.warn(`Warning: Failed to load rubric from ${filePath}: ${(err as Error).message}`);
        }
      }
    }

    this.loaded = true;
  }

  /**
   * Load a single rubric from a file
   */
  async loadRubricFile(filePath: string): Promise<Rubric | null> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = YAML.parse(content);

    if (!data.id || !data.name || !data.criteria) {
      console.warn(`Invalid rubric file ${filePath}: missing required fields (id, name, criteria)`);
      return null;
    }

    // Handle extends
    if (data.extends) {
      const baseRubric = this.rubrics.get(data.extends);
      if (!baseRubric) {
        console.warn(`Rubric ${data.id} extends unknown rubric: ${data.extends}`);
        return null;
      }
      data.criteria = this.mergeCriteria(baseRubric.criteria, data.criteria);
    }

    data._sourcePath = filePath;
    return data as Rubric;
  }

  /**
   * Get a rubric by ID
   */
  get(id: string): Rubric | undefined {
    return this.rubrics.get(id);
  }

  /**
   * Resolve a rubric reference (string ID or inline override)
   */
  resolve(ref: string | RubricReference | undefined): Rubric {
    // Default to 'default' rubric
    if (!ref) {
      return this.rubrics.get('default')!;
    }

    // String reference
    if (typeof ref === 'string') {
      const rubric = this.rubrics.get(ref);
      if (!rubric) {
        console.warn(`Unknown rubric: ${ref}, falling back to default`);
        return this.rubrics.get('default')!;
      }
      return rubric;
    }

    // Inline override
    const baseRubric = this.rubrics.get(ref.extends);
    if (!baseRubric) {
      console.warn(`Unknown base rubric: ${ref.extends}, falling back to default`);
      return this.rubrics.get('default')!;
    }

    // Merge criteria overrides
    const mergedCriteria = this.mergeCriteria(
      baseRubric.criteria,
      ref.criteria as Record<string, RubricCriterion> | undefined
    );

    return {
      ...baseRubric,
      id: `${baseRubric.id}-custom`,
      criteria: mergedCriteria,
    };
  }

  /**
   * List all available rubrics
   */
  list(): Rubric[] {
    return Array.from(this.rubrics.values());
  }

  /**
   * Merge criteria from base and override
   */
  private mergeCriteria(
    base: Record<string, RubricCriterion>,
    override?: Record<string, RubricCriterion | Partial<RubricCriterion>>
  ): Record<string, RubricCriterion> {
    if (!override) {
      return { ...base };
    }

    const result: Record<string, RubricCriterion> = { ...base };

    for (const [key, value] of Object.entries(override)) {
      if (result[key]) {
        // Merge with existing criterion
        result[key] = {
          ...result[key],
          ...value,
          evaluators: value.evaluators || result[key].evaluators,
        };
      } else {
        // Add new criterion
        result[key] = value as RubricCriterion;
      }
    }

    return result;
  }
}

// Singleton instance
let registryInstance: RubricRegistry | null = null;

/**
 * Get the rubric registry singleton
 */
export function getRubricRegistry(): RubricRegistry {
  if (!registryInstance) {
    registryInstance = new RubricRegistry();
  }
  return registryInstance;
}

/**
 * Load rubrics from the default locations
 */
export async function loadRubrics(projectRoot: string = process.cwd()): Promise<RubricRegistry> {
  const registry = getRubricRegistry();

  // Load from project-specific directory
  const projectRubrics = path.join(projectRoot, '.sniffbench', 'rubrics');
  await registry.loadFromDirectory(projectRubrics);

  // Load from sniffbench installation
  const installRubrics = path.join(__dirname, '..', '..', 'rubrics');
  await registry.loadFromDirectory(installRubrics);

  return registry;
}

/**
 * Validate that rubric weights sum to 100
 */
export function validateRubricWeights(rubric: Rubric): { valid: boolean; total: number; message?: string } {
  const total = Object.values(rubric.criteria).reduce((sum, c) => sum + c.weight, 0);

  if (total !== 100) {
    return {
      valid: false,
      total,
      message: `Rubric "${rubric.id}" weights sum to ${total}, expected 100`,
    };
  }

  return { valid: true, total };
}
