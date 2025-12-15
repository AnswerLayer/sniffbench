/**
 * Environment variable utilities for sniffbench
 *
 * Handles loading env vars from .sniffbench/.env files
 */

import * as fs from 'fs';
import * as path from 'path';

const ENV_FILE_NAME = '.env';
const SNIFFBENCH_DIR = '.sniffbench';

/**
 * Parse a .env file content into key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=value format
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }
  }

  return result;
}

/**
 * Get the path to the .sniffbench/.env file
 */
export function getEnvFilePath(projectRoot: string): string {
  return path.join(projectRoot, SNIFFBENCH_DIR, ENV_FILE_NAME);
}

/**
 * Load environment variables from .sniffbench/.env
 * Returns empty object if file doesn't exist
 */
export function loadEnvFile(projectRoot: string): Record<string, string> {
  const envPath = getEnvFilePath(projectRoot);

  if (!fs.existsSync(envPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    return parseEnvFile(content);
  } catch {
    return {};
  }
}

/**
 * Get an environment variable, checking .sniffbench/.env first, then process.env
 */
export function getEnvVar(key: string, projectRoot: string): string | undefined {
  // First check process.env (explicit shell exports take priority)
  if (process.env[key]) {
    return process.env[key];
  }

  // Then check .sniffbench/.env
  const fileEnv = loadEnvFile(projectRoot);
  return fileEnv[key];
}

/**
 * Get multiple environment variables, merging .sniffbench/.env with process.env
 * Process.env takes priority over file values
 */
export function getEnvVars(keys: string[], projectRoot: string): Record<string, string> {
  const fileEnv = loadEnvFile(projectRoot);
  const result: Record<string, string> = {};

  for (const key of keys) {
    // Process.env takes priority
    const value = process.env[key] || fileEnv[key];
    if (value) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Check which required env vars are missing (not in process.env or .sniffbench/.env)
 */
export function checkMissingEnvVars(keys: string[], projectRoot: string): {
  missing: string[];
  present: string[];
  sources: Record<string, 'env' | 'file'>;
} {
  const fileEnv = loadEnvFile(projectRoot);
  const missing: string[] = [];
  const present: string[] = [];
  const sources: Record<string, 'env' | 'file'> = {};

  for (const key of keys) {
    if (process.env[key]) {
      present.push(key);
      sources[key] = 'env';
    } else if (fileEnv[key]) {
      present.push(key);
      sources[key] = 'file';
    } else {
      missing.push(key);
    }
  }

  return { missing, present, sources };
}

/**
 * Ensure .sniffbench/.env is in .gitignore
 */
export function ensureEnvGitignored(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const envPattern = '.sniffbench/.env';

  let content = '';
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf-8');

    // Check if already ignored
    if (content.includes(envPattern)) {
      return;
    }
  }

  // Append to .gitignore
  const addition = content.endsWith('\n') || content === ''
    ? `${envPattern}\n`
    : `\n${envPattern}\n`;

  fs.writeFileSync(gitignorePath, content + addition);
}
