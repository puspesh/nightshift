import { execSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { getTeamDir, discoverCoderCount } from './worktrees.js';
import { detectRepoRoot, detectRepoName } from './detect.js';
import { startServer, waitForServer, registerAgents, stopServer } from './visualize.js';
import { generateWorldConfig, writeWorldConfig } from './world-config.js';
import { installHooks } from './hooks.js';
import type { AgentEntry } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATUS_SCRIPT = join(__dirname, '..', '..', 'bin', 'ns-status.sh');
const DEFAULT_RUNNER = 'claude --dangerously-skip-permissions';
const LOOP_INTERVAL = 900; // 15 minutes in seconds

/**
 * Get the tmux session name for a repo + team.
 * @param {string} repoName
 * @param {string} team
 * @returns {string}
 */
export function getSessionName(repoName: string, team: string): string {
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
export function buildAgentList(team: string, coderCount: number, repoRoot: string, repoName: string): AgentEntry[] {
  const teamDir = join(homedir(), '.nightshift', repoName, team);
  const agents: AgentEntry[] = [];

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
export function parseRunner(repoRoot: string): string {
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
function tmux(cmd: string): void {
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
const DEFAULT_VIZ_PORT = 4321;

export async function startSession(team: string, options?: { port?: number }): Promise<void> {
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

  // Start visualization server (non-blocking — failure doesn't prevent agents from launching)
  const vizPort = options?.port ?? DEFAULT_VIZ_PORT;
  let vizUrl: string | null = null;
  try {
    const worldDir = join(getTeamDir(repoName, team), 'world');

    // Read base world data for spawn position computation
    const baseWorldDir = join(__dirname, '..', '..', 'worlds', 'nightshift');
    let baseWorld: { floor: string[][]; gridCols: number; gridRows: number; props: Array<{ x: number; y: number; w: number; h: number }> } | undefined;
    const baseWorldPath = join(baseWorldDir, 'base-world.json');
    if (existsSync(baseWorldPath)) {
      try {
        baseWorld = JSON.parse(readFileSync(baseWorldPath, 'utf-8'));
      } catch { /* fallback to no positions */ }
    }

    // Generate and write dynamic world config (with spawn positions if base world available)
    const worldConfig = generateWorldConfig(agents, team, baseWorld);
    writeWorldConfig(worldConfig, worldDir);
    if (existsSync(baseWorldDir)) {
      execSync(`cp -R "${baseWorldDir}/world_assets" "${baseWorldDir}/universal_assets" "${baseWorldDir}/base-world.json" "${worldDir}/" 2>/dev/null || true`, { stdio: 'pipe' });
    }
    // Copy miniverse core bundle so the server can serve it
    const coreDir = join(__dirname, 'miniverse', 'core');
    mkdirSync(join(worldDir, '..', 'core'), { recursive: true });
    if (existsSync(join(coreDir, 'miniverse-core.js'))) {
      execSync(`cp "${coreDir}/miniverse-core.js" "${join(worldDir, '..', 'core')}/" 2>/dev/null || true`, { stdio: 'pipe' });
    }

    const result = startServer(vizPort, worldDir, repoName, team, repoRoot);
    if (result) {
      const healthy = await waitForServer(result.url, 10000);
      if (healthy) {
        await registerAgents(result.url, agents, team);
        vizUrl = result.url;

        // Install/update hooks with the actual server URL so heartbeats reach the right port
        const allRoles = agents.map(a => a.role);
        installHooks(repoName, team, allRoles, result.url, repoRoot);
      } else {
        console.warn(chalk.yellow('  Warning: Visualization server did not become healthy'));
      }
    } else {
      console.warn(chalk.yellow('  Warning: Could not start visualization server. Run `bun run build` first.'));
    }
  } catch (err) {
    console.warn(chalk.yellow(`  Warning: Visualization failed to start: ${(err as Error).message}`));
  }

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
  const paneColors: Record<string, string> = {
    'producer': 'fg=black,bg=cyan',
    'planner':  'fg=black,bg=yellow',
    'reviewer': 'fg=black,bg=magenta',
    'tester':   'fg=black,bg=green',
  };
  // Coders get blue shades
  const coderColors = ['fg=white,bg=blue', 'fg=black,bg=colour39', 'fg=black,bg=colour33', 'fg=black,bg=colour27'];

  const statusDir = join(getTeamDir(repoName, team), 'status');

  tmux(`set-window-option -t "${session}" pane-border-status top`);
  tmux(`set-window-option -t "${session}" pane-border-format "#[#{@agent_color},bold] #{@agent_label} #[default] #(${STATUS_SCRIPT} #{@status_file} ${LOOP_INTERVAL})"`);
  tmux(`set-option -t "${session}" status-interval 10`);

  const allPanes = [...sidebar, ...coders];
  for (let i = 0; i < allPanes.length; i++) {
    const a = allPanes[i];
    const color = paneColors[a.role] || coderColors[i - sidebar.length] || coderColors[0];
    // Role name for status file: coders use "coder" (shared base), producer/planner/reviewer/tester use their role
    const statusRole = a.role.startsWith('coder-') ? a.role : a.role;
    const statusFile = join(statusDir, statusRole);
    tmux(`set-option -p -t "${session}:0.${i}" @agent_label "${a.role}  ·  /loop 15m @${a.agent}"`);
    tmux(`set-option -p -t "${session}:0.${i}" @agent_color "${color}"`);
    tmux(`set-option -p -t "${session}:0.${i}" @status_file "${statusFile}"`);
  }

  // Launch runner in each pane
  for (let i = 0; i < allPanes.length; i++) {
    tmux(`send-keys -t "${session}:0.${i}" '${runner}' Enter`);
  }

  // Print info
  console.log(chalk.bold(`
       _       __    __       __    _ ______
 ___  (_)___ _/ /_  / /______/ /_  (_) __/ /_
/ _ \\/ / __ \`/ __ \\/ __/ ___/ __ \\/ / /_/ __/
/ / / / / /_/ / / / / /_(__  ) / / / / __/ /_
/_/ /_/_/\\__, /_/ /_/\\__/____/_/ /_/_/_/  \\__/
        /____/`));
  console.log(chalk.dim(`  Starting ${team} team in tmux session: ${session}`));
  console.log(chalk.dim(`  Runner: ${runner}`));
  if (vizUrl) {
    console.log(chalk.dim(`  Visualization: ${vizUrl}`));
    try {
      execSync(`open "${vizUrl}"`, { stdio: 'pipe' });
    } catch { /* non-macOS or open not available */ }
  }
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
export function stopSession(team: string): void {
  const repoName = detectRepoName();
  const session = getSessionName(repoName, team);

  // Stop visualization server before killing tmux
  try {
    stopServer(repoName, team);
  } catch {
    // Non-critical — continue with tmux cleanup
  }

  try {
    tmux(`kill-session -t "${session}"`);
    console.log(chalk.green(`Stopped session: ${session}`));
  } catch {
    console.log(chalk.dim(`No active session: ${session}`));
  }
}
