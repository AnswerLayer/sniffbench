/**
 * Case loader - reads test cases from disk
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import { Case } from './types';

export interface LoadOptions {
  /** Filter by category */
  category?: string;

  /** Filter by language */
  language?: string;

  /** Filter by difficulty */
  difficulty?: 'easy' | 'medium' | 'hard';

  /** Filter by tags (case must have all specified tags) */
  tags?: string[];

  /** Specific case IDs to load */
  ids?: string[];
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
      const caseData = await loadCaseFile(filePath);
      if (caseData && matchesFilter(caseData, options)) {
        cases.push(caseData);
      }
    } catch (err) {
      // Log but don't fail on individual case errors
      console.warn(`Warning: Failed to load case from ${filePath}: ${(err as Error).message}`);
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
 * Load a single case from a file
 */
export async function loadCaseFile(filePath: string): Promise<Case | null> {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Skip files that are just comments or empty
  if (content.trim().startsWith('#') && !content.includes('id:')) {
    return null;
  }

  const data = YAML.parse(content);

  // Validate required fields
  if (!data.id || !data.title || !data.files || !data.validation) {
    return null;
  }

  // Add source path
  data.sourcePath = filePath;

  // Set defaults
  data.tags = data.tags || [];
  data.difficulty = data.difficulty || 'medium';
  data.category = data.category || 'general';
  data.language = data.language || 'unknown';

  return data as Case;
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

  // Filter by tags (must have ALL specified tags)
  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      if (!caseData.tags.includes(tag)) {
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
