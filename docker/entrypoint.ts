/**
 * SDK-based entrypoint for variant containers
 *
 * This script runs inside Docker containers and uses the Claude Agent SDK
 * to execute prompts. It outputs SDK messages as JSON lines for the host
 * to parse, providing consistent streaming with local execution.
 */

import { query, Options } from '@anthropic-ai/claude-agent-sdk';

const prompt = process.argv[2];

if (!prompt) {
  console.error(JSON.stringify({ type: 'error', message: 'No prompt provided' }));
  process.exit(1);
}

const options: Options = {
  cwd: '/workspace',
  // Container is already sandboxed - bypass permission prompts
  permissionMode: 'bypassPermissions',
  // Use project settings baked into the container
  settingSources: ['project'],
  // Enable partial messages for streaming
  includePartialMessages: true,
};

async function run() {
  try {
    for await (const message of query({ prompt, options })) {
      // Output each message as JSON line for host to parse
      // This matches the SDK message format that claude-code.ts expects
      console.log(JSON.stringify(message));
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ type: 'error', message: errorMessage }));
    process.exit(1);
  }
}

run();
