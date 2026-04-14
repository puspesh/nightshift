import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { AgentEntry, CitizenOverrides } from './types.js';
import { resolveCitizenProps } from './citizen-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the path to the global agentville PID file.
 * Checks ~/.agentville/ first, falls back to ~/.nightshift/.
 */
export function getPidFilePath(): string {
  const newPath = join(homedir(), '.agentville', 'agentville.pid');
  if (existsSync(newPath)) return newPath;
  const oldPath = join(homedir(), '.nightshift', 'agentville.pid');
  if (existsSync(oldPath)) return oldPath;
  // Default to new path for writes
  return newPath;
}

/**
 * Get the path to the global agentville port file.
 * Checks ~/.agentville/ first, falls back to ~/.nightshift/.
 */
export function getPortFilePath(): string {
  const newPath = join(homedir(), '.agentville', 'agentville.port');
  if (existsSync(newPath)) return newPath;
  const oldPath = join(homedir(), '.nightshift', 'agentville.port');
  if (existsSync(oldPath)) return oldPath;
  // Default to new path for writes
  return newPath;
}

/**
 * Get the path to the global agentville log file.
 */
export function getLogFilePath(): string {
  return join(homedir(), '.nightshift', 'agentville.log');
}

/**
 * Check if a process with the given PID is running.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if agentville is already running at either PID path.
 * Returns the PID if running, null otherwise.
 */
function findRunningInstance(): { pid: number; pidFile: string } | null {
  const paths = [
    join(homedir(), '.agentville', 'agentville.pid'),
    join(homedir(), '.nightshift', 'agentville.pid'),
  ];

  for (const pidFile of paths) {
    if (!existsSync(pidFile)) continue;
    try {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      if (!isNaN(pid) && isProcessAlive(pid)) {
        return { pid, pidFile };
      }
    } catch {
      // Stale PID file
    }
  }
  return null;
}

/**
 * Start the agentville server as a detached child process.
 * Returns the URL of the running server, or null if it failed to start.
 * Checks if already running at either PID path before starting.
 */
export function startAgentville(
  port: number,
  publicDir: string,
): { pid: number; url: string } | null {
  // Check if already running at either location
  const running = findRunningInstance();
  if (running) {
    // Already running — return the existing instance info
    // Try to read the port from corresponding port file
    const portFile = running.pidFile.replace('.pid', '.port');
    let existingPort = port;
    if (existsSync(portFile)) {
      try {
        existingPort = parseInt(readFileSync(portFile, 'utf-8').trim(), 10) || port;
      } catch { /* use default */ }
    }
    return { pid: running.pid, url: `http://localhost:${existingPort}` };
  }

  // Write PID/port to ~/.agentville/ (canonical path)
  const agentvilleHome = join(homedir(), '.agentville');
  const pidFile = join(agentvilleHome, 'agentville.pid');
  const portFile = join(agentvilleHome, 'agentville.port');
  const logFile = getLogFilePath();

  // Ensure parent directory exists
  mkdirSync(agentvilleHome, { recursive: true });

  // Use the vendored agentville server CLI
  const agentvilleCli = join(__dirname, 'agentville', 'server', 'cli.js');
  if (!existsSync(agentvilleCli)) {
    return null;
  }

  // Open log file for output
  const logFd = openSync(logFile, 'a');

  // Start as detached process using node
  const child = spawn(process.execPath, [agentvilleCli, '--port', String(port), '--public', publicDir, '--no-browser'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env },
  });

  if (!child.pid) {
    return null;
  }

  // Unref so parent can exit
  child.unref();

  // Write PID and port files
  writeFileSync(pidFile, String(child.pid));
  writeFileSync(portFile, String(port));

  return { pid: child.pid, url: `http://localhost:${port}` };
}

/**
 * Wait for the agentville server to become healthy.
 * Polls GET / (the static frontend) until it responds (max timeout).
 */
export async function waitForAgentville(url: string, timeoutMs: number = 10000): Promise<boolean> {
  const start = Date.now();
  const interval = 500;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}

/**
 * Register all agents with the agentville server via heartbeat API.
 * Includes retry logic for reliability.
 */
export async function registerAgentvilleAgents(url: string, agents: AgentEntry[], team: string, overrides?: CitizenOverrides): Promise<void> {
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const agentId = `ns-${team}-${agent.role}`;
    const resolved = resolveCitizenProps(agent.role, overrides ?? {});
    const payload = {
      agent: agentId,
      name: resolved.displayName,
      color: resolved.color,
      state: 'idle',
      task: 'Initializing',
    };

    let success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`${url}/api/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          success = true;
          break;
        }
      } catch {
        // Retry
      }
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!success) {
      console.warn(`Warning: Failed to register agent ${agentId} with agentville server`);
    }
  }
}

/**
 * Stop the global agentville server by reading the PID file and killing the process.
 * Checks both ~/.agentville/ and ~/.nightshift/ locations.
 */
export function stopAgentville(): void {
  const pidPaths = [
    join(homedir(), '.agentville', 'agentville.pid'),
    join(homedir(), '.nightshift', 'agentville.pid'),
  ];

  for (const pidFile of pidPaths) {
    if (!existsSync(pidFile)) continue;
    const portFile = pidFile.replace('.pid', '.port');

    try {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      if (!isNaN(pid)) {
        process.kill(pid);
      }
    } catch {
      // Process may already be dead
    }

    // Clean up PID and port files
    try {
      unlinkSync(pidFile);
      if (existsSync(portFile)) unlinkSync(portFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Check if the global agentville server is running.
 * Checks both ~/.agentville/ and ~/.nightshift/ locations.
 */
export function isAgentvilleRunning(): boolean {
  return findRunningInstance() !== null;
}
