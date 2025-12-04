/**
 * Docker sandbox backend
 *
 * Provides isolated container environments for running evaluations.
 * Focuses on security defaults and helpful error messages.
 */

import Docker from 'dockerode';
import { PassThrough } from 'stream';
import {
  SandboxConfig,
  SandboxManager,
  Sandbox,
  ExecutionResult,
  ExecOptions,
  AvailabilityStatus,
} from './types';

// Default configuration values
const DEFAULTS = {
  image: 'node:20-slim',
  memoryMB: 512,
  cpuLimit: 1.0,
  timeoutSeconds: 300,
  networkEnabled: false,
};

/**
 * Docker-based sandbox manager
 */
export class DockerSandboxManager implements SandboxManager {
  private docker: Docker;
  private activeSandboxes: Map<string, DockerSandbox> = new Map();

  constructor(options?: Docker.DockerOptions) {
    this.docker = new Docker(options);
  }

  async isAvailable(): Promise<boolean> {
    const status = await this.checkAvailability();
    return status.available;
  }

  async checkAvailability(): Promise<AvailabilityStatus> {
    try {
      const info = await this.docker.info();
      const version = await this.docker.version();

      return {
        available: true,
        backend: 'docker',
        version: version.Version,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;

      // Provide helpful suggestions based on the error
      if (err.code === 'ENOENT' || err.message?.includes('ENOENT')) {
        return {
          available: false,
          backend: 'docker',
          error: 'Docker is not installed',
          suggestion: this.getInstallSuggestion(),
        };
      }

      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        return {
          available: false,
          backend: 'docker',
          error: 'Docker is installed but not running',
          suggestion: this.getStartSuggestion(),
        };
      }

      if (err.code === 'EACCES' || err.message?.includes('permission denied')) {
        return {
          available: false,
          backend: 'docker',
          error: 'Permission denied accessing Docker',
          suggestion:
            'Try running with sudo, or add your user to the docker group:\n' +
            '  sudo usermod -aG docker $USER\n' +
            '  (then log out and back in)',
        };
      }

      return {
        available: false,
        backend: 'docker',
        error: err.message || 'Unknown error connecting to Docker',
        suggestion: 'Check that Docker is installed and running correctly.',
      };
    }
  }

  private getInstallSuggestion(): string {
    const platform = process.platform;

    if (platform === 'darwin') {
      return (
        'Install Docker Desktop for Mac:\n' +
        '  brew install --cask docker\n' +
        '  or download from https://docker.com/products/docker-desktop'
      );
    }

    if (platform === 'win32') {
      return (
        'Install Docker Desktop for Windows:\n' +
        '  winget install Docker.DockerDesktop\n' +
        '  or download from https://docker.com/products/docker-desktop'
      );
    }

    // Linux
    return (
      'Install Docker:\n' +
      '  curl -fsSL https://get.docker.com | sh\n' +
      '  sudo systemctl start docker\n' +
      '  sudo usermod -aG docker $USER'
    );
  }

  private getStartSuggestion(): string {
    const platform = process.platform;

    if (platform === 'darwin' || platform === 'win32') {
      return 'Start Docker Desktop from your Applications folder or system tray.';
    }

    return (
      'Start the Docker daemon:\n' +
      '  sudo systemctl start docker\n' +
      '  # Or for rootless Docker:\n' +
      '  systemctl --user start docker'
    );
  }

  async create(config: SandboxConfig): Promise<Sandbox> {
    // Check availability first
    const status = await this.checkAvailability();
    if (!status.available) {
      throw new DockerNotAvailableError(status.error!, status.suggestion);
    }

    const sandbox = new DockerSandbox(this.docker, config);
    await sandbox.initialize();

    this.activeSandboxes.set(sandbox.id, sandbox);
    return sandbox;
  }

  async list(): Promise<Sandbox[]> {
    return Array.from(this.activeSandboxes.values());
  }

  async destroyAll(): Promise<void> {
    const destroyPromises = Array.from(this.activeSandboxes.values()).map((sandbox) =>
      sandbox.destroy().catch(() => {
        // Ignore errors during cleanup
      })
    );
    await Promise.all(destroyPromises);
    this.activeSandboxes.clear();
  }
}

/**
 * Individual Docker sandbox instance
 */
class DockerSandbox implements Sandbox {
  id: string;
  status: 'creating' | 'running' | 'stopped' | 'destroyed' = 'creating';
  config: SandboxConfig;

  private docker: Docker;
  private container: Docker.Container | null = null;
  private resolvedConfig: Required<
    Pick<SandboxConfig, 'image' | 'memoryMB' | 'cpuLimit' | 'timeoutSeconds' | 'networkEnabled'>
  > &
    SandboxConfig;

  constructor(docker: Docker, config: SandboxConfig) {
    this.docker = docker;
    this.config = config;
    this.id = `sniff-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Merge with defaults
    this.resolvedConfig = {
      ...config,
      image: config.image || DEFAULTS.image,
      memoryMB: config.memoryMB || DEFAULTS.memoryMB,
      cpuLimit: config.cpuLimit || DEFAULTS.cpuLimit,
      timeoutSeconds: config.timeoutSeconds || DEFAULTS.timeoutSeconds,
      networkEnabled: config.networkEnabled ?? DEFAULTS.networkEnabled,
    };
  }

  async initialize(): Promise<void> {
    const { image, memoryMB, cpuLimit, networkEnabled, workdir, env, volumes } = this.resolvedConfig;

    // Ensure the image exists (pull if needed)
    await this.ensureImage(image);

    // Prepare volume bindings
    const binds: string[] = [`${workdir}:/workspace`];
    if (volumes) {
      for (const vol of volumes) {
        const mode = vol.readonly !== false ? 'ro' : 'rw';
        binds.push(`${vol.hostPath}:${vol.containerPath}:${mode}`);
      }
    }

    // Prepare environment variables
    const envArray = Object.entries(env || {}).map(([k, v]) => `${k}=${v}`);

    // Create container with security defaults
    this.container = await this.docker.createContainer({
      Image: image,
      name: this.id,
      WorkingDir: '/workspace',
      Env: envArray,
      Tty: false,
      OpenStdin: false,
      HostConfig: {
        // Resource limits
        Memory: memoryMB * 1024 * 1024,
        NanoCpus: Math.floor(cpuLimit * 1e9),

        // Volume mounts
        Binds: binds,

        // Network isolation (disabled by default)
        NetworkMode: networkEnabled ? 'bridge' : 'none',

        // Security: read-only root filesystem with writable /tmp and /workspace
        ReadonlyRootfs: true,
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=100m',
        },

        // Security: drop all capabilities, add back only what's needed
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'SETUID', 'SETGID'],

        // Security: no privileged mode
        Privileged: false,

        // Security: prevent container from gaining new privileges
        SecurityOpt: ['no-new-privileges:true'],

        // Limit PIDs to prevent fork bombs
        PidsLimit: 256,

        // Auto-remove on stop (for cleanup)
        AutoRemove: false,
      },
      // Keep container running with a simple command
      Cmd: ['sleep', 'infinity'],
    });

    await this.container.start();
    this.status = 'running';
  }

  private async ensureImage(imageName: string): Promise<void> {
    try {
      await this.docker.getImage(imageName).inspect();
    } catch {
      // Image doesn't exist locally, pull it
      console.log(`Pulling image ${imageName}...`);
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(imageName, {}, (err, stream) => {
          if (err) {
            reject(new Error(`Failed to pull image ${imageName}: ${err.message}`));
            return;
          }

          if (!stream) {
            reject(new Error(`Failed to pull image ${imageName}: no stream returned`));
            return;
          }

          // Follow the pull progress
          this.docker.modem.followProgress(stream, (progressErr) => {
            if (progressErr) reject(progressErr);
            else resolve();
          });
        });
      });
    }
  }

  async exec(command: string, options: ExecOptions = {}): Promise<ExecutionResult> {
    if (this.status !== 'running' || !this.container) {
      throw new Error(`Cannot execute in sandbox: status is ${this.status}`);
    }

    const timeout = (options.timeoutSeconds || this.resolvedConfig.timeoutSeconds) * 1000;
    const startTime = Date.now();

    // Prepare environment
    const env = Object.entries(options.env || {}).map(([k, v]) => `${k}=${v}`);

    // Create exec instance
    const exec = await this.container.exec({
      Cmd: ['sh', '-c', command],
      WorkingDir: options.cwd || '/workspace',
      Env: env,
      AttachStdout: true,
      AttachStderr: true,
    });

    // Run with timeout
    return new Promise<ExecutionResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let killed = false;

      const timeoutId = setTimeout(async () => {
        timedOut = true;
        // Kill the exec process
        try {
          await exec.inspect().then((info) => {
            if (info.Running) {
              killed = true;
            }
          });
        } catch {
          // Ignore errors during timeout handling
        }
      }, timeout);

      exec.start({ hijack: true, stdin: false }, (err, stream) => {
        if (err || !stream) {
          clearTimeout(timeoutId);
          resolve({
            exitCode: 1,
            stdout: '',
            stderr: err?.message || 'Failed to start exec',
            durationMs: Date.now() - startTime,
            timedOut: false,
            killed: false,
          });
          return;
        }

        // Demux stdout and stderr
        const stdoutStream = new PassThrough();
        const stderrStream = new PassThrough();

        this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

        stdoutStream.on('data', (chunk: Buffer) => {
          const data = chunk.toString();
          stdout += data;
          if (options.stream && options.onOutput) {
            options.onOutput('stdout', data);
          }
        });

        stderrStream.on('data', (chunk: Buffer) => {
          const data = chunk.toString();
          stderr += data;
          if (options.stream && options.onOutput) {
            options.onOutput('stderr', data);
          }
        });

        stream.on('end', async () => {
          clearTimeout(timeoutId);

          // Get exit code
          let exitCode = 0;
          try {
            const info = await exec.inspect();
            exitCode = info.ExitCode ?? 0;
          } catch {
            exitCode = timedOut ? 124 : 1;
          }

          resolve({
            exitCode,
            stdout,
            stderr,
            durationMs: Date.now() - startTime,
            timedOut,
            killed,
          });
        });

        stream.on('error', (err) => {
          clearTimeout(timeoutId);
          resolve({
            exitCode: 1,
            stdout,
            stderr: stderr + '\n' + err.message,
            durationMs: Date.now() - startTime,
            timedOut,
            killed: true,
          });
        });
      });
    });
  }

  async copyIn(hostPath: string, containerPath: string): Promise<void> {
    if (!this.container) {
      throw new Error('Sandbox not initialized');
    }

    // Use tar to copy files into the container
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Create a tar stream and put it into the container
    await execAsync(`tar -cf - -C "$(dirname "${hostPath}")" "$(basename "${hostPath}")" | docker cp - ${this.id}:${containerPath}`);
  }

  async copyOut(containerPath: string, hostPath: string): Promise<void> {
    if (!this.container) {
      throw new Error('Sandbox not initialized');
    }

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    await execAsync(`docker cp ${this.id}:${containerPath} "${hostPath}"`);
  }

  async stop(): Promise<void> {
    if (this.container && this.status === 'running') {
      await this.container.stop({ t: 5 });
      this.status = 'stopped';
    }
  }

  async destroy(): Promise<void> {
    if (this.container) {
      try {
        // Stop if running
        if (this.status === 'running') {
          await this.container.stop({ t: 1 }).catch(() => {});
        }
        // Remove the container
        await this.container.remove({ force: true });
      } catch {
        // Ignore errors during cleanup
      }
      this.container = null;
    }
    this.status = 'destroyed';
  }
}

/**
 * Custom error for Docker not available
 */
export class DockerNotAvailableError extends Error {
  suggestion: string;

  constructor(message: string, suggestion?: string) {
    super(message);
    this.name = 'DockerNotAvailableError';
    this.suggestion = suggestion || 'Please install and start Docker.';
  }
}
