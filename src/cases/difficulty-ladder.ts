/**
 * Difficulty Ladder System
 * 
 * Generates difficulty variants (easy/medium/hard) from a base case.
 * Each variant provides different levels of scaffolding/context.
 */

import { Case, CaseFile, CaseDifficulty } from './types';

// =============================================================================
// Difficulty Levels
// =============================================================================

/**
 * Scaffolding level for a difficulty variant
 */
export interface ScaffoldingLevel {
  /** How much context is provided */
  level: 'easy' | 'medium' | 'hard';

  /** Additional files to include (beyond base case files) */
  additionalFiles?: CaseFile[];

  /** Hints or guidance to add to the prompt */
  hints?: string[];

  /** Whether to show the solution (for testing only) */
  showSolution?: boolean;

  /** Notes about this variant */
  notes?: string;
}

/**
 * Difficulty ladder configuration for a case
 */
export interface DifficultyLadder {
  /** Base case (the original task) */
  base: Case;

  /** Scaffolding levels for each difficulty */
  levels: Record<CaseDifficulty, ScaffoldingLevel>;

  /** Whether to auto-generate variants on load */
  autoGenerate?: boolean;
}

// =============================================================================
// Difficulty Ladder Generator
// =============================================================================

/**
 * Generate difficulty variants from a base case
 */
export function generateDifficultyVariants(baseCase: Case): Case[] {
  const variants: Case[] = [];

  // Create easy variant
  const easyVariant = createVariant(baseCase, 'easy');
  if (easyVariant) variants.push(easyVariant);

  // Create medium variant
  const mediumVariant = createVariant(baseCase, 'medium');
  if (mediumVariant) variants.push(mediumVariant);

  // Create hard variant
  const hardVariant = createVariant(baseCase, 'hard');
  if (hardVariant) variants.push(hardVariant);

  return variants;
}

/**
 * Create a single difficulty variant
 */
function createVariant(baseCase: Case, difficulty: CaseDifficulty): Case | null {
  const level = baseCase.difficultyLadder?.levels[difficulty];
  if (!level) {
    // No ladder defined, return null (use base case as-is)
    return null;
  }

  // Combine base files with additional files
  const allFiles = baseCase.files ? [...baseCase.files] : [];
  if (level.additionalFiles) {
    allFiles.push(...level.additionalFiles);
  }

  // Build prompt with hints
  let prompt = baseCase.prompt;
  if (level.hints && level.hints.length > 0) {
    prompt += '\n\n' + level.hints.join('\n');
  }

  // Create variant case
  const variant: Case = {
    ...baseCase,
    id: `${baseCase.id}-${difficulty}`,
    title: `${baseCase.title} (${difficulty})`,
    prompt,
    files: allFiles,
    difficulty,
    // Don't include solution in variants (unless explicitly requested)
    solution: level.showSolution ? baseCase.solution : undefined,
    notes: level.notes,
  };

  return variant;
}

/**
 * Get the scaffolding level for a difficulty
 */
export function getScaffoldingLevel(baseCase: Case, difficulty: CaseDifficulty): ScaffoldingLevel | null {
  return baseCase.difficultyLadder?.levels[difficulty] || null;
}

/**
 * Check if a case has a difficulty ladder defined
 */
export function hasDifficultyLadder(baseCase: Case): boolean {
  return !!baseCase.difficultyLadder;
}

// =============================================================================
// Difficulty Ladder Builder
// =============================================================================

/**
 * Builder for creating difficulty ladders
 */
export class DifficultyLadderBuilder {
  private base: Case;
  private levels: Partial<Record<CaseDifficulty, ScaffoldingLevel>> = {};

  constructor(baseCase: Case) {
    this.base = baseCase;
  }

  /**
   * Set the easy level scaffolding
   */
  withEasy(hints?: string[], additionalFiles?: CaseFile[], notes?: string): this {
    this.levels.easy = {
      level: 'easy',
      hints,
      additionalFiles,
      notes,
    };
    return this;
  }

  /**
   * Set the medium level scaffolding
   */
  withMedium(hints?: string[], additionalFiles?: CaseFile[], notes?: string): this {
    this.levels.medium = {
      level: 'medium',
      hints,
      additionalFiles,
      notes,
    };
    return this;
  }

  /**
   * Set the hard level scaffolding
   */
  withHard(hints?: string[], additionalFiles?: CaseFile[], notes?: string): this {
    this.levels.hard = {
      level: 'hard',
      hints,
      additionalFiles,
      notes,
    };
    return this;
  }

  /**
   * Build the difficulty ladder
   */
  build(): DifficultyLadder {
    return {
      base: this.base,
      levels: this.levels as Record<CaseDifficulty, ScaffoldingLevel>,
      autoGenerate: true,
    };
  }
}

// =============================================================================
// Default Scaffolding Strategies
// =============================================================================

/**
 * Default scaffolding for easy level
 * - More context, hints, and guidance
 */
export function defaultEasyScaffolding(_baseCase: Case): ScaffoldingLevel {
  return {
    level: 'easy',
    hints: [
      'This is an easy task. Focus on correctness and following best practices.',
      'You have all the context you need to complete this task.',
      'Take your time to understand the codebase before making changes.',
    ],
    notes: 'Easy: Maximum scaffolding provided',
  };
}

/**
 * Default scaffolding for medium level
 * - Standard context, minimal hints
 */
export function defaultMediumScaffolding(_baseCase: Case): ScaffoldingLevel {
  return {
    level: 'medium',
    hints: [
      'Complete this task to the best of your ability.',
    ],
    notes: 'Medium: Standard scaffolding',
  };
}

/**
 * Default scaffolding for hard level
 * - Minimal context, agent must discover
 */
export function defaultHardScaffolding(_baseCase: Case): ScaffoldingLevel {
  return {
    level: 'hard',
    hints: [
      'You need to figure out the best approach for this task.',
      'Explore the codebase to understand the context.',
      'Make reasonable assumptions and document them.',
    ],
    notes: 'Hard: Minimal scaffolding',
  };
}

/**
 * Create a difficulty ladder with default scaffolding
 */
export function createDefaultLadder(_baseCase: Case): DifficultyLadder {
  return {
    base: _baseCase,
    levels: {
      easy: defaultEasyScaffolding(_baseCase),
      medium: defaultMediumScaffolding(_baseCase),
      hard: defaultHardScaffolding(_baseCase),
    },
    autoGenerate: true,
  };
}
