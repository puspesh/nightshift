import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AgentEntry, CitizenOverrides } from './types.js';
import { resolveCitizenProps } from './citizen-config.js';

const AGENTVILLE_HOME = join(homedir(), '.agentville');
const PID_FILE = join(AGENTVILLE_HOME, 'agentville.pid');
const PORT_FILE = join(AGENTVILLE_HOME, 'agentville.port');

/**
 * Check if agentville CLI is installed.
 */
function isAgentvilleInstalled(): boolean {
  try {
    execSync('which agentville', { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
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
 * Start the agentville server via the agentville CLI.
 * Agentville manages its own process lifecycle (PID files, detached spawn).
 * Returns the URL of the running server, or null if agentville is not installed.
 */
export function startAgentville(
  port: number,
): { pid: number; url: string } | null {
  // Check if already running (check both canonical and legacy paths)
  const pidPaths = [PID_FILE, join(homedir(), '.nightshift', 'agentville.pid')];
  for (const pidPath of pidPaths) {
    if (!existsSync(pidPath)) continue;
    try {
      const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
      if (!isNaN(pid) && isProcessAlive(pid)) {
        const correspondingPort = pidPath.replace('.pid', '.port');
        let existingPort = port;
        if (existsSync(correspondingPort)) {
          try {
            existingPort = parseInt(readFileSync(correspondingPort, 'utf-8').trim(), 10) || port;
          } catch { /* use default */ }
        }
        return { pid, url: `http://localhost:${existingPort}` };
      }
    } catch { /* stale PID */ }
  }

  if (!isAgentvilleInstalled()) return null;

  // Delegate to agentville CLI — it handles detached spawn and PID files
  try {
    execFileSync('agentville', ['start', '--port', String(port)], { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return null;
  }

  // Read back the PID that agentville wrote
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (!isNaN(pid)) {
        return { pid, url: `http://localhost:${port}` };
      }
    } catch { /* ignore */ }
  }

  return null;
}

/**
 * Wait for the agentville server to become healthy.
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
 */
export async function registerAgentvilleAgents(url: string, agents: AgentEntry[], team: string, overrides?: CitizenOverrides): Promise<void> {
  for (const agent of agents) {
    const agentId = `ns-${team}-${agent.role}`;
    const resolved = resolveCitizenProps(agent.role, overrides ?? {});
    const payload = {
      type: 'agent:heartbeat',
      source: 'nightshift',
      agent: agentId,
      data: {
        name: resolved.displayName,
        color: resolved.color,
        state: 'idle',
        task: 'Initializing',
        metadata: {},
      },
    };

    let success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`${url}/api/events`, {
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
 * Stop the global agentville server.
 * Tries agentville CLI first, falls back to direct PID kill.
 */
export function stopAgentville(): void {
  // Try clean stop via CLI
  if (isAgentvilleInstalled()) {
    try {
      execFileSync('agentville', ['stop'], { stdio: ['pipe', 'pipe', 'pipe'] });
      return;
    } catch { /* fall through to manual cleanup */ }
  }

  // Manual cleanup
  const pidPaths = [PID_FILE, join(homedir(), '.nightshift', 'agentville.pid')];
  for (const pidFile of pidPaths) {
    if (!existsSync(pidFile)) continue;
    const portFile = pidFile.replace('.pid', '.port');
    try {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      if (!isNaN(pid)) process.kill(pid);
    } catch { /* already dead */ }
    try { unlinkSync(pidFile); } catch { /* ignore */ }
    try { if (existsSync(portFile)) unlinkSync(portFile); } catch { /* ignore */ }
  }
}
