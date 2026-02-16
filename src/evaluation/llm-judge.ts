/**
 * LLM Judge Evaluator - Uses Claude API to evaluate answers
 *
 * Provides structured evaluation of agent answers against baselines
 * or quality criteria using LLM-based judgment.
 */

import { getEnvVar } from '../utils/env';
import type { LLMJudgeEvaluator, EvaluatorResult } from '../cases/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Score from LLM evaluation
 */
export interface LLMJudgeScore {
  /** Overall score from 0.0 to 1.0 */
  score: number;

  /** Whether the answer passed (score >= threshold) */
  passed: boolean;

  /** Reasoning for the score */
  reasoning: string;

  /** Criticisms or issues found */
  criticisms?: string[];

  /** Strengths identified */
  strengths?: string[];
}

/**
 * Comparison result between two answers
 */
export interface ComparisonResult {
  /** Which answer is better (if any) */
  winner?: 'answer1' | 'answer2' | 'tie';

  /** Score for answer 1 */
  score1: LLMJudgeScore;

  /** Score for answer 2 */
  score2: LLMJudgeScore;

  /** Overall comparison reasoning */
  reasoning: string;
}

/**
 * Evaluation options
 */
export interface LLMJudgeOptions {
  /** Model to use for evaluation (default: claude-3-5-sonnet-20241022) */
  model?: string;

  /** API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string;

  /** Maximum tokens for response */
  maxTokens?: number;

  /** Temperature for generation (0.0-1.0) */
  temperature?: number;

  /** Enable caching to reduce costs */
  enableCache?: boolean;

  /** Project root for .env file loading */
  projectRoot?: string;

  /** Callback for progress updates */
  onProgress?: (update: string) => void;
}

/**
 * Cost tracking
 */
export interface CostTracker {
  /** Total input tokens */
  inputTokens: number;

  /** Total output tokens */
  outputTokens: number;

  /** Total cost in USD */
  costUsd: number;

  /** Number of API calls */
  callCount: number;
}

// =============================================================================
// Prompt Templates
// =============================================================================

const PROMPTS = {
  /**
   * Evaluate a single answer on quality criteria
   */
  quality: (criteria: string, answer: string, context?: string) => {
    const contextSection = context ? '\n\nContext:\n' + context : '';
    return 'You are an expert code reviewer. Evaluate the following answer based on the criteria:\n\n' + criteria + contextSection + '\n\nAnswer to evaluate:\n' + answer + '\n\nProvide your evaluation in the following JSON format:\n{\n  "score": 0.0-1.0,\n  "reasoning": "Brief explanation of the score",\n  "criticisms": ["issue 1", "issue 2"],\n  "strengths": ["strength 1", "strength 2"]\n}\n\nThe score should be a number between 0.0 (poor) and 1.0 (excellent).';
  },

  /**
   * Compare two answers
   */
  comparison: (criteria: string, answer1: string, answer2: string, context?: string) => {
    const contextSection = context ? '\n\nContext:\n' + context : '';
    return 'You are an expert code reviewer. Compare the following two answers based on the criteria:\n\n' + criteria + contextSection + '\n\nAnswer 1:\n' + answer1 + '\n\nAnswer 2:\n' + answer2 + '\n\nProvide your comparison in the following JSON format:\n{\n  "winner": "answer1" | "answer2" | "tie",\n  "score1": { "score": 0.0-1.0, "reasoning": "...", "criticisms": [], "strengths": [] },\n  "score2": { "score": 0.0-1.0, "reasoning": "...", "criticisms": [], "strengths": [] },\n  "reasoning": "Overall comparison reasoning"\n}';
  },

  /**
   * Evaluate against a baseline
   */
  baseline: (criteria: string, answer: string, baseline: string, context?: string) => {
    const contextSection = context ? '\n\nContext:\n' + context : '';
    return 'You are an expert code reviewer. Evaluate the following answer against a human-graded baseline.\n\n' + criteria + contextSection + '\n\nBaseline (human-graded):\n' + baseline + '\n\nAnswer to evaluate:\n' + answer + '\n\nProvide your evaluation in the following JSON format:\n{\n  "score": 0.0-1.0,\n  "reasoning": "How this answer compares to the baseline",\n  "criticisms": ["issues compared to baseline"],\n  "strengths": ["strengths compared to baseline"]\n}';
  },
};

// =============================================================================
// LLM Judge Implementation
// =============================================================================

/**
 * LLM Judge - Evaluates answers using Claude API
 */
export class LLMJudge {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private enableCache: boolean;
  private projectRoot: string;
  private costTracker: CostTracker;
  private cache: Map<string, LLMJudgeScore>;

  constructor(options: LLMJudgeOptions = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    this.apiKey = options.apiKey || (getEnvVar('ANTHROPIC_API_KEY', projectRoot) || '');
    this.model = options.model || 'claude-3-5-sonnet-20241022';
    this.maxTokens = options.maxTokens || 1024;
    this.temperature = options.temperature || 0.0;
    this.enableCache = options.enableCache ?? true;
    this.projectRoot = projectRoot;
    this.costTracker = {
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      callCount: 0,
    };
    this.cache = new Map();
  }

  /**
   * Evaluate a single answer
   */
  async evaluate(
    criteria: string,
    answer: string,
    context?: string
  ): Promise<LLMJudgeScore> {
    const cacheKey = this.generateCacheKey('quality', criteria, answer, context);
    if (this.enableCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const prompt = PROMPTS.quality(criteria, answer, context);
    const result = await this.callClaude(prompt);

    if (this.enableCache) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Compare two answers
   */
  async compare(
    criteria: string,
    answer1: string,
    answer2: string,
    context?: string
  ): Promise<ComparisonResult> {
    const cacheKey = this.generateCacheKey('comparison', criteria, answer1, answer2, context);
    if (this.enableCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as ComparisonResult;
    }

    const prompt = PROMPTS.comparison(criteria, answer1, answer2, context);
    const result = await this.callClaude(prompt);

    if (this.enableCache) {
      this.cache.set(cacheKey, result);
    }

    if (!result) {
      throw new Error('Failed to get comparison result');
    }
    return {
      winner: result.winner,
      score1: result as LLMJudgeScore,
      score2: result as LLMJudgeScore,
      reasoning: result.reasoning || ''
    };
  }

  /**
   * Evaluate against a baseline
   */
  async evaluateAgainstBaseline(
    criteria: string,
    answer: string,
    baseline: string,
    context?: string
  ): Promise<LLMJudgeScore> {
    const cacheKey = this.generateCacheKey('baseline', criteria, answer, baseline, context);
    if (this.enableCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const prompt = PROMPTS.baseline(criteria, answer, baseline, context);
    const result = await this.callClaude(prompt);

    if (this.enableCache) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Call Claude API
   */
  private async callClaude(prompt: string): Promise<LLMJudgeScore | null> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }

    this.costTracker.callCount++;

    // Dynamic import of SDK
    const sdk = await import('@anthropic-ai/claude-agent-sdk');

    const response = await sdk.query({
      prompt,
      options: {
        model: this.model,
        // Note: system prompt is not supported in this SDK version
        settingSources: [],
      },
    });

    let result: LLMJudgeScore | null = null;

    for await (const message of response) {
      if (message.type === 'result' && message.subtype === 'success' && (message as any).result) {
        const content = (message as any).result || '';
        result = this.parseResponse(content);
        break;
      }
    }

    if (!result) {
      throw new Error('Failed to parse LLM response');
    }

    return result;
  }

  /**
   * Parse LLM response into structured score
   */
  private parseResponse(content: string): LLMJudgeScore {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);

      return {
        score: this.normalizeScore(data.score),
        passed: this.normalizeScore(data.score) >= 0.7, // Default threshold: 70%
        reasoning: data.reasoning || '',
        criticisms: data.criticisms || [],
        strengths: data.strengths || [],
      };
    } catch (err) {
      throw new Error('Failed to parse LLM response: ' + (err as Error).message);
    }
  }

  /**
   * Normalize score to 0.0-1.0 range
   */
  private normalizeScore(score: unknown): number {
    if (typeof score === 'number') {
      return Math.max(0, Math.min(1, score));
    }
    if (typeof score === 'string') {
      const parsed = parseFloat(score);
      return isNaN(parsed) ? 0 : Math.max(0, Math.min(1, parsed));
    }
    return 0;
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(
    type: string,
    ...args: string[]
  ): string {
    const str = args.join('|||');
    return type + ':' + this.model + ':' + str.substring(0, 200);
  }

  /**
   * Get cost tracking
   */
  getCostTracker(): CostTracker {
    return { ...this.costTracker };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

// =============================================================================
// Evaluator Implementation
// =============================================================================

/**
 * Run LLM judge evaluator
 */
export async function runLLMJudgeEvaluator(
  evaluator: LLMJudgeEvaluator,
  answer: string,
  context?: string
): Promise<EvaluatorResult> {
  const startTime = Date.now();
  const options: LLMJudgeOptions = {
    model: evaluator.model,
    projectRoot: process.cwd(),
  };

  const judge = new LLMJudge(options);

  try {
    let score: LLMJudgeScore;

    switch (evaluator.evaluate) {
      case 'code_quality':
        score = await judge.evaluate(
          'Code quality: Is the code well-structured, readable, and maintainable?',
          answer,
          context
        );
        break;

      case 'readability':
        score = await judge.evaluate(
          'Readability: Is the code easy to understand and follow?',
          answer,
          context
        );
        break;

      case 'documentation':
        score = await judge.evaluate(
          'Documentation: Is the code well-documented with clear comments and explanations?',
          answer,
          context
        );
        break;

      case 'custom':
        if (!evaluator.prompt) {
          throw new Error('Custom evaluation requires a prompt');
        }
        score = await judge.evaluate(evaluator.prompt, answer, context || undefined);
        break;

      default:
        throw new Error('Unknown evaluation type: ' + evaluator.evaluate);
    }

    const durationMs = Date.now() - startTime;

    return {
      name: evaluator.name || 'llm_judge',
      type: 'llm_judge',
      score: score.score,
      passed: score.passed,
      evidence: score.reasoning,
      details: {
        criticisms: score.criticisms,
        strengths: score.strengths,
        cost: judge.getCostTracker(),
      },
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;

    return {
      name: evaluator.name || 'llm_judge',
      type: 'llm_judge',
      score: 0,
      passed: false,
      evidence: (err as Error).message,
      details: {
        error: (err as Error).message,
      },
      durationMs,
    };
  }
}

// =============================================================================
// Comparison Evaluator
// =============================================================================

/**
 * Run LLM judge comparison evaluator
 */
export async function runLLMJudgeComparisonEvaluator(
  evaluator: LLMJudgeEvaluator,
  answer1: string,
  answer2: string,
  context?: string
): Promise<EvaluatorResult> {
  const startTime = Date.now();
  const options: LLMJudgeOptions = {
    model: evaluator.model,
    projectRoot: process.cwd(),
  };

  const judge = new LLMJudge(options);

  try {
    const comparison = await judge.compare(
      'Compare the quality and correctness of these two answers.',
      answer1,
      answer2,
      context || undefined
    );

    const durationMs = Date.now() - startTime;

    return {
      name: evaluator.name || 'llm_judge_comparison',
      type: 'llm_judge',
      score: comparison.winner === 'tie' ? 0.5 : comparison.winner === 'answer1' ? 1.0 : 0.0,
      passed: comparison.winner !== 'answer2',
      evidence: comparison.reasoning,
      details: {
        winner: comparison.winner,
        score1: comparison.score1,
        score2: comparison.score2,
        cost: judge.getCostTracker(),
      },
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;

    return {
      name: evaluator.name || 'llm_judge_comparison',
      type: 'llm_judge',
      score: 0,
      passed: false,
      evidence: (err as Error).message,
      details: {
        error: (err as Error).message,
      },
      durationMs,
    };
  }
}
