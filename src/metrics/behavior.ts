/**
 * Behavior metrics computation
 *
 * Analyzes HOW an agent works based on raw execution data.
 * These metrics help understand agent efficiency and patterns.
 */

import { AgentResult, BehaviorMetrics } from '../agents/types.js';

/** Tools considered "exploration" (read-only research) */
const EXPLORATION_TOOLS = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];

/**
 * Compute behavior metrics from an agent result
 */
export function computeBehaviorMetrics(result: AgentResult): BehaviorMetrics {
  const { tokens, costUsd, toolCalls } = result;

  const safeToolCount = Math.max(toolCalls.length, 1);

  // Exploration ratio: what fraction of tool calls are read-only research
  const explorationCalls = toolCalls.filter((t) =>
    EXPLORATION_TOOLS.includes(t.name)
  ).length;
  const explorationRatio = explorationCalls / safeToolCount;

  // Cache hit ratio: fraction of input tokens that came from cache
  // In Claude API: input_tokens = new tokens, cache_read_input_tokens = cached tokens
  // Total input = input_tokens + cache_read_input_tokens
  const totalInputTokens = tokens.inputTokens + tokens.cacheReadTokens;
  const cacheHitRatio = totalInputTokens > 0
    ? tokens.cacheReadTokens / totalInputTokens
    : 0;


  // Average tool duration (may be 0 if SDK doesn't provide timing)
  const totalToolDuration = toolCalls.reduce(
    (sum, t) => sum + (t.durationMs || 0),
    0
  );
  const avgToolDurationMs = totalToolDuration / safeToolCount;

  // Tokens per tool call
  const tokensPerTool = tokens.totalTokens / safeToolCount;

  // Count Read tool calls and compute tokens per read
  const readCount = toolCalls.filter((t) => t.name === 'Read').length;
  const tokensPerRead = readCount > 0 ? tokens.totalTokens / readCount : 0;

  return {
    totalTokens: tokens.totalTokens,
    toolCount: toolCalls.length,
    costUsd: Math.round(costUsd * 10000) / 10000, // 4 decimals
    explorationRatio: Math.round(explorationRatio * 100) / 100, // 2 decimals
    cacheHitRatio: Math.round(cacheHitRatio * 100) / 100,
    avgToolDurationMs: Math.round(avgToolDurationMs),
    tokensPerTool: Math.round(tokensPerTool),
    tokensPerRead: Math.round(tokensPerRead),
    readCount,
    inputTokens: tokens.inputTokens,
    cacheReadTokens: tokens.cacheReadTokens,
    cacheWriteTokens: tokens.cacheWriteTokens,
  };
}

/**
 * Format behavior metrics for display
 */
export function formatBehaviorMetrics(metrics: BehaviorMetrics): string {
  const lines = [
    `    Tokens: ${metrics.totalTokens.toLocaleString()}    ` +
      `Tools: ${metrics.toolCount}    ` +
      `Cost: $${metrics.costUsd.toFixed(4)}`,
    `    Tokens/tool: ${metrics.tokensPerTool.toLocaleString()}    ` +
      `Tokens/read: ${metrics.tokensPerRead.toLocaleString()} (${metrics.readCount} reads)`,
    `    Exploration Ratio: ${Math.round(metrics.explorationRatio * 100)}%    ` +
      `Cache hits: ${Math.round(metrics.cacheHitRatio * 100)}%`,
    `    Cache: input=${metrics.inputTokens.toLocaleString()} ` +
      `read=${metrics.cacheReadTokens.toLocaleString()} ` +
      `write=${metrics.cacheWriteTokens.toLocaleString()}`,
  ];
  return lines.join('\n');
}
