import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { getTeamDir, discoverCoderCount } from './worktrees.js';
import { detectRepoRoot, detectRepoName } from './detect.js';

const DEFAULT_RUNNER = 'claude --dangerously-skip-permissions';

/**
 * Get the tmux session name for a repo + team.
 * @param {string} repoName
 * @param {string} team
 * @returns {string}
 */
export function getSessionName(repoName, team) {
  return `nightshift-${repoName}-${team}`;
}

/**
 * Build the ordered list of agents with their roles, agent names, and working directories.
 * Order: producer, planner, reviewer, coder-1..N, tester
 *
 * @param {string} team
 * @param {number} coderCount
 * @param {string} repoRoot
 * @param {string} repoName
 * @returns {{ role: string, agent: string, cwd: string }[]}
 */
export function buildAgentList(team, coderCount, repoRoot, repoName) {
  const teamDir = join(homedir(), '.nightshift', repoName, team);
  const agents = [];

  // Sidebar agents (left column)
  agents.push({ role: 'producer', agent: `ns-${team}-producer`, cwd: repoRoot });
  agents.push({ role: 'planner', agent: `ns-${team}-planner`, cwd: join(teamDir, 'worktrees', 'planner') });
  agents.push({ role: 'reviewer', agent: `ns-${team}-reviewer`, cwd: join(teamDir, 'worktrees', 'reviewer') });

  // Coders (right column)
  for (let i = 1; i <= coderCount; i++) {
    agents.push({ role: `coder-${i}`, agent: `ns-${team}-coder-${i}`, cwd: join(teamDir, 'worktrees', `coder-${i}`) });
  }

  // Tester (last sidebar agent)
  agents.push({ role: 'tester', agent: `ns-${team}-tester`, cwd: join(teamDir, 'worktrees', 'tester') });

  return agents;
}

/**
 * Parse the runner command from .claude/nightshift/repo.md.
 * Looks for the ## Runner section and extracts the code block.
 *
 * @param {string} repoRoot
 * @returns {string}
 */
export function parseRunner(repoRoot) {
  const repoMdPath = join(repoRoot, '.claude', 'nightshift', 'repo.md');
  if (!existsSync(repoMdPath)) {
    return DEFAULT_RUNNER;
  }

  const content = readFileSync(repoMdPath, 'utf-8');
  const runnerMatch = content.match(/## Runner[\s\S]*?```\n?(.*?)\n?```/);
  if (!runnerMatch) {
    return DEFAULT_RUNNER;
  }

  return runnerMatch[1].trim() || DEFAULT_RUNNER;
}

/**
 * Run a tmux command, suppressing output.
 * @param {string} cmd
 */
function tmux(cmd) {
  execSync(`tmux ${cmd}`, { stdio: ['pipe', 'pipe', 'pipe'] });
}

/**
 * Launch all agents for a team in a tmux session.
 *
 * Layout:
 *   Left sidebar (30%): producer, planner, reviewer, tester — 4 equal panes
 *   Right column (70%): coder-1..N — equally divided
 *
 * @param {string} team
 */
export function startSession(team) {
  // Check tmux is available
  try {
    execSync('which tmux', { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    console.error(chalk.red('tmux is required. Install it: brew install tmux'));
    process.exit(1);
  }

  const repoRoot = detectRepoRoot();
  const repoName = detectRepoName();
  const coderCount = discoverCoderCount(repoName, team);

  if (coderCount === 0) {
    console.error(chalk.red(`Team "${team}" is not initialized. Run: npx nightshift init --team ${team}`));
    process.exit(1);
  }

  const session = getSessionName(repoName, team);
  const agents = buildAgentList(team, coderCount, repoRoot, repoName);
  const runner = parseRunner(repoRoot);

  const sidebar = agents.filter(a => !a.role.startsWith('coder-'));
  const coders = agents.filter(a => a.role.startsWith('coder-'));

  // Kill existing session if any
  try {
    tmux(`kill-session -t "${session}"`);
  } catch { /* no existing session */ }

  // Create session — first pane becomes top-left (producer)
  tmux(`new-session -d -s "${session}" -c "${sidebar[0].cwd}"`);

  // Split into left (30%) and right (70%) columns
  tmux(`split-window -h -t "${session}:0.0" -l 70% -c "${coders[0].cwd}"`);

  // Split left column (pane 0) into 4 equal sidebar panes
  // Strategy: split from the top, giving remaining space to the bottom
  // After horizontal split: pane 0 = left, pane 1 = right
  tmux(`split-window -v -t "${session}:0.0" -l 75% -c "${sidebar[1].cwd}"`);
  // Now: 0=producer, 1=planner+reviewer+tester, 2=coders
  tmux(`split-window -v -t "${session}:0.1" -l 67% -c "${sidebar[2].cwd}"`);
  // Now: 0=producer, 1=planner, 2=reviewer+tester, 3=coders
  tmux(`split-window -v -t "${session}:0.2" -l 50% -c "${sidebar[3].cwd}"`);
  // Now: 0=producer, 1=planner, 2=reviewer, 3=tester, 4=coder-1

  // Split right column (pane 4) into N equal coder panes
  const rightBase = sidebar.length;
  for (let i = 1; i < coders.length; i++) {
    const remaining = coders.length - i;
    const pct = Math.floor(100 * remaining / (remaining + 1));
    tmux(`split-window -v -t "${session}:0.${rightBase}" -l ${pct}% -c "${coders[i].cwd}"`);
  }

  // Set pane labels using custom user options (immune to Claude overwriting)
  const paneColors = {
    'producer': 'fg=black,bg=cyan',
    'planner':  'fg=black,bg=yellow',
    'reviewer': 'fg=black,bg=magenta',
    'tester':   'fg=black,bg=green',
  };
  // Coders get blue shades
  const coderColors = ['fg=white,bg=blue', 'fg=black,bg=colour39', 'fg=black,bg=colour33', 'fg=black,bg=colour27'];

  tmux(`set-window-option -t "${session}" pane-border-status top`);
  tmux(`set-window-option -t "${session}" pane-border-format "#[#{@agent_color},bold] #{@agent_label} #[default]"`);

  const allPanes = [...sidebar, ...coders];
  for (let i = 0; i < allPanes.length; i++) {
    const a = allPanes[i];
    const color = paneColors[a.role] || coderColors[i - sidebar.length] || coderColors[0];
    tmux(`set-option -p -t "${session}:0.${i}" @agent_label "${a.role}  ·  /loop 15m @${a.agent}"`);
    tmux(`set-option -p -t "${session}:0.${i}" @agent_color "${color}"`);
  }

  // Launch runner in each pane
  for (let i = 0; i < allPanes.length; i++) {
    tmux(`send-keys -t "${session}:0.${i}" '${runner}' Enter`);
  }

  // Print info
  console.log('');
  console.log(chalk.bold('  nightshift'));
  console.log(chalk.dim(`  Starting ${team} team in tmux session: ${session}`));
  console.log(chalk.dim(`  Runner: ${runner}`));
  console.log('');
  console.log(chalk.bold('  Agents:'));
  for (const a of agents) {
    console.log(`    ${a.role.padEnd(10)} → @${a.agent}`);
  }
  console.log('');
  console.log(chalk.dim('  Type the /loop command shown in each pane title to start.'));
  console.log('');
  console.log(chalk.dim('  Tmux shortcuts:'));
  console.log(chalk.dim('    Ctrl+b, arrow  — navigate panes'));
  console.log(chalk.dim('    Ctrl+b, d      — detach (agents keep running)'));
  console.log(chalk.dim(`    npx nightshift stop --team ${team}  — stop all agents`));
  console.log('');

  // Attach
  execSync(`tmux attach-session -t "${session}"`, { stdio: 'inherit' });
}

/**
 * Stop a running tmux session for a team.
 * @param {string} team
 */
export function stopSession(team) {
  const repoName = detectRepoName();
  const session = getSessionName(repoName, team);

  try {
    tmux(`kill-session -t "${session}"`);
    console.log(chalk.green(`Stopped session: ${session}`));
  } catch {
    console.log(chalk.dim(`No active session: ${session}`));
  }
}
