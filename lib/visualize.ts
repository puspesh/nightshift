import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AgentEntry } from './types.js';

/**
 * Get the path to the miniverse PID file for a team.
 */
export function getPidFilePath(repoName: string, team: string): string {
  return join(homedir(), '.nightshift', repoName, team, 'miniverse.pid');
}

/**
 * Get the path to the miniverse port file for a team.
 */
export function getPortFilePath(repoName: string, team: string): string {
  return join(homedir(), '.nightshift', repoName, team, 'miniverse.port');
}

/**
 * Get the path to the miniverse log file for a team.
 */
export function getLogFilePath(repoName: string, team: string): string {
  return join(homedir(), '.nightshift', repoName, team, 'miniverse.log');
}

/**
 * Start the miniverse server as a detached child process.
 * Returns the URL of the running server, or null if it failed to start.
 */
export function startServer(
  port: number,
  worldDir: string,
  repoName: string,
  team: string,
): { pid: number; url: string } | null {
  const pidFile = getPidFilePath(repoName, team);
  const portFile = getPortFilePath(repoName, team);
  const logFile = getLogFilePath(repoName, team);

  // Ensure parent directory exists
  mkdirSync(join(homedir(), '.nightshift', repoName, team), { recursive: true });

  // Find the miniverse binary
  const miniverse = join(process.cwd(), 'node_modules', '.bin', 'miniverse');
  if (!existsSync(miniverse)) {
    return null;
  }

  // Open log file for output
  const logFd = openSync(logFile, 'a');

  // Start as detached process
  const child = spawn(miniverse, ['--port', String(port), '--public', worldDir], {
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
 * Polls GET / until it responds (max timeout).
 */
export async function waitForServer(url: string, timeoutMs: number = 10000): Promise<boolean> {
  const start = Date.now();
  const interval = 500;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${url}/api/info`);
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
export async function registerAgents(url: string, agents: AgentEntry[], team: string): Promise<void> {
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const agentId = `ns-${team}-${agent.role}`;
    const payload = {
      agent: agentId,
      name: agent.role,
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
 * Stop the miniverse server by reading the PID file and killing the process.
 */
export function stopServer(repoName: string, team: string): void {
  const pidFile = getPidFilePath(repoName, team);
  const portFile = getPortFilePath(repoName, team);

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
 * Check if the miniverse server is running for a team.
 */
export function isServerRunning(repoName: string, team: string): boolean {
  const pidFile = getPidFilePath(repoName, team);
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
