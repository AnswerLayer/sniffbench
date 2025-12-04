/**
 * Sandbox types and interfaces
 *
 * Designed with a pluggable backend architecture in mind.
 * Currently only Docker is implemented, but the interface
 * supports future backends (microVMs, cloud sandboxes, etc.)
 */

export type SandboxBackend = 'docker' | 'podman';

export interface SandboxConfig {
  /** Working directory to mount into the sandbox */
  workdir: string;

  /** Docker image to use (default: sniffbench/node:20) */
  image?: string;

  /** Memory limit in MB (default: 512) */
  memoryMB?: number;

  /** CPU limit as decimal (default: 1.0 = 1 CPU) */
  cpuLimit?: number;

  /** Timeout in seconds (default: 300 = 5 minutes) */
  timeoutSeconds?: number;

  /** Enable network access (default: false for security) */
  networkEnabled?: boolean;

  /** Environment variables to set */
  env?: Record<string, string>;

  /** Additional volumes to mount (readonly by default) */
  volumes?: Array<{
    hostPath: string;
    containerPath: string;
    readonly?: boolean;
  }>;
}

export interface ExecutionResult {
  /** Exit code from the command (0 = success) */
  exitCode: number;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Execution time in milliseconds */
  durationMs: number;

  /** Whether the command timed out */
  timedOut: boolean;

  /** Whether the command was killed (OOM, etc.) */
  killed: boolean;
}

export interface Sandbox {
  /** Unique identifier for this sandbox */
  id: string;

  /** Current status */
  status: 'creating' | 'running' | 'stopped' | 'destroyed';

  /** Configuration used to create this sandbox */
  config: SandboxConfig;

  /** Execute a command in the sandbox */
  exec(command: string, options?: ExecOptions): Promise<ExecutionResult>;

  /** Copy files into the sandbox */
  copyIn(hostPath: string, containerPath: string): Promise<void>;

  /** Copy files out of the sandbox */
  copyOut(containerPath: string, hostPath: string): Promise<void>;

  /** Stop the sandbox (can be restarted) */
  stop(): Promise<void>;

  /** Destroy the sandbox (cannot be restarted) */
  destroy(): Promise<void>;
}

export interface ExecOptions {
  /** Working directory for the command */
  cwd?: string;

  /** Additional environment variables */
  env?: Record<string, string>;

  /** Timeout override for this command (in seconds) */
  timeoutSeconds?: number;

  /** Stream stdout/stderr in real-time */
  stream?: boolean;

  /** Callback for streaming output */
  onOutput?: (type: 'stdout' | 'stderr', data: string) => void;
}

export interface SandboxManager {
  /** Check if the backend is available and configured */
  isAvailable(): Promise<boolean>;

  /** Get detailed availability status with helpful messages */
  checkAvailability(): Promise<AvailabilityStatus>;

  /** Create a new sandbox */
  create(config: SandboxConfig): Promise<Sandbox>;

  /** List all active sandboxes */
  list(): Promise<Sandbox[]>;

  /** Clean up all sandboxes (useful for cleanup on exit) */
  destroyAll(): Promise<void>;
}

export interface AvailabilityStatus {
  available: boolean;
  backend: SandboxBackend;
  version?: string;
  error?: string;
  suggestion?: string;
}
