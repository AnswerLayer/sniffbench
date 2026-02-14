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
let _createOpencodeClient: any;
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
  config: Record<string, any>,
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
  private config: Record<string, any>;

  constructor(cliPath: string = 'opencode', config?: Record<string, any>) {
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
    const toolStartTimes: Map<string, number> = new Map();
    let model = 'unknown';
    let sessionId = '';
    let serverProc: ChildProcess | null = null;

    try {
      // Spawn server in the case's working directory
      const cwd = options.cwd || process.cwd();
      const { url, proc } = await spawnServer(cwd, this.config, 15000);
      serverProc = proc;

      const createClient = await loadSDK();
      const client = createClient({ baseUrl: url });

      const createResult = await client.session.create({});
      if (createResult.error) {
        throw new Error(`Failed to create session: ${JSON.stringify(createResult.error)}`);
      }

      const session = createResult.data;
      sessionId = session.id;
      model = options.model || session.version || 'unknown';

      options.onEvent?.({ type: 'start', timestamp: runStartTime, model });

      const promptResult = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: prompt }],
        },
        signal: AbortSignal.timeout(timeoutMs - 5000),
      });

      if (promptResult.error) {
        throw new Error(`Prompt failed: ${JSON.stringify(promptResult.error)}`);
      }

      const response = promptResult.data as { info?: any; parts?: any[] } | undefined;
      if (!response?.info || !response?.parts) {
        throw new Error(
          `Unexpected response structure: ${JSON.stringify({
            hasResponse: !!response,
            keys: response ? Object.keys(response) : null,
          })}`,
        );
      }

      // Process parts — extract answer text and track tool calls
      let answer = '';
      for (const part of response.parts) {
        if (part.type === 'text') {
          const text = (part as { text?: string }).text || '';
          answer += text;
          if (text) {
            options.onEvent?.({ type: 'text_delta', text });
          }
        } else if (part.type === 'tool') {
          const toolPart = part as {
            tool: string;
            callID: string;
            state?: { status?: string };
          };
          const status = toolPart.state?.status;

          if (status === 'pending') {
            const toolCall: ToolCall = {
              id: toolPart.callID,
              name: toolPart.tool,
              input: {},
              timestamp: Date.now(),
            };
            toolCalls.push(toolCall);
            toolStartTimes.set(toolPart.callID, Date.now());
            options.onEvent?.({ type: 'tool_start', tool: toolCall });
          } else if (status === 'completed') {
            const toolId = toolPart.callID;
            const toolStart = toolStartTimes.get(toolId);
            const durationMs = toolStart ? Date.now() - toolStart : 0;
            const toolCall = toolCalls.find((t) => t.id === toolId);
            if (toolCall) {
              toolCall.durationMs = durationMs;
              toolCall.success = true;
            }
            options.onEvent?.({ type: 'tool_end', toolId, success: true, durationMs });
          }
        }
      }

      const info = response.info || {};
      const tokens = {
        inputTokens: info.tokens?.input || 0,
        outputTokens: info.tokens?.output || 0,
        cacheReadTokens: info.tokens?.cache?.read || 0,
        cacheWriteTokens: info.tokens?.cache?.write || 0,
        totalTokens: info.tokens?.total || 0,
      };

      if (info.providerID && info.modelID) {
        model = `${info.providerID}/${info.modelID}`;
      }

      const result: AgentResult = {
        answer,
        success: true,
        timedOut: false,
        durationMs: Date.now() - runStartTime,
        tokens,
        costUsd: info.cost || 0,
        numTurns: 1,
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
      serverProc?.kill();
    }
  }
}

export function createOpencodeAgent(cliPath?: string): OpencodeAgent {
  return new OpencodeAgent(cliPath);
}
