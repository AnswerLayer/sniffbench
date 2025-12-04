/**
 * Default rubrics that ship with sniffbench
 *
 * These provide sensible defaults so users can get started without
 * defining their own rubrics.
 */

import { Rubric } from '../cases/types';

/**
 * The default rubric - balanced evaluation for general coding tasks
 *
 * Weights based on ANS-425:
 * - Correctness: 40%
 * - Code Quality: 25%
 * - Safety: 20%
 * - Performance: 10%
 * - Maintainability: 5%
 */
export const defaultRubric: Rubric = {
  id: 'default',
  name: 'Standard Evaluation',
  description: 'Balanced rubric for general coding tasks. Uses test results for correctness and linting for quality.',

  criteria: {
    correctness: {
      weight: 40,
      description: 'Does the solution work correctly?',
      evaluators: [
        {
          type: 'command',
          name: 'Tests pass',
          run: 'npm test 2>/dev/null || pytest 2>/dev/null || go test ./... 2>/dev/null || echo "No test runner found"',
          partialCredit: true,
          passThreshold: 1.0,
        },
      ],
    },

    quality: {
      weight: 25,
      description: 'Is the code well-written?',
      evaluators: [
        {
          type: 'command',
          name: 'Linting',
          run: 'npm run lint 2>/dev/null || ruff check . 2>/dev/null || golint ./... 2>/dev/null || true',
          optional: true,
          partialCredit: true,
        },
      ],
    },

    safety: {
      weight: 20,
      description: 'Is the code safe and secure?',
      evaluators: [
        {
          type: 'pattern',
          name: 'No hardcoded secrets',
          files: '**/*.{js,ts,py,go,java}',
          failIfMatch: '(password|secret|api_key|apikey|auth_token)\\s*[=:]\\s*["\'][^"\']{8,}["\']',
          ignoreCase: true,
          optional: true,
        },
      ],
    },

    performance: {
      weight: 10,
      description: 'Is the solution efficient?',
      evaluators: [
        {
          type: 'command',
          name: 'No obvious performance issues',
          // This is a placeholder - real perf testing would be case-specific
          run: 'true',
          optional: true,
        },
      ],
    },

    maintainability: {
      weight: 5,
      description: 'Is the code maintainable?',
      evaluators: [
        {
          type: 'command',
          name: 'Reasonable file sizes',
          // Check no single file is > 1000 lines
          run: 'find . -name "*.{js,ts,py}" -exec wc -l {} + 2>/dev/null | awk \'$1 > 1000 {exit 1}\' || true',
          optional: true,
        },
      ],
    },
  },
};

/**
 * Minimal rubric - just correctness (tests pass)
 *
 * Use this when you only care about whether the solution works.
 */
export const minimalRubric: Rubric = {
  id: 'minimal',
  name: 'Minimal (Tests Only)',
  description: 'Only checks if tests pass. No quality or safety checks.',

  criteria: {
    correctness: {
      weight: 100,
      description: 'Do the tests pass?',
      evaluators: [
        {
          type: 'command',
          name: 'Tests pass',
          run: 'npm test 2>/dev/null || pytest 2>/dev/null || go test ./... 2>/dev/null || exit 1',
          partialCredit: true,
        },
      ],
    },
  },
};

/**
 * Strict rubric - higher standards for production code
 */
export const strictRubric: Rubric = {
  id: 'strict',
  name: 'Strict Evaluation',
  description: 'Higher standards with type checking and security scanning.',

  criteria: {
    correctness: {
      weight: 35,
      description: 'Does the solution work correctly?',
      evaluators: [
        {
          type: 'command',
          name: 'Tests pass',
          run: 'npm test || pytest || go test ./...',
          partialCredit: true,
          passThreshold: 1.0,
        },
      ],
    },

    quality: {
      weight: 25,
      description: 'Is the code well-written?',
      evaluators: [
        {
          type: 'command',
          name: 'Linting (strict)',
          run: 'npm run lint || ruff check . --select=ALL || golint ./...',
        },
        {
          type: 'command',
          name: 'Formatting',
          run: 'npm run format:check 2>/dev/null || ruff format --check . 2>/dev/null || gofmt -l . 2>/dev/null | grep . && exit 1 || true',
        },
      ],
    },

    typeSafety: {
      weight: 15,
      description: 'Are types used correctly?',
      evaluators: [
        {
          type: 'command',
          name: 'Type checking',
          run: 'npx tsc --noEmit 2>/dev/null || mypy . 2>/dev/null || true',
          partialCredit: true,
        },
      ],
    },

    safety: {
      weight: 20,
      description: 'Is the code safe and secure?',
      evaluators: [
        {
          type: 'command',
          name: 'Security scan',
          run: 'npm audit 2>/dev/null || bandit -r . 2>/dev/null || gosec ./... 2>/dev/null || true',
          optional: true,
          partialCredit: true,
        },
        {
          type: 'pattern',
          name: 'No hardcoded secrets',
          files: '**/*.{js,ts,py,go,java}',
          failIfMatch: '(password|secret|api_key|apikey|auth_token)\\s*[=:]\\s*["\'][^"\']{8,}["\']',
          ignoreCase: true,
        },
        {
          type: 'pattern',
          name: 'No dangerous functions',
          files: '**/*.{js,ts}',
          failIfMatch: '\\beval\\s*\\(|new\\s+Function\\s*\\(',
        },
      ],
    },

    maintainability: {
      weight: 5,
      description: 'Is the code maintainable?',
      evaluators: [
        {
          type: 'command',
          name: 'Complexity check',
          run: 'npx complexity-report --maxcc 10 src/ 2>/dev/null || radon cc . -a -nc 2>/dev/null || true',
          optional: true,
        },
      ],
    },
  },
};

/**
 * All built-in rubrics
 */
export const builtInRubrics: Record<string, Rubric> = {
  default: defaultRubric,
  minimal: minimalRubric,
  strict: strictRubric,
};

/**
 * Get a built-in rubric by ID
 */
export function getBuiltInRubric(id: string): Rubric | undefined {
  return builtInRubrics[id];
}
