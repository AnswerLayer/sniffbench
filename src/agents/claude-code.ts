/**
 * Claude Code agent wrapper using the official SDK
 *
 * Uses @anthropic-ai/claude-agent-sdk for programmatic interaction
 * with full metrics capture (tokens, cost, tool usage).
 */

import { spawn } from 'child_process';
import {
  AgentWrapper,
  AgentResult,
  AgentRunOptions,
  AgentEvent,
  ToolCall,
  emptyAgentResult,
} from './types.js';

// SDK type imports
type SDKMessage = import('@anthropic-ai/claude-agent-sdk').SDKMessage;
type SDKResultMessage = import('@anthropic-ai/claude-agent-sdk').SDKResultMessage;
type SDKAssistantMessage = import('@anthropic-ai/claude-agent-sdk').SDKAssistantMessage;
type SDKSystemMessage = import('@anthropic-ai/claude-agent-sdk').SDKSystemMessage;
type SDKUserMessage = import('@anthropic-ai/claude-agent-sdk').SDKUserMessage;
type SDKPartialAssistantMessage = import('@anthropic-ai/claude-agent-sdk').SDKPartialAssistantMessage;
type Options = import('@anthropic-ai/claude-agent-sdk').Options;

/**
 * Type guard for tool_use_result shape (SDK types this as `unknown`)
 */
interface ToolUseResult {
  tool_use_id?: string;
  content?: string;
}

function isToolUseResult(value: unknown): value is ToolUseResult {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    (obj.tool_use_id === undefined || typeof obj.tool_use_id === 'string') &&
    (obj.content === undefined || typeof obj.content === 'string')
  );
}

/**
 * Claude Code agent wrapper using the official SDK
 */
export class ClaudeCodeAgent implements AgentWrapper {
  name = 'claude-code';
  displayName = 'Claude Code';

  /** Path to claude CLI (for version check) */
  private cliPath: string;

  constructor(cliPath: string = 'claude') {
    this.cliPath = cliPath;
  }

  /**
   * Check if Claude Code is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const version = await this.getVersion();
      return version !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get Claude Code version
   */
  async getVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, ['--version'], {
        timeout: 5000,
      });

      let stdout = '';
      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          resolve(stdout.trim());
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => {
        resolve(null);
      });
    });
  }

  /**
   * Run a prompt through Claude Code using the SDK
   */
  async run(prompt: string, options: AgentRunOptions): Promise<AgentResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 300000; // 5 min default

    // Track tool calls
    const toolCalls: ToolCall[] = [];
    const toolStartTimes: Map<string, number> = new Map();
    let model = 'unknown';
    let sessionId = '';

    // Emit start event
    options.onEvent?.({ type: 'start', timestamp: startTime, model });

    try {
      // Dynamic import of ESM SDK
      const sdk = await import('@anthropic-ai/claude-agent-sdk');

      // Build SDK options
      // Note: env is passed directly without spreading process.env to avoid leaking secrets.
      // SDK inherits process.env by default when env is undefined. If caller needs to add
      // custom vars while preserving the environment, they should explicitly spread process.env.
      const sdkOptions: Options = {
        cwd: options.cwd,
        permissionMode: options.permissionMode || 'acceptEdits',
        allowedTools: options.allowedTools,
        disallowedTools: options.disallowedTools,
        maxBudgetUsd: options.maxBudgetUsd,
        maxTurns: options.maxTurns,
        model: options.model,
        includePartialMessages: options.includePartialMessages ?? true,
        env: options.env,
        // Don't load user/project settings - isolation mode
        settingSources: [],
      };

      // Set up abort controller for timeout
      const abortController = new AbortController();
      sdkOptions.abortController = abortController;

      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, timeoutMs);

      // Resolve includePartialMessages for consistent use
      const includePartial = sdkOptions.includePartialMessages ?? true;

      // Run the query
      const query = sdk.query({ prompt, options: sdkOptions });

      let finalResult: SDKResultMessage | null = null;

      try {
        for await (const message of query) {
          this.processMessage(message, options, toolCalls, toolStartTimes, includePartial, (m) => {
            model = m;
          }, (s) => {
            sessionId = s;
          });

          // Capture result message
          if (message.type === 'result') {
            finalResult = message as SDKResultMessage;
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }

      // Build result from SDK response
      if (finalResult) {
        const result = this.buildResult(finalResult, toolCalls, model, sessionId);
        options.onEvent?.({ type: 'complete', result });
        return result;
      }

      // No result message - something went wrong
      const errorResult = emptyAgentResult('No result received from SDK');
      errorResult.durationMs = Date.now() - startTime;
      errorResult.toolCalls = toolCalls;
      errorResult.toolsUsed = [...new Set(toolCalls.map((t) => t.name))];
      options.onEvent?.({ type: 'complete', result: errorResult });
      return errorResult;

    } catch (error) {
      // Check for AbortError by name (DOMException may not inherit from Error)
      const errorName = error && typeof error === 'object' && 'name' in error
        ? (error as { name: unknown }).name
        : undefined;
      const isTimeout = errorName === 'AbortError';
      const errorMessage = error instanceof Error
        ? error.message
        : (error && typeof error === 'object' && 'message' in error)
          ? String((error as { message: unknown }).message)
          : String(error);

      options.onEvent?.({
        type: 'error',
        message: isTimeout ? 'Timed out' : errorMessage,
        code: isTimeout ? 'TIMEOUT' : 'ERROR',
      });

      const errorResult = emptyAgentResult(isTimeout ? 'Timed out' : errorMessage);
      errorResult.timedOut = isTimeout;
      errorResult.durationMs = Date.now() - startTime;
      errorResult.toolCalls = toolCalls;
      errorResult.toolsUsed = [...new Set(toolCalls.map((t) => t.name))];
      errorResult.model = model;

      options.onEvent?.({ type: 'complete', result: errorResult });
      return errorResult;
    }
  }

  /**
   * Process a streaming message from the SDK
   */
  private processMessage(
    message: SDKMessage,
    options: AgentRunOptions,
    toolCalls: ToolCall[],
    toolStartTimes: Map<string, number>,
    includePartialMessages: boolean,
    setModel: (m: string) => void,
    setSessionId: (s: string) => void,
  ): void {
    switch (message.type) {
      case 'system': {
        const sysMsg = message as SDKSystemMessage;
        if (sysMsg.subtype === 'init') {
          setModel(sysMsg.model);
          setSessionId(sysMsg.session_id);
          options.onEvent?.({
            type: 'status',
            message: `Initialized with model ${sysMsg.model}`,
          });
        }
        break;
      }

      case 'assistant': {
        const assistantMsg = message as SDKAssistantMessage;
        // Process content blocks for tool usage
        const content = assistantMsg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              const toolCall: ToolCall = {
                id: block.id,
                name: block.name,
                input: block.input as Record<string, unknown>,
                timestamp: Date.now(),
              };
              toolCalls.push(toolCall);
              toolStartTimes.set(block.id, Date.now());

              options.onEvent?.({
                type: 'tool_start',
                tool: toolCall,
              });
            } else if (block.type === 'text') {
              // Final text output - only emit if NOT streaming partial messages
              // (otherwise we already streamed it via stream_event)
              if (!includePartialMessages) {
                options.onEvent?.({
                  type: 'text_delta',
                  text: (block as { text: string }).text,
                });
              }
            } else if (block.type === 'thinking') {
              // Only emit if NOT streaming partial messages (avoid duplicates)
              if (!includePartialMessages) {
                options.onEvent?.({
                  type: 'thinking',
                  text: (block as { thinking?: string }).thinking || '',
                });
              }
            }
          }
        }
        break;
      }

      case 'user': {
        // Tool results come back as user messages
        const userMsg = message as SDKUserMessage;
        const toolResult = userMsg.tool_use_result;

        if (isToolUseResult(toolResult) && toolResult.tool_use_id) {
          const toolId = toolResult.tool_use_id;
          const startTime = toolStartTimes.get(toolId);
          const durationMs = startTime ? Date.now() - startTime : 0;

          // Update tool call with duration and result
          const toolCall = toolCalls.find((t) => t.id === toolId);
          if (toolCall) {
            toolCall.durationMs = durationMs;
            toolCall.success = true;
            // Capture truncated result for display
            if (toolResult.content) {
              toolCall.result = toolResult.content.substring(0, 500);
            }
          }

          options.onEvent?.({
            type: 'tool_end',
            toolId,
            success: true,
            durationMs,
            result: toolResult.content?.substring(0, 200),
          });
        }
        break;
      }

      case 'stream_event': {
        // Partial streaming messages
        const partialMsg = message as SDKPartialAssistantMessage;
        const event = partialMsg.event;

        if (event?.type === 'content_block_delta') {
          const delta = (event as { delta?: { type?: string; text?: string; thinking?: string } }).delta;
          if (delta?.type === 'text_delta' && delta.text) {
            options.onEvent?.({
              type: 'text_delta',
              text: delta.text,
            });
          } else if (delta?.type === 'thinking_delta' && delta.thinking) {
            options.onEvent?.({
              type: 'thinking',
              text: delta.thinking,
            });
          }
        }
        break;
      }
    }
  }

  /**
   * Build AgentResult from SDK result message
   */
  private buildResult(
    resultMsg: SDKResultMessage,
    toolCalls: ToolCall[],
    model: string,
    sessionId: string,
  ): AgentResult {
    const usage = resultMsg.usage;
    const isSuccess = resultMsg.subtype === 'success';

    // Build token usage
    const tokens = {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      totalTokens: usage.input_tokens + usage.output_tokens,
    };

    // Build per-model usage
    const modelUsage: AgentResult['modelUsage'] = {};
    for (const [modelName, mu] of Object.entries(resultMsg.modelUsage)) {
      modelUsage[modelName] = {
        inputTokens: mu.inputTokens,
        outputTokens: mu.outputTokens,
        cacheReadTokens: mu.cacheReadInputTokens,
        cacheWriteTokens: mu.cacheCreationInputTokens,
        costUsd: mu.costUSD,
      };
    }

    return {
      answer: isSuccess ? (resultMsg as { result: string }).result : '',
      success: isSuccess && !resultMsg.is_error,
      error: !isSuccess ? (resultMsg as { errors?: string[] }).errors?.join(', ') : undefined,
      timedOut: false,
      durationMs: resultMsg.duration_ms,
      tokens,
      costUsd: resultMsg.total_cost_usd,
      numTurns: resultMsg.num_turns,
      toolCalls,
      toolsUsed: [...new Set(toolCalls.map((t) => t.name))],
      model,
      modelUsage,
      raw: {
        sessionId,
      },
    };
  }
}

/**
 * Create a Claude Code agent instance
 */
export function createClaudeCodeAgent(cliPath?: string): ClaudeCodeAgent {
  return new ClaudeCodeAgent(cliPath);
}
