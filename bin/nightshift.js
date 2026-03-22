#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
);

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
nightshift v${pkg.version}

Coordinating AI agents for your development pipeline.

Usage: nightshift <command> [options]

Commands:
  init       Set up a nightshift team in this repository
  teardown   Remove nightshift from this repository
  list       Show active teams in this repository

Options (init):
  --team <name>     Team preset to initialize (required)
  --coders <n>      Number of coder agents (1-4, default: 1)
  --yes             Accept defaults non-interactively
  --reset           Reset team config files
  --reset-repo      Reset shared repo.md (with confirmation)

Options (teardown):
  --team <name>     Remove specific team (omit to remove all)
  --force           Skip confirmation
  --remove-labels   Also delete GitHub labels

Options:
  --help, -h        Show this help message
  --version, -v     Show version number

Learn more: https://github.com/nightshift-agents/nightshift
`);
}

function printVersion() {
  console.log(pkg.version);
}

async function list() {
  const { detectRepoRoot, detectRepoName } = await import('../lib/detect.js');
  const { discoverTeams, discoverCoderCount } = await import('../lib/worktrees.js');

  try {
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
      const coders = discoverCoderCount(repoName, team);
      console.log(`  ${team} (${coders} coder${coders !== 1 ? 's' : ''})`);
    }
    console.log('');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

async function main() {
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

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
