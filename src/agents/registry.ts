/**
 * Agent registry
 *
 * Manages available agent wrappers and provides discovery.
 */

import { AgentWrapper, AgentRegistry } from './types';
import { createClaudeCodeAgent } from './claude-code';

/**
 * Default agent registry implementation
 */
class DefaultAgentRegistry implements AgentRegistry {
  private agents: Map<string, AgentWrapper> = new Map();

  constructor() {
    // Register built-in agents
    this.register(createClaudeCodeAgent());
  }

  get(name: string): AgentWrapper | undefined {
    return this.agents.get(name);
  }

  list(): AgentWrapper[] {
    return Array.from(this.agents.values());
  }

  register(agent: AgentWrapper): void {
    this.agents.set(agent.name, agent);
  }

  async findAvailable(): Promise<AgentWrapper[]> {
    const available: AgentWrapper[] = [];

    for (const agent of this.agents.values()) {
      if (await agent.isAvailable()) {
        available.push(agent);
      }
    }

    return available;
  }
}

// Singleton instance
let registryInstance: AgentRegistry | null = null;

/**
 * Get the global agent registry
 */
export function getAgentRegistry(): AgentRegistry {
  if (!registryInstance) {
    registryInstance = new DefaultAgentRegistry();
  }
  return registryInstance;
}

/**
 * Get an agent by name, throwing if not found
 */
export function getAgent(name: string): AgentWrapper {
  const registry = getAgentRegistry();
  const agent = registry.get(name);

  if (!agent) {
    const available = registry.list().map((a) => a.name).join(', ');
    throw new Error(`Unknown agent: ${name}. Available: ${available}`);
  }

  return agent;
}

/**
 * Check if a specific agent is available
 */
export async function isAgentAvailable(name: string): Promise<boolean> {
  const registry = getAgentRegistry();
  const agent = registry.get(name);

  if (!agent) {
    return false;
  }

  return agent.isAvailable();
}
