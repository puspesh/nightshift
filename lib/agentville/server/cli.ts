#!/usr/bin/env node
import { AgentvilleServer } from './server.js';

const args = process.argv.slice(2);

// Handle `miniverse report <state>` subcommand for use in hooks
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

const server = new AgentvilleServer({ port, publicDir });

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

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Agentville...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});
