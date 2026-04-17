#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AGENTVILLE_DIR = join(homedir(), '.agentville');
const PID_FILE = join(AGENTVILLE_DIR, 'agentville.pid');
const PORT_FILE = join(AGENTVILLE_DIR, 'agentville.port');
const LOG_FILE = join(AGENTVILLE_DIR, 'agentville.log');
const DEFAULT_PORT = 4321;

const args = process.argv.slice(2);
const command = args[0];

function parseFlag(arr: string[], flag: string): string | null {
  const idx = arr.indexOf(flag);
  if (idx === -1 || idx + 1 >= arr.length) return null;
  return arr[idx + 1];
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function start(): void {
  // Ensure ~/.agentville/ exists
  mkdirSync(AGENTVILLE_DIR, { recursive: true });

  // Check if already running
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (!isNaN(pid) && isProcessRunning(pid)) {
        const port = existsSync(PORT_FILE)
          ? readFileSync(PORT_FILE, 'utf-8').trim()
          : 'unknown';
        console.log(`Agentville is already running (PID ${pid}, port ${port})`);
        return;
      }
    } catch {
      // Stale PID file, proceed to start
    }
  }

  const portStr = parseFlag(args, '--port');
  const port = portStr ? parseInt(portStr, 10) : DEFAULT_PORT;

  // Spawn the server CLI as a detached process
  const cliPath = join(__dirname, '..', 'lib', 'agentville', 'server', 'cli.js');
  if (!existsSync(cliPath)) {
    console.error('Agentville server not found. Run `bun run build` first.');
    process.exit(1);
  }

  const logFd = openSync(LOG_FILE, 'a');

  const child = spawn(process.execPath, [cliPath, '--port', String(port), '--no-browser'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env },
  });

  if (!child.pid) {
    console.error('Failed to start Agentville server.');
    process.exit(1);
  }

  child.unref();

  // Write PID and port files
  writeFileSync(PID_FILE, String(child.pid));
  writeFileSync(PORT_FILE, String(port));

  console.log(`Agentville started (PID ${child.pid}, port ${port})`);
  console.log(`  Server: http://localhost:${port}`);
  console.log(`  Logs:   ${LOG_FILE}`);
}

function stop(): void {
  if (!existsSync(PID_FILE)) {
    console.log('Agentville is not running.');
    return;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    if (!isNaN(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`Agentville stopped (PID ${pid}).`);
      } catch {
        console.log('Agentville process was already stopped.');
      }
    }
  } catch {
    // PID file read error
  }

  // Clean up PID and port files
  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  try { if (existsSync(PORT_FILE)) unlinkSync(PORT_FILE); } catch { /* ignore */ }
}

function printUsage(): void {
  console.log(`
Usage: agentville <command> [options]

Commands:
  start    Start the Agentville server
  stop     Stop the running Agentville server

Options:
  --port <number>   Port for the server (default: ${DEFAULT_PORT})
  --help, -h        Show this help message
`);
}

switch (command) {
  case 'start':
    start();
    break;
  case 'stop':
    stop();
    break;
  case '--help':
  case '-h':
  case undefined:
    printUsage();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}
