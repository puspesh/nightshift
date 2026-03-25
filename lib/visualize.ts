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
 * Get the path to the global miniverse PID file.
 */
export function getPidFilePath(): string {
  return join(homedir(), '.nightshift', 'miniverse.pid');
}

/**
 * Get the path to the global miniverse port file.
 */
export function getPortFilePath(): string {
  return join(homedir(), '.nightshift', 'miniverse.port');
}

/**
 * Get the path to the global miniverse log file.
 */
export function getLogFilePath(): string {
  return join(homedir(), '.nightshift', 'miniverse.log');
}

/**
 * Start the miniverse server as a detached child process.
 * Returns the URL of the running server, or null if it failed to start.
 */
export function startServer(
  port: number,
  publicDir: string,
): { pid: number; url: string } | null {
  const pidFile = getPidFilePath();
  const portFile = getPortFilePath();
  const logFile = getLogFilePath();

  // Ensure parent directory exists
  mkdirSync(join(homedir(), '.nightshift'), { recursive: true });

  // Use the vendored miniverse server CLI
  const miniverse = join(__dirname, 'miniverse', 'server', 'cli.js');
  if (!existsSync(miniverse)) {
    return null;
  }

  // Open log file for output
  const logFd = openSync(logFile, 'a');

  // Start as detached process using node
  const child = spawn(process.execPath, [miniverse, '--port', String(port), '--public', publicDir, '--no-browser'], {
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
 * Wait for the miniverse server to become healthy.
 * Polls GET / (the static frontend) until it responds (max timeout).
 */
export async function waitForServer(url: string, timeoutMs: number = 10000): Promise<boolean> {
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
 * Register all agents with the miniverse server via heartbeat API.
 * Includes retry logic for reliability.
 */
export async function registerAgents(url: string, agents: AgentEntry[], team: string, overrides?: CitizenOverrides): Promise<void> {
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
      console.warn(`Warning: Failed to register agent ${agentId} with miniverse server`);
    }
  }
}

/**
 * Stop the global miniverse server by reading the PID file and killing the process.
 */
export function stopServer(): void {
  const pidFile = getPidFilePath();
  const portFile = getPortFilePath();

  if (!existsSync(pidFile)) return;

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

/**
 * Check if the global miniverse server is running.
 */
export function isServerRunning(): boolean {
  const pidFile = getPidFilePath();
  if (!existsSync(pidFile)) return false;

  try {
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    if (isNaN(pid)) return false;
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
