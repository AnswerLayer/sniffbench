/**
 * Agent configuration capture
 *
 * Captures agent version, model, CLAUDE.md hash, MCP servers,
 * tool allowlists, and other Claude Code configuration at run time.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { AgentConfig, McpServerConfig, FullMcpServerConfig } from './types';
import type { SandboxableSnapshot } from '../variants/types';
import { AgentWrapper } from '../agents/types';

/** Claude Code main config file location */
const CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');

/** Claude Code user settings location */
const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

/**
 * Compute SHA256 hash of a string
 */
function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Find CLAUDE.md file in the project
 * Searches in order:
 *   1. .claude/CLAUDE.md (standard Claude Code location)
 *   2. CLAUDE.md (repo root)
 * Returns the file path if found, null otherwise
 */
export function findClaudeMd(projectRoot: string): string | null {
  const locations = [
    path.join(projectRoot, '.claude', 'CLAUDE.md'),
    path.join(projectRoot, 'CLAUDE.md'),
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }

  return null;
}

/**
 * Compute hash of CLAUDE.md content
 * Returns undefined if file not found
 */
export function hashClaudeMd(projectRoot: string): string | undefined {
  const claudeMdPath = findClaudeMd(projectRoot);
  if (!claudeMdPath) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    return sha256(content);
  } catch {
    return undefined;
  }
}

/**
 * Read and parse a JSON file safely
 * Returns null if file doesn't exist or is invalid
 */
function readJsonFile(filePath: string): unknown | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Read Claude Code main config (~/.claude.json)
 */
export function readClaudeConfig(): Record<string, unknown> | null {
  return readJsonFile(CLAUDE_CONFIG_PATH) as Record<string, unknown> | null;
}

/**
 * Read Claude Code user settings (~/.claude/settings.json)
 */
export function readClaudeSettings(): Record<string, unknown> | null {
  return readJsonFile(CLAUDE_SETTINGS_PATH) as Record<string, unknown> | null;
}

/**
 * Read project-level Claude settings (.claude/settings.json)
 */
export function readProjectSettings(projectRoot: string): Record<string, unknown> | null {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  return readJsonFile(settingsPath) as Record<string, unknown> | null;
}

/**
 * Read project-level MCP config (.mcp.json)
 */
export function readProjectMcpConfig(projectRoot: string): Record<string, unknown> | null {
  const mcpPath = path.join(projectRoot, '.mcp.json');
  return readJsonFile(mcpPath) as Record<string, unknown> | null;
}

/**
 * Extract MCP servers from Claude Code config for a specific project
 */
export function extractMcpServers(
  projectRoot: string
): Record<string, McpServerConfig> | undefined {
  const claudeConfig = readClaudeConfig();
  if (!claudeConfig) {
    return undefined;
  }

  // Get project-specific config
  const projects = claudeConfig.projects as Record<string, Record<string, unknown>> | undefined;
  if (!projects) {
    return undefined;
  }

  const projectConfig = projects[projectRoot];
  if (!projectConfig) {
    return undefined;
  }

  const mcpServers = projectConfig.mcpServers as Record<string, Record<string, unknown>> | undefined;
  if (!mcpServers || Object.keys(mcpServers).length === 0) {
    return undefined;
  }

  // Get disabled servers list
  const disabledServers = (projectConfig.disabledMcpjsonServers as string[]) || [];

  // Extract minimal server info (no secrets)
  const result: Record<string, McpServerConfig> = {};
  for (const [name, server] of Object.entries(mcpServers)) {
    const serverType = server.type as string | undefined;
    result[name] = {
      type: (serverType === 'sse' || serverType === 'http') ? serverType : 'stdio',
      enabled: !disabledServers.includes(name),
    };
  }

  // Also check project-level .mcp.json
  const projectMcp = readProjectMcpConfig(projectRoot);
  if (projectMcp && projectMcp.mcpServers) {
    const projectServers = projectMcp.mcpServers as Record<string, Record<string, unknown>>;
    for (const [name, server] of Object.entries(projectServers)) {
      if (!result[name]) {
        const serverType = server.type as string | undefined;
        result[name] = {
          type: (serverType === 'sse' || serverType === 'http') ? serverType : 'stdio',
          enabled: true,
        };
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Extract tool allowlists from Claude Code config
 */
export function extractToolAllowlists(
  projectRoot: string
): { allowedTools?: string[]; disallowedTools?: string[] } {
  const claudeConfig = readClaudeConfig();
  if (!claudeConfig) {
    return {};
  }

  const projects = claudeConfig.projects as Record<string, Record<string, unknown>> | undefined;
  if (!projects) {
    return {};
  }

  const projectConfig = projects[projectRoot];
  if (!projectConfig) {
    return {};
  }

  const result: { allowedTools?: string[]; disallowedTools?: string[] } = {};

  const allowedTools = projectConfig.allowedTools as string[] | undefined;
  if (allowedTools && allowedTools.length > 0) {
    result.allowedTools = allowedTools;
  }

  const disallowedTools = projectConfig.disallowedTools as string[] | undefined;
  if (disallowedTools && disallowedTools.length > 0) {
    result.disallowedTools = disallowedTools;
  }

  return result;
}

/**
 * Get permission mode from project settings
 */
export function getPermissionMode(projectRoot: string): string | undefined {
  // Check project settings first
  const projectSettings = readProjectSettings(projectRoot);
  if (projectSettings?.permissionMode) {
    return projectSettings.permissionMode as string;
  }

  // Fall back to user settings
  const userSettings = readClaudeSettings();
  if (userSettings?.permissionMode) {
    return userSettings.permissionMode as string;
  }

  return undefined;
}

/**
 * Get thinking mode status from user settings
 */
export function getThinkingEnabled(): boolean | undefined {
  const settings = readClaudeSettings();
  if (settings?.alwaysThinkingEnabled !== undefined) {
    return settings.alwaysThinkingEnabled as boolean;
  }
  return undefined;
}

/**
 * Capture agent configuration at run time
 *
 * @param agent - The agent wrapper instance
 * @param model - Model used (from AgentResult after first run, or default)
 * @param projectRoot - Project root for finding CLAUDE.md
 */
export async function captureAgentConfig(
  agent: AgentWrapper,
  model: string,
  projectRoot: string
): Promise<AgentConfig> {
  // Get version from agent
  const version = await agent.getVersion();

  // Hash CLAUDE.md
  const claudeMdHash = hashClaudeMd(projectRoot);

  return {
    name: agent.name,
    version,
    model,
    claudeMdHash,
  };
}

/**
 * Create a partial agent config (before model is known)
 * Model can be updated after first case completes
 * Includes full ambient capture of MCP servers, tools, etc.
 */
export async function capturePartialAgentConfig(
  agent: AgentWrapper,
  projectRoot: string
): Promise<AgentConfig> {
  const version = await agent.getVersion();
  const claudeMdHash = hashClaudeMd(projectRoot);

  // Capture ambient configuration
  const mcpServers = extractMcpServers(projectRoot);
  const { allowedTools, disallowedTools } = extractToolAllowlists(projectRoot);
  const permissionMode = getPermissionMode(projectRoot);
  const thinkingEnabled = getThinkingEnabled();

  return {
    name: agent.name,
    version,
    model: 'unknown', // Will be updated after first case
    claudeMdHash,
    mcpServers,
    allowedTools,
    disallowedTools,
    permissionMode,
    thinkingEnabled,
  };
}

/**
 * Format agent config for display
 */
export function formatAgentConfig(config: AgentConfig): string {
  const parts = [
    `Agent: ${config.name}`,
    config.version ? `Version: ${config.version}` : 'Version: unknown',
    `Model: ${config.model}`,
  ];

  if (config.claudeMdHash) {
    parts.push(`CLAUDE.md: ${config.claudeMdHash.substring(0, 8)}...`);
  }

  // Phase 2: Enhanced ambient capture display
  if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
    const serverList = Object.entries(config.mcpServers)
      .map(([name, s]) => `${name}(${s.type}${s.enabled ? '' : ',disabled'})`)
      .join(', ');
    parts.push(`MCP Servers: ${serverList}`);
  }

  if (config.allowedTools && config.allowedTools.length > 0) {
    parts.push(`Allowed Tools: ${config.allowedTools.length} configured`);
  }

  if (config.disallowedTools && config.disallowedTools.length > 0) {
    parts.push(`Disallowed Tools: ${config.disallowedTools.length} configured`);
  }

  if (config.permissionMode) {
    parts.push(`Permission Mode: ${config.permissionMode}`);
  }

  if (config.thinkingEnabled !== undefined) {
    parts.push(`Thinking: ${config.thinkingEnabled ? 'enabled' : 'disabled'}`);
  }

  if (config.variantId) {
    parts.push(`Variant: ${config.variantId}`);
  }

  return parts.join('\n');
}

/**
 * Compare two agent configs and return differences
 */
export function diffAgentConfig(
  config1: AgentConfig,
  config2: AgentConfig
): { field: string; old: string; new: string }[] {
  const diffs: { field: string; old: string; new: string }[] = [];

  if (config1.name !== config2.name) {
    diffs.push({ field: 'Agent', old: config1.name, new: config2.name });
  }

  if (config1.version !== config2.version) {
    diffs.push({
      field: 'Version',
      old: config1.version || 'unknown',
      new: config2.version || 'unknown',
    });
  }

  if (config1.model !== config2.model) {
    diffs.push({ field: 'Model', old: config1.model, new: config2.model });
  }

  if (config1.claudeMdHash !== config2.claudeMdHash) {
    diffs.push({
      field: 'CLAUDE.md',
      old: config1.claudeMdHash?.substring(0, 8) || 'none',
      new: config2.claudeMdHash?.substring(0, 8) || 'none',
    });
  }

  // Phase 2: Enhanced ambient capture diffs

  // MCP Servers diff
  const servers1 = config1.mcpServers || {};
  const servers2 = config2.mcpServers || {};
  const allServerNames = new Set([...Object.keys(servers1), ...Object.keys(servers2)]);

  for (const name of allServerNames) {
    const s1 = servers1[name];
    const s2 = servers2[name];

    if (!s1 && s2) {
      diffs.push({ field: `MCP: ${name}`, old: 'none', new: `${s2.type}${s2.enabled ? '' : ' (disabled)'}` });
    } else if (s1 && !s2) {
      diffs.push({ field: `MCP: ${name}`, old: `${s1.type}${s1.enabled ? '' : ' (disabled)'}`, new: 'removed' });
    } else if (s1 && s2 && (s1.type !== s2.type || s1.enabled !== s2.enabled)) {
      diffs.push({
        field: `MCP: ${name}`,
        old: `${s1.type}${s1.enabled ? '' : ' (disabled)'}`,
        new: `${s2.type}${s2.enabled ? '' : ' (disabled)'}`,
      });
    }
  }

  // Allowed tools diff
  const allowed1 = (config1.allowedTools || []).sort().join(',');
  const allowed2 = (config2.allowedTools || []).sort().join(',');
  if (allowed1 !== allowed2) {
    const count1 = config1.allowedTools?.length || 0;
    const count2 = config2.allowedTools?.length || 0;
    diffs.push({
      field: 'Allowed Tools',
      old: count1 > 0 ? `${count1} tools` : 'none',
      new: count2 > 0 ? `${count2} tools` : 'none',
    });
  }

  // Disallowed tools diff
  const disallowed1 = (config1.disallowedTools || []).sort().join(',');
  const disallowed2 = (config2.disallowedTools || []).sort().join(',');
  if (disallowed1 !== disallowed2) {
    const count1 = config1.disallowedTools?.length || 0;
    const count2 = config2.disallowedTools?.length || 0;
    diffs.push({
      field: 'Disallowed Tools',
      old: count1 > 0 ? `${count1} tools` : 'none',
      new: count2 > 0 ? `${count2} tools` : 'none',
    });
  }

  // Permission mode diff
  if (config1.permissionMode !== config2.permissionMode) {
    diffs.push({
      field: 'Permission Mode',
      old: config1.permissionMode || 'default',
      new: config2.permissionMode || 'default',
    });
  }

  // Thinking enabled diff
  if (config1.thinkingEnabled !== config2.thinkingEnabled) {
    diffs.push({
      field: 'Thinking',
      old: config1.thinkingEnabled === undefined ? 'default' : config1.thinkingEnabled ? 'enabled' : 'disabled',
      new: config2.thinkingEnabled === undefined ? 'default' : config2.thinkingEnabled ? 'enabled' : 'disabled',
    });
  }

  // Variant ID diff
  if (config1.variantId !== config2.variantId) {
    diffs.push({
      field: 'Variant',
      old: config1.variantId || 'none',
      new: config2.variantId || 'none',
    });
  }

  return diffs;
}

/**
 * Read CLAUDE.md content for container building
 */
export function readClaudeMdContent(projectRoot: string): string | undefined {
  const claudeMdPath = findClaudeMd(projectRoot);
  if (!claudeMdPath) {
    return undefined;
  }

  try {
    return fs.readFileSync(claudeMdPath, 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Extract full MCP server configurations for container building
 * Includes command, args, url, and npm package information
 */
export function extractFullMcpServers(
  projectRoot: string
): Record<string, FullMcpServerConfig> | undefined {
  const claudeConfig = readClaudeConfig();
  if (!claudeConfig) {
    return undefined;
  }

  // Get project-specific config
  const projects = claudeConfig.projects as Record<string, Record<string, unknown>> | undefined;
  if (!projects) {
    return undefined;
  }

  const projectConfig = projects[projectRoot];
  if (!projectConfig) {
    return undefined;
  }

  const mcpServers = projectConfig.mcpServers as Record<string, Record<string, unknown>> | undefined;
  if (!mcpServers || Object.keys(mcpServers).length === 0) {
    return undefined;
  }

  // Extract full server info
  const result: Record<string, FullMcpServerConfig> = {};
  for (const [name, server] of Object.entries(mcpServers)) {
    const serverType = server.type as string | undefined;
    const type = (serverType === 'sse' || serverType === 'http') ? serverType : 'stdio';

    const config: FullMcpServerConfig = { type };

    if (type === 'stdio') {
      config.command = server.command as string | undefined;
      config.args = server.args as string[] | undefined;

      // Try to infer npm package from command
      const command = config.command;
      if (command) {
        config.npmPackage = inferNpmPackage(command);
      }
    } else {
      config.url = server.url as string | undefined;

      // Extract headers, converting values to env var names
      const headers = server.headers as Record<string, string> | undefined;
      if (headers) {
        config.headers = {};
        const requiredEnvVars: string[] = [];

        for (const [key, value] of Object.entries(headers)) {
          // If value looks like it references an env var, extract it
          if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
            const envVar = value.slice(2, -1);
            config.headers[key] = `$${envVar}`;
            requiredEnvVars.push(envVar);
          } else {
            config.headers[key] = value;
          }
        }

        if (requiredEnvVars.length > 0) {
          config.requiredEnvVars = requiredEnvVars;
        }
      }
    }

    result[name] = config;
  }

  // Also check project-level .mcp.json
  const projectMcp = readProjectMcpConfig(projectRoot);
  if (projectMcp && projectMcp.mcpServers) {
    const projectServers = projectMcp.mcpServers as Record<string, Record<string, unknown>>;
    for (const [name, server] of Object.entries(projectServers)) {
      if (!result[name]) {
        const serverType = server.type as string | undefined;
        const type = (serverType === 'sse' || serverType === 'http') ? serverType : 'stdio';

        const config: FullMcpServerConfig = { type };

        if (type === 'stdio') {
          config.command = server.command as string | undefined;
          config.args = server.args as string[] | undefined;

          if (config.command) {
            config.npmPackage = inferNpmPackage(config.command);
          }
        } else {
          config.url = server.url as string | undefined;
        }

        result[name] = config;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Infer npm package name from MCP server command
 */
function inferNpmPackage(command: string): string | undefined {
  // Common patterns:
  // - "npx @anthropic-ai/mcp-server-linear" -> "@anthropic-ai/mcp-server-linear"
  // - "node node_modules/@package/bin.js" -> "@package"
  // - "mcp-server-name" -> might be a global package

  if (command.includes('npx ')) {
    const match = command.match(/npx\s+(@?[\w-]+(?:\/[\w-]+)?)/);
    if (match) {
      return match[1];
    }
  }

  // Check for node_modules path
  if (command.includes('node_modules/')) {
    const match = command.match(/node_modules\/(@?[\w-]+(?:\/[\w-]+)?)/);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Capture sandboxable snapshot for container building
 * Includes full MCP config and CLAUDE.md content
 */
export async function captureSandboxableSnapshot(
  agent: AgentWrapper,
  projectRoot: string
): Promise<SandboxableSnapshot> {
  // Get base config
  const baseConfig = await capturePartialAgentConfig(agent, projectRoot);

  // Add full MCP servers and CLAUDE.md content
  const mcpServersFull = extractFullMcpServers(projectRoot);
  const claudeMdContent = readClaudeMdContent(projectRoot);

  return {
    ...baseConfig,
    mcpServersFull,
    claudeMdContent,
  };
}
