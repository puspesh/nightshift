import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { MiniverseServer } from '../../lib/miniverse/server/server.js';

/** Start a MiniverseServer on a random high port with the given publicDir. */
export async function startTestServer(publicDir: string): Promise<{ server: MiniverseServer; port: number; baseUrl: string }> {
  const port = 14000 + Math.floor(Math.random() * 50000);
  const server = new MiniverseServer({ port, publicDir });
  const actualPort = await server.start();
  return { server, port: actualPort, baseUrl: `http://localhost:${actualPort}` };
}

/** POST a heartbeat to register or update an agent. */
export async function sendHeartbeat(baseUrl: string, data: {
  agent: string;
  name?: string;
  state?: string;
  task?: string | null;
  energy?: number;
  color?: string;
}): Promise<void> {
  await fetch(`${baseUrl}/api/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/** Collect console messages matching a prefix. Returns the shared array that fills as logs arrive. */
export function collectConsoleLogs(page: Page, prefix: string): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.startsWith(prefix)) {
      logs.push(text);
    }
  });
  return logs;
}

/**
 * Create a temp directory with the structure the miniverse server expects:
 *   rootDir/public/<repoName>/<teamName>/world.json
 *   rootDir/core/miniverse-core.js  (symlink to actual bundle)
 */
export function createTestWorld(repoName: string, teamName: string): { publicDir: string; cleanup: () => void } {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'nightshift-e2e-'));
  const publicDir = path.join(rootDir, 'public');
  const worldDir = path.join(publicDir, repoName, teamName);
  mkdirSync(worldDir, { recursive: true });

  // Create the core/ sibling with symlink (or copy fallback) to actual miniverse-core.js
  const coreDir = path.join(rootDir, 'core');
  mkdirSync(coreDir, { recursive: true });
  const thisFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(thisFile), '..', '..');
  const actualCorePath = path.join(repoRoot, 'lib', 'miniverse', 'core', 'miniverse-core.js');
  const targetCorePath = path.join(coreDir, 'miniverse-core.js');
  try {
    symlinkSync(actualCorePath, targetCorePath);
  } catch {
    copyFileSync(actualCorePath, targetCorePath);
  }

  // Write minimal test world
  writeFileSync(path.join(worldDir, 'world.json'), JSON.stringify({
    gridCols: 10,
    gridRows: 8,
    floor: Array.from({ length: 8 }, () => Array(10).fill('floor')),
    tiles: {},
    props: [],
    citizens: [
      { agentId: 'ns-test-producer', name: 'Producer', sprite: 'dexter', position: { x: 2, y: 3 }, type: 'agent' },
      { agentId: 'ns-test-planner', name: 'Planner', sprite: 'morty', position: { x: 4, y: 3 }, type: 'agent' },
      { agentId: 'ns-test-coder', name: 'Coder', sprite: 'nova', position: { x: 6, y: 3 }, type: 'agent' },
    ],
  }));

  return {
    publicDir,
    cleanup: () => { rmSync(rootDir, { recursive: true, force: true }); },
  };
}
