/**
 * Case loader - reads and validates test cases from disk
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import { Case, CaseSource, CaseDifficulty, CaseFile } from './types';

// =============================================================================
// Validation
// =============================================================================

/**
 * Validation error with context
 */
export class CaseValidationError extends Error {
  constructor(
    public filePath: string,
    public field: string,
    message: string
  ) {
    super(`${filePath}: ${field} - ${message}`);
    this.name = 'CaseValidationError';
  }
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: CaseValidationError[];
  warnings: string[];
}

/**
 * Validate a case object
 */
export function validateCase(data: unknown, filePath: string): ValidationResult {
  const errors: CaseValidationError[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push(new CaseValidationError(filePath, 'root', 'Case must be an object'));
    return { valid: false, errors, warnings };
  }

  const obj = data as Record<string, unknown>;

  // Required fields
  if (!obj.id || typeof obj.id !== 'string') {
    errors.push(new CaseValidationError(filePath, 'id', 'Required field, must be a string'));
  } else if (!/^[a-z0-9-]+$/.test(obj.id)) {
    errors.push(new CaseValidationError(filePath, 'id', 'Must contain only lowercase letters, numbers, and hyphens'));
  }

  if (!obj.title || typeof obj.title !== 'string') {
    errors.push(new CaseValidationError(filePath, 'title', 'Required field, must be a string'));
  }

  if (!obj.prompt || typeof obj.prompt !== 'string') {
    errors.push(new CaseValidationError(filePath, 'prompt', 'Required field, must be a string'));
  } else if (obj.prompt.length < 10) {
    warnings.push(`${filePath}: prompt is very short (${obj.prompt.length} chars)`);
  }

  if (!obj.source || typeof obj.source !== 'string') {
    errors.push(new CaseValidationError(filePath, 'source', 'Required field, must be one of: bootstrap, generated, manual, imported'));
  } else if (!['bootstrap', 'generated', 'manual', 'imported'].includes(obj.source)) {
    errors.push(new CaseValidationError(filePath, 'source', `Invalid value "${obj.source}", must be one of: bootstrap, generated, manual, imported`));
  }

  if (!obj.language || typeof obj.language !== 'string') {
    errors.push(new CaseValidationError(filePath, 'language', 'Required field, must be a string'));
  }

  if (!obj.difficulty || typeof obj.difficulty !== 'string') {
    errors.push(new CaseValidationError(filePath, 'difficulty', 'Required field, must be one of: easy, medium, hard'));
  } else if (!['easy', 'medium', 'hard'].includes(obj.difficulty)) {
    errors.push(new CaseValidationError(filePath, 'difficulty', `Invalid value "${obj.difficulty}", must be one of: easy, medium, hard`));
  }

  if (!obj.category || typeof obj.category !== 'string') {
    errors.push(new CaseValidationError(filePath, 'category', 'Required field, must be a string'));
  }

  // Optional fields with validation
  if (obj.files !== undefined) {
    if (!Array.isArray(obj.files)) {
      errors.push(new CaseValidationError(filePath, 'files', 'Must be an array'));
    } else {
      obj.files.forEach((file, index) => {
        if (!file.path || typeof file.path !== 'string') {
          errors.push(new CaseValidationError(filePath, `files[${index}].path`, 'Required field, must be a string'));
        }
        if (file.content === undefined && file.ref === undefined) {
          errors.push(new CaseValidationError(filePath, `files[${index}]`, 'Must have either content or ref'));
        }
      });
    }
  }

  if (obj.tags !== undefined && !Array.isArray(obj.tags)) {
    errors.push(new CaseValidationError(filePath, 'tags', 'Must be an array of strings'));
  }

  if (obj.expectations !== undefined && typeof obj.expectations !== 'object') {
    errors.push(new CaseValidationError(filePath, 'expectations', 'Must be an object'));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// Loading
// =============================================================================

export interface LoadOptions {
  /** Filter by category */
  category?: string;

  /** Filter by language */
  language?: string;

  /** Filter by difficulty */
  difficulty?: CaseDifficulty;

  /** Filter by source */
  source?: CaseSource;

  /** Filter by tags (case must have all specified tags) */
  tags?: string[];

  /** Specific case IDs to load */
  ids?: string[];

  /** Skip validation (not recommended) */
  skipValidation?: boolean;

  /** Include cases that fail validation (with warnings) */
  includeInvalid?: boolean;
}

/**
 * Load all cases from a directory
 */
export async function loadCases(casesDir: string, options: LoadOptions = {}): Promise<Case[]> {
  const cases: Case[] = [];

  // Check if directory exists
  if (!fs.existsSync(casesDir)) {
    return cases;
  }

  // Recursively find all YAML files
  const yamlFiles = findYamlFiles(casesDir);

  for (const filePath of yamlFiles) {
    try {
      const result = await loadCaseFile(filePath, options);
      if (result.case && matchesFilter(result.case, options)) {
        cases.push(result.case);
      }
      // Log warnings
      for (const warning of result.warnings) {
        console.warn(`Warning: ${warning}`);
      }
    } catch (err) {
      if (err instanceof CaseValidationError) {
        if (options.includeInvalid) {
          console.warn(`Validation error: ${err.message}`);
        } else {
          console.error(`Error: ${err.message}`);
        }
      } else {
        console.warn(`Warning: Failed to load case from ${filePath}: ${(err as Error).message}`);
      }
    }
  }

  // Sort by difficulty then by id
  const difficultyOrder = { easy: 0, medium: 1, hard: 2 };
  cases.sort((a, b) => {
    const diffA = difficultyOrder[a.difficulty] ?? 1;
    const diffB = difficultyOrder[b.difficulty] ?? 1;
    if (diffA !== diffB) return diffA - diffB;
    return a.id.localeCompare(b.id);
  });

  return cases;
}

/**
 * Result from loading a case file
 */
export interface LoadCaseResult {
  case: Case | null;
  warnings: string[];
  errors: CaseValidationError[];
}

/**
 * Load a single case from a file
 */
export async function loadCaseFile(filePath: string, options: LoadOptions = {}): Promise<LoadCaseResult> {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Skip files that are just comments or empty
  if (!content.trim() || (content.trim().startsWith('#') && !content.includes('id:'))) {
    return { case: null, warnings: [], errors: [] };
  }

  let data: unknown;
  try {
    data = YAML.parse(content);
  } catch (err) {
    throw new CaseValidationError(filePath, 'yaml', `Invalid YAML: ${(err as Error).message}`);
  }

  // Validate
  if (!options.skipValidation) {
    const validation = validateCase(data, filePath);
    if (!validation.valid) {
      if (!options.includeInvalid) {
        throw validation.errors[0];
      }
      return { case: null, warnings: validation.warnings, errors: validation.errors };
    }
    if (validation.warnings.length > 0) {
      return {
        case: dataToCase(data as Record<string, unknown>, filePath),
        warnings: validation.warnings,
        errors: [],
      };
    }
  }

  return {
    case: dataToCase(data as Record<string, unknown>, filePath),
    warnings: [],
    errors: [],
  };
}

/**
 * Convert raw data to a Case object
 */
function dataToCase(data: Record<string, unknown>, filePath: string): Case {
  return {
    id: data.id as string,
    title: data.title as string,
    prompt: data.prompt as string,
    files: data.files as CaseFile[] | undefined,
    rubric: data.rubric as string | undefined,
    source: data.source as CaseSource,
    language: data.language as string,
    difficulty: data.difficulty as CaseDifficulty,
    category: data.category as string,
    tags: (data.tags as string[]) || [],
    expectations: data.expectations as Case['expectations'],
    version: data.version as string | undefined,
    solution: data.solution as CaseFile[] | undefined,
    notes: data.notes as string | undefined,
    _sourcePath: filePath,
    _loadedAt: new Date(),
  };
}

/**
 * Find all YAML files recursively
 */
function findYamlFiles(dir: string): string[] {
  const results: string[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      results.push(...findYamlFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Check if a case matches the filter options
 */
function matchesFilter(caseData: Case, options: LoadOptions): boolean {
  // Filter by specific IDs
  if (options.ids && options.ids.length > 0) {
    if (!options.ids.includes(caseData.id)) {
      return false;
    }
  }

  // Filter by category
  if (options.category && caseData.category !== options.category) {
    return false;
  }

  // Filter by language
  if (options.language && caseData.language !== options.language) {
    return false;
  }

  // Filter by difficulty
  if (options.difficulty && caseData.difficulty !== options.difficulty) {
    return false;
  }

  // Filter by source
  if (options.source && caseData.source !== options.source) {
    return false;
  }

  // Filter by tags (must have ALL specified tags)
  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      if (!caseData.tags?.includes(tag)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get the default cases directory for a project
 */
export function getDefaultCasesDir(projectRoot: string = process.cwd()): string {
  // Check for .sniffbench/cases first (project-specific)
  const projectCases = path.join(projectRoot, '.sniffbench', 'cases');
  if (fs.existsSync(projectCases)) {
    return projectCases;
  }

  // Fall back to cases/ in sniffbench installation
  return path.join(__dirname, '..', '..', 'cases');
}

/**
 * List available case categories
 */
export async function listCategories(casesDir: string): Promise<string[]> {
  const cases = await loadCases(casesDir);
  const categories = new Set(cases.map((c) => c.category));
  return Array.from(categories).sort();
}

/**
 * List available languages
 */
export async function listLanguages(casesDir: string): Promise<string[]> {
  const cases = await loadCases(casesDir);
  const languages = new Set(cases.map((c) => c.language));
  return Array.from(languages).sort();
}

/**
 * Get a single case by ID
 */
export async function getCaseById(casesDir: string, id: string): Promise<Case | null> {
  const cases = await loadCases(casesDir, { ids: [id] });
  return cases[0] || null;
}
