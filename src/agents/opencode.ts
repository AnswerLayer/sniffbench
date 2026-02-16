/**
 * Opencode agent wrapper using SDK
 *
 * Uses @opencode-ai/sdk for programmatic interaction with opencode.
 * Spawns the opencode server with the correct working directory so
 * the agent operates on the test case files.
 */

import { spawn, ChildProcess } from 'child_process';
import {
  AgentWrapper,
  AgentResult,
  AgentRunOptions,
  ToolCall,
  emptyAgentResult,
} from './types.js';

// Import SDK client dynamically since it's ESM-only
let _createOpencodeClient: (() => any) | undefined; // SDK type not fully defined
const loadSDK = async () => {
  if (!_createOpencodeClient) {
    const sdkWrapper = await import('./opencode-sdk.mjs');
    _createOpencodeClient = sdkWrapper.createOpencodeClient;
  }
  return _createOpencodeClient;
};

// Port counter to avoid collisions between concurrent runs
let nextPort = 4097;

/**
 * Spawn an opencode server process with the given working directory.
 * Returns the server URL and a close function.
 */
async function spawnServer(
  cwd: string,
  config: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ url: string; proc: ChildProcess }> {
  const port = nextPort++;
  const proc = spawn('opencode', ['serve', `--hostname=127.0.0.1`, `--port=${port}`], {
    cwd,
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    },
  });

  const url = await new Promise<string>((resolve, reject) => {
    const id = setTimeout(() => {
      proc.kill();
      reject(new Error(`Timeout waiting for opencode server after ${timeoutMs}ms`));
    }, timeoutMs);

    let output = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      for (const line of output.split('\n')) {
        if (line.startsWith('opencode server listening')) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
          if (match) {
            clearTimeout(id);
            resolve(match[1]);
            return;
          }
        }
      }
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.on('exit', (code) => {
      clearTimeout(id);
      reject(new Error(`Server exited with code ${code}: ${output}`));
    });
    proc.on('error', (err) => {
      clearTimeout(id);
      reject(err);
    });
  });

  return { url, proc };
}

/**
 * Opencode agent wrapper using SDK
 */
export class OpencodeAgent implements AgentWrapper {
  name = 'opencode';
  displayName = 'Opencode';

  private cliPath: string;
  private config: Record<string, unknown>;

  constructor(cliPath: string = 'opencode', config?: Record<string, unknown>) {
    this.cliPath = cliPath;
    this.config = config || {
      model: 'local-glm/glm-4.7-local-4bit',
      provider: {
        'local-glm': {
          api: 'openai',
          options: {
            baseURL: 'http://127.0.0.1:8081/v1',
            apiKey: 'local-glm-key',
          },
          models: {
            'glm-4.7-local-4bit': {
              name: 'GLM-4.7 Local (4-bit)',
              id: '/Users/studio/models/GLM-4.7-4bit',
              reasoning: false,
              tool_call: true,
              temperature: true,
              limit: { context: 32768, output: 4096 },
              cost: { input: 0, output: 0 },
              modalities: { input: ['text'], output: ['text'] },
            },
          },
        },
      },
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const version = await this.getVersion();
      return version !== null;
    } catch {
      return false;
    }
  }

  async getVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, ['--version'], { timeout: 5000 });
      let stdout = '';
      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      proc.on('close', (code: number | null) => {
        resolve(code === 0 && stdout.trim() ? stdout.trim() : null);
      });
      proc.on('error', () => resolve(null));
    });
  }

  async run(prompt: string, options: AgentRunOptions): Promise<AgentResult> {
    const runStartTime = Date.now();
    const timeoutMs = options.timeoutMs || 300000;
    const toolCalls: ToolCall[] = [];
    let model = 'unknown';
    let sessionId = '';
    let _serverProc: ChildProcess | null = null;

    try {
      // Spawn server in the case's working directory
      const cwd = options.cwd || process.cwd();
      const config = options.model
        ? { ...this.config, model: options.model }
        : this.config;
      const { url, proc } = await spawnServer(cwd, config, 15000);
      _serverProc = proc;

      const createClient = await loadSDK();
      if (!createClient) throw new Error("Failed to load SDK");
      const client = createClient();

      const createResult = await client.session.create({});
      if (createResult.error) {
        throw new Error(`Failed to create session: ${JSON.stringify(createResult.error)}`);
      }

      const session = createResult.data;
      sessionId = session.id;
      model = options.model || session.version || 'unknown';

      options.onEvent?.({ type: 'start', timestamp: runStartTime, model });

      // Subscribe to SSE events BEFORE sending the prompt so we capture everything
      // event.subscribe() returns ServerSentEventsResult directly (not { data, error })
      const sseResult = await client.event.subscribe({}) as unknown;
      const stream: AsyncIterable<unknown> | undefined =
        (sseResult as { stream?: AsyncIterable<unknown>; data?: { stream?: AsyncIterable<unknown> } })?.stream ||
        (sseResult as { data?: { stream?: AsyncIterable<unknown> } })?.data?.stream ||
        (sseResult as { data?: AsyncIterable<unknown> })?.data;

      if (!stream) {
        throw new Error(
          `Event stream not available — subscribe() returned: ${JSON.stringify(Object.keys(sseResult || {}))}`,
        );
      }

      // Send prompt asynchronously (returns immediately, events stream the progress)
      const asyncResult = await client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: prompt }],
        },
      });

      if (asyncResult.error) {
        throw new Error(`Prompt failed: ${JSON.stringify(asyncResult.error)}`);
      }

      // Process SSE events until the session goes idle or we time out
      let answer = '';
      let numTurns = 0;
      let totalTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
      let totalCost: number = 0;
      const deadline = Date.now() + timeoutMs - 5000;

      for await (const event of stream) {
        if (Date.now() > deadline) {
          options.onEvent?.({ type: 'status', message: 'Timed out waiting for agent' });
          break;
        }

        const eventType = (event as { type?: string; event?: string })?.type ?? (event as { type?: string; event?: string })?.event ?? '';

        if (eventType === 'message.part.updated') {
          const eventAny = event as { properties?: unknown; data?: unknown };
          const props = eventAny.properties || eventAny.data || {};
          if (!props) continue;
          const part = (props as { part?: unknown }).part || ({} as any);
          if (!part) continue;

          const partAny = part as { type?: string; text?: string; state?: { status?: string; input?: unknown; time?: { start?: number; end?: number }; output?: unknown }; callID?: string; callId?: string; tool?: string; tokens?: { input?: number; output?: number; cache?: { read?: number; write?: number }; total?: number }; cost?: number };
          if (partAny.type === 'text') {
            // Streaming text delta
            const delta = (props as any).delta || '';
            if (delta) {
              answer += delta;
              options.onEvent?.({ type: 'text_delta', text: delta });
            }
          } else if (partAny.type === 'tool') {
            const status = partAny.state?.status || '';
            const callID = partAny.callID || partAny.callId || '';
            const toolName: string = (partAny.tool as string) || 'unknown';
            if (!toolName) continue;

            if (status === 'running' || status === 'pending') {
              // Only add if not already tracked
              if (!toolCalls.find((t) => t.id === callID)) {
                const toolCall: ToolCall = {
                  id: callID,
                  name: toolName,
                  input: (partAny.state?.input || {}) as Record<string, unknown>,
                  timestamp: Date.now(),
                };
                toolCalls.push(toolCall);
                options.onEvent?.({ type: 'tool_start', tool: toolCall });
                options.onEvent?.({ type: 'status', message: `Tool: ${toolName}` });
              }
            } else if (status === 'completed') {
              const existing = toolCalls.find((t) => t.id === callID);
              if (existing) {
                existing.durationMs = partAny.state?.time?.end && partAny.state.time?.start
                  ? (partAny.state.time.end - partAny.state.time.start) * 1000
                  : Date.now() - existing.timestamp;
                existing.success = true;
                existing.result = partAny.state?.output
                  ? String(partAny.state.output).substring(0, 500)
                  : undefined;
              } else {
                // Tool completed without a prior start event (can happen if subscription started late)
                toolCalls.push({
                  id: callID,
                  name: toolName,
                  input: (partAny.state?.input || {}) as Record<string, unknown>,
                  timestamp: Date.now(),
                  durationMs: partAny.state?.time?.end && partAny.state.time?.start
                    ? (partAny.state.time.end - partAny.state.time.start) * 1000
                    : 0,
                  success: true,
                  result: partAny.state?.output
                    ? String(partAny.state.output).substring(0, 500)
                    : undefined,
                });
              }
              options.onEvent?.({
                type: 'tool_end',
                toolId: callID,
                success: true,
                durationMs: toolCalls.find((t) => t.id === callID)?.durationMs || 0,
              });
            } else if (status === 'error') {
              const existing = toolCalls.find((t) => t.id === callID);
              if (existing) {
                existing.success = false;
                existing.durationMs = Date.now() - existing.timestamp;
              }
              options.onEvent?.({
                type: 'tool_end',
                toolId: callID,
                success: false,
                durationMs: existing?.durationMs || 0,
              });
            }
          } else if (partAny.type === 'reasoning') {
            const text = (props as any).delta || partAny.text || '';
            if (!text) continue;
            if (text) {
              options.onEvent?.({ type: 'thinking', text });
            }
          } else if (partAny.type === 'step-finish') {
            numTurns++;
            // Accumulate per-step tokens/cost
            const partTyped = partAny as { tokens?: { input?: number; output?: number; cache?: { read?: number; write?: number }; total?: number }; cost?: number };
            if (partTyped.tokens) {
              totalTokens.input += partTyped.tokens.input || 0;
              totalTokens.output += partTyped.tokens.output || 0;
              totalTokens.cacheRead += partTyped.tokens.cache?.read || 0;
              totalTokens.cacheWrite += partTyped.tokens.cache?.write || 0;
              totalTokens.total += partTyped.tokens.total || 0;
            }
            if (partTyped.cost) {
              totalCost += partTyped.cost;
            }
          }
        } else if (eventType === 'message.updated') {
          // A full message update — extract final info from here
          const eventAny = event as { properties?: unknown; data?: unknown };
          const props = (eventAny.properties || eventAny.data) as { parts?: unknown[] } & Record<string, unknown>;
          const info = props as { providerID?: string; modelID?: string; tokens?: { input?: number; output?: number; cache?: { read?: number; write?: number }; total?: number }; cost?: number } | undefined;
          if (info?.providerID && info?.modelID) {
            model = `${info.providerID}/${info.modelID}`;
          }
          // Use message-level tokens as authoritative total if available
          if (info?.tokens?.total) {
            totalTokens = {
              input: info.tokens.input || totalTokens.input,
              output: info.tokens.output || totalTokens.output,
              cacheRead: info.tokens.cache?.read || totalTokens.cacheRead,
              cacheWrite: info.tokens.cache?.write || totalTokens.cacheWrite,
              total: info.tokens.total,
            };
          }
          if (info?.cost !== undefined) {
            totalCost = info.cost;
          }
          // Extract final answer text from message parts if we haven't captured it via deltas
if (props && (props as { parts?: unknown[] } & Record<string, unknown> & { parts?: unknown[] }).parts) {
          if (props && (props as { parts?: unknown[] } & Record<string, unknown>).parts) {
              if ((p as { type?: string; text?: string }).type === 'text' && (p as { type?: string; text?: string }).text) {
                answer += (p as { type?: string; text?: string }).text;
              }
            }
          }
        } else if (eventType === 'session.status') {
          const eventAny = event as { properties?: unknown; data?: unknown };
          const props = (eventAny.properties || eventAny.data) as { parts?: unknown[] } & Record<string, unknown>;
          const status = props as { type?: string; attempt?: number; message?: string } | undefined;
          if (status?.type === 'idle') {
            // Agent finished processing
            options.onEvent?.({ type: 'status', message: 'Session idle — agent finished' });
            break;
          } else if (status?.type === 'busy') {
            options.onEvent?.({ type: 'status', message: 'Agent working...' });
          } else if (status?.type === 'retry') {
            options.onEvent?.({
              type: 'status',
              message: `Retrying (attempt ${status.attempt}): ${status.message}`,
            });
          }
        } else if (eventType === 'session.error') {
          const eventAny = event as { properties?: unknown; data?: unknown };
          const props = (eventAny.properties || eventAny.data) as { parts?: unknown[] } & Record<string, unknown>;
          const errMsg = (props as { error?: { message?: string } | undefined })?.error?.message || JSON.stringify(props) || 'Unknown error';
          options.onEvent?.({ type: 'error', message: errMsg, code: 'SESSION_ERROR' });
        }
      }

      // If answer is still empty, fetch the final messages from the session
      if (!answer) {
        const messagesResult = await client.session.messages({
          path: { id: sessionId },
        });
        if (messagesResult.data) {
          const messages = messagesResult.data as { role?: string; parts?: unknown[] }[];
          // Find the last assistant message
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i] as { role?: string; parts?: unknown[] };
            if ((msg as any).role === 'assistant' && msg.parts) {
              for (const p of msg.parts) {
                if ((p as { type?: string; text?: string }).type === 'text' && (p as { type?: string; text?: string }).text) {
                  answer += (p as { type?: string; text?: string }).text;
                }
              }
              break;
            }
          }
        }
      }

      const result: AgentResult = {
        answer,
        success: true,
        timedOut: Date.now() > deadline,
        durationMs: Date.now() - runStartTime,
        tokens: {
          inputTokens: totalTokens.input,
          outputTokens: totalTokens.output,
          cacheReadTokens: totalTokens.cacheRead,
          cacheWriteTokens: totalTokens.cacheWrite,
          totalTokens: totalTokens.total,
        },
        costUsd: totalCost,
        numTurns: numTurns || 1,
        toolCalls,
        toolsUsed: [...new Set(toolCalls.map((t) => t.name))],
        model,
        raw: { sessionId },
      };

      options.onEvent?.({ type: 'complete', result });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      options.onEvent?.({ type: 'error', message: errorMessage, code: 'ERROR' });

      const errorResult = emptyAgentResult(errorMessage);
      errorResult.durationMs = Date.now() - runStartTime;
      errorResult.toolCalls = toolCalls;
      errorResult.toolsUsed = [...new Set(toolCalls.map((t) => t.name))];
      errorResult.model = model;

      options.onEvent?.({ type: 'complete', result: errorResult });
      return errorResult;
    } finally {
      _serverProc?.kill();
    }
  }
}

export function createOpencodeAgent(cliPath?: string): OpencodeAgent {
  return new OpencodeAgent(cliPath);
}
