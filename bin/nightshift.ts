#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg: { version: string } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')
);

const args = process.argv.slice(2);

function parseFlag(arr: string[], flag: string): string | null {
  const idx = arr.indexOf(flag);
  if (idx === -1 || idx + 1 >= arr.length) return null;
  return arr[idx + 1];
}

function printHelp(): void {
  const tag = `v${pkg.version}`;
  const art = [
    '███╗   ██╗██╗ ██████╗ ██╗  ██╗████████╗███████╗██╗  ██╗██╗███████╗████████╗',
    '████╗  ██║██║██╔════╝ ██║  ██║╚══██╔══╝██╔════╝██║  ██║██║██╔════╝╚══██╔══╝',
    '██╔██╗ ██║██║██║  ███╗███████║   ██║   ███████╗███████║██║█████╗     ██║   ',
    '██║╚██╗██║██║██║   ██║██╔══██║   ██║   ╚════██║██╔══██║██║██╔══╝     ██║   ',
    '██║ ╚████║██║╚██████╔╝██║  ██║   ██║   ███████║██║  ██║██║██║        ██║   ',
    '╚═╝  ╚═══╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝╚═╝        ╚═╝   ',
  ];

  console.log('');
  for (const line of art) {
    console.log(`  ${line}`);
  }
  console.log('');
  console.log(`  ${tag} — Coordinating AI agents for your development pipeline.`);
  console.log('');
  console.log(`Usage: nightshift <command> [options]

Commands:
  init       Set up a nightshift team in this repository
  reinit     Regenerate agent profiles and labels (no worktrees)
  teardown   Remove nightshift from this repository
  start      Launch all agents in a tmux session
  stop       Stop a running tmux session
  list       Show active teams in this repository

Options (init):
  --team <name>     Team preset to initialize (required)
  --from <path>     Custom team definition directory
  --coders <n>      Number of coder agents (1-4, default: 1)
  --yes             Accept defaults non-interactively
  --reset           Reset team config files
  --reset-repo      Reset shared repo.md (with confirmation)

Options (reinit):
  --team <name>     Team to regenerate (required)
  --agent <role>    Regenerate a single agent only

Options (teardown):
  --team <name>     Remove specific team (omit to remove all)
  --force           Skip confirmation
  --remove-labels   Also delete GitHub labels

Options (start/stop):
  --team <name>     Team to start or stop (required)
  --port <number>   Port for visualization server (default: 4321)
  --headless        Run agents as background processes (no tmux)

Options:
  --help, -h        Show this help message
  --version, -v     Show version number

Learn more: https://github.com/nightshift-agents/nightshift
`);
}

function printVersion(): void {
  console.log(pkg.version);
}

async function list(): Promise<void> {
  const { detectRepoRoot, detectRepoName } = await import('../lib/detect.js');
  const { discoverTeams } = await import('../lib/worktrees.js');
  const { loadTeamConfig, buildAgentListFromConfig, isTeamRunning } = await import('../lib/start.js');
  const chalk = (await import('chalk')).default;

  try {
    const repoRoot = detectRepoRoot();
    const repoName = detectRepoName();
    const teams = discoverTeams(repoName);

    if (teams.length === 0) {
      console.log('No nightshift teams initialized in this repo.');
      console.log('Run: npx nightshift init --team dev');
      return;
    }

    console.log('');
    console.log(`Nightshift teams in ${repoName}:`);
    console.log('');
    for (const team of teams) {
      const running = isTeamRunning(repoName, team);
      const status = running
        ? chalk.green('running')
        : chalk.dim('stopped');
      const config = loadTeamConfig(team, repoRoot);
      if (config) {
        const agents = buildAgentListFromConfig(config, repoRoot, repoName);
        console.log(`  ${team} (${agents.length} agents) — ${status}`);
        for (const a of agents) {
          console.log(`    ${a.role.padEnd(12)} → @${a.agent}`);
        }
      } else {
        console.log(`  ${team} (no team.yaml found) — ${status}`);
      }
    }
    console.log('');
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const command = args[0];
  const commandArgs = args.slice(1);

  switch (command) {
    case 'init': {
      const { init } = await import('../lib/init.js');
      await init(commandArgs);
      break;
    }
    case 'teardown': {
      const { teardown } = await import('../lib/teardown.js');
      await teardown(commandArgs);
      break;
    }
    case 'reinit': {
      const { reinit } = await import('../lib/reinit.js');
      await reinit(commandArgs);
      break;
    }
    case 'start': {
      const team = parseFlag(commandArgs, '--team');
      if (!team) {
        console.error('Please specify a team: npx nightshift start --team dev');
        process.exit(1);
      }
      const portStr = parseFlag(commandArgs, '--port');
      const port = portStr ? parseInt(portStr, 10) : undefined;
      const headless = commandArgs.includes('--headless');
      const { startSession } = await import('../lib/start.js');
      await startSession(team, { port, headless });
      break;
    }
    case 'stop': {
      const team = parseFlag(commandArgs, '--team');
      if (!team) {
        console.error('Please specify a team: npx nightshift stop --team dev');
        process.exit(1);
      }
      const { stopSession } = await import('../lib/start.js');
      stopSession(team);
      break;
    }
    case 'list': {
      await list();
      break;
    }
    case '--help':
    case '-h':
    case undefined: {
      printHelp();
      break;
    }
    case '--version':
    case '-v': {
      printVersion();
      break;
    }
    default: {
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
    }
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
