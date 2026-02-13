/**
 * Opencode agent wrapper using SDK
 *
 * Uses @opencode-ai/sdk for programmatic interaction with opencode.
 * The SDK manages server lifecycle internally.
 */

import { spawn } from 'child_process';
import {
  AgentWrapper,
  AgentResult,
  AgentRunOptions,
  ToolCall,
  emptyAgentResult,
} from './types.js';

// Import SDK wrapper dynamically since it's ESM-only
let createOpencode: any;
const loadSDK = async () => {
  if (!createOpencode) {
    const sdkWrapper = await import('./opencode-sdk.mjs');
    createOpencode = sdkWrapper.createOpencode;
  }
  return createOpencode;
};

/**
 * Opencode agent wrapper using SDK
 */
export class OpencodeAgent implements AgentWrapper {
  name = 'opencode';
  displayName = 'Opencode';

  /** Path to opencode CLI */
  private cliPath: string;

  constructor(cliPath: string = '/opt/homebrew/bin/opencode') {
    this.cliPath = cliPath;
  }

  /**
   * Check if Opencode is available
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
   * Get Opencode version
   */
  async getVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, ['--version'], {
        timeout: 5000,
      });

      let stdout = '';
      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.on('close', (code: number | null) => {
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
   * Run a prompt through Opencode
   */
  async run(prompt: string, options: AgentRunOptions): Promise<AgentResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 300000;

    const toolCalls: ToolCall[] = [];
    const toolStartTimes: Map<string, number> = new Map();
    let model = 'unknown';
    let sessionId = '';

    try {
      const createOpencodeFn = await loadSDK();
      const opencode = await createOpencodeFn({
        signal: AbortSignal.timeout(timeoutMs),
      });

      const client = opencode.client;

      const createResult = await client.session.create({
        query: { directory: options.cwd },
      });

      if (createResult.error) {
        throw new Error(`Failed to create session: ${JSON.stringify(createResult.error)}`);
      }

      const session = createResult.data;
      sessionId = session.id;
      model = options.model || session.version || 'unknown';

      options.onEvent?.({
        type: 'start',
        timestamp: startTime,
        model,
      });

      const promptResult = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: prompt }],
        },
      });

      if (promptResult.error) {
        throw new Error(`Prompt failed: ${JSON.stringify(promptResult.error)}`);
      }

      const response = promptResult.data;
      const parts = response.parts || [];

      for (const part of parts) {
        if (part.type === 'text') {
          const textPart = part as { text?: string };
          if (textPart.text) {
            options.onEvent?.({
              type: 'text_delta',
              text: textPart.text,
            });
          }
        } else if (part.type === 'tool') {
          const toolPart = part as {
            tool: string;
            callID: string;
            state: { status?: string };
          };
          if (toolPart.state.status === 'pending') {
            const toolCall: ToolCall = {
              id: toolPart.callID,
              name: toolPart.tool,
              input: {},
              timestamp: Date.now(),
            };
            toolCalls.push(toolCall);
            toolStartTimes.set(toolPart.callID, Date.now());

            options.onEvent?.({
              type: 'tool_start',
              tool: toolCall,
            });
          } else if (toolPart.state.status === 'completed') {
            const toolId = toolPart.callID;
            const startTime = toolStartTimes.get(toolId);
            const durationMs = startTime ? Date.now() - startTime : 0;

            const toolCall = toolCalls.find((t) => t.id === toolId);
            if (toolCall) {
              toolCall.durationMs = durationMs;
              toolCall.success = true;
            }

            options.onEvent?.({
              type: 'tool_end',
              toolId,
              success: true,
              durationMs,
            });
          }
        }
      }

      const info = response.info;
      const tokens = {
        inputTokens: info.tokens?.input || 0,
        outputTokens: info.tokens?.output || 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: (info.tokens?.input || 0) + (info.tokens?.output || 0),
      };

      model = info.providerID && info.modelID ? `${info.providerID}/${info.modelID}` : model;

      let answer = '';
      for (const part of parts) {
        if (part.type === 'text') {
          const textPart = part as { text?: string };
          answer += textPart.text || '';
        }
      }

      const result: AgentResult = {
        answer,
        success: true,
        timedOut: false,
        durationMs: Date.now() - startTime,
        tokens,
        costUsd: info.cost || 0,
        numTurns: 1,
        toolCalls,
        toolsUsed: [...new Set(toolCalls.map((t) => t.name))],
        model,
        raw: {
          sessionId,
        },
      };

      options.onEvent?.({ type: 'complete', result });
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);

      options.onEvent?.({
        type: 'error',
        message: errorMessage,
        code: 'ERROR',
      });

      const errorResult = emptyAgentResult(errorMessage);
      errorResult.durationMs = Date.now() - startTime;
      errorResult.toolCalls = toolCalls;
      errorResult.toolsUsed = [...new Set(toolCalls.map((t) => t.name))];
      errorResult.model = model;

      options.onEvent?.({ type: 'complete', result: errorResult });
      return errorResult;
    }
  }
}

/**
 * Create an Opencode agent instance
 */
export function createOpencodeAgent(cliPath?: string): OpencodeAgent {
  return new OpencodeAgent(cliPath);
}