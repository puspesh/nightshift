#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { AgentvilleServer } from './server.js';
import { loadWorld, saveWorld, bootstrapWorld } from '../persistence.js';
import { migrateFromMiniverse, cleanupOldPidFiles } from '../migrate.js';
import { evaluateStreak } from '../streak.js';
import type { AgentvilleWorld } from '../schema.js';

const args = process.argv.slice(2);

// Handle `agentville report <state>` subcommand for use in hooks
if (args[0] === 'report') {
  const state = args[1] ?? 'idle';
  const taskIdx = args.indexOf('--task');
  const task = taskIdx >= 0 ? args[taskIdx + 1] : null;
  const agentIdx = args.indexOf('--agent');
  const agent = agentIdx >= 0 ? args[agentIdx + 1] : 'claude';
  const portIdx = args.indexOf('--port');
  const port = portIdx >= 0 ? args[portIdx + 1] : '4321';

  const body = JSON.stringify({ agent, state, task });

  await fetch(`http://localhost:${port}/api/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {
    // Silent fail — don't break the agent's workflow
  });

  process.exit(0);
}

// Main server mode
const portIdx = args.indexOf('--port');
const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 4321;
const publicIdx = args.indexOf('--public');
const publicDir = publicIdx >= 0 ? args[publicIdx + 1] : undefined;
const noBrowser = args.includes('--no-browser');

// --- Persistence: load or bootstrap game state ---
const agentvilleDir = join(homedir(), '.agentville');
const miniverseDir = join(homedir(), '.nightshift', 'miniverse');

mkdirSync(agentvilleDir, { recursive: true });

let gameState: AgentvilleWorld | null = loadWorld(agentvilleDir);

// Migration fallback: if no world in ~/.agentville/, try migrating from ~/.nightshift/miniverse/
if (!gameState && existsSync(miniverseDir)) {
  gameState = migrateFromMiniverse(miniverseDir);
  if (gameState) {
    saveWorld(agentvilleDir, gameState);
    console.log('  Migrated world state from ~/.nightshift/miniverse/');
  }
  // Clean up old miniverse PID/port files
  cleanupOldPidFiles(join(homedir(), '.nightshift'));
}

// Bootstrap if nothing found anywhere
if (!gameState) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  gameState = bootstrapWorld(timezone);
  saveWorld(agentvilleDir, gameState);
  console.log('  Bootstrapped new Agentville world');
}

// Evaluate streak
const streakResult = evaluateStreak(gameState.stats);
gameState.stats.streakDays = streakResult.streakDays;
gameState.stats.lastActiveDate = streakResult.lastActiveDate;
saveWorld(agentvilleDir, gameState);

// --- Create and configure server ---
const server = new AgentvilleServer({ port, publicDir });
server.setGameState(gameState);

// Wire mutation callback to persist on changes
server.onMutation(() => {
  const state = server.getGameState();
  if (state) {
    saveWorld(agentvilleDir, state);
  }
});

server.start().then(async (actualPort) => {
  console.log('');
  const url = `http://localhost:${actualPort}`;

  if (noBrowser) {
    // Quiet mode — running alongside Vite via concurrently
    console.log(`  Agentville server ready on port ${actualPort}`);
    console.log('');
  } else {
    // Standalone mode — show the full banner
    const line = `  Server:  ${url}`;
    const pad = 38 - line.length;
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║          A G E N T V I L L E         ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║${line}${' '.repeat(pad)}║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
  }

  if (!noBrowser) {
    // Open browser
    const { exec } = await import('node:child_process');
    const url = `http://localhost:${actualPort}`;
    const cmd = process.platform === 'darwin' ? `open "${url}"`
      : process.platform === 'win32' ? `start "${url}"`
      : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
}).catch((err) => {
  console.error('Failed to start Agentville server:', err);
  process.exit(1);
});

// Graceful shutdown — save game state before exit
process.on('SIGINT', () => {
  console.log('\nShutting down Agentville...');
  const state = server.getGameState();
  if (state) {
    saveWorld(agentvilleDir, state);
  }
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  const state = server.getGameState();
  if (state) {
    saveWorld(agentvilleDir, state);
  }
  server.stop();
  process.exit(0);
});
