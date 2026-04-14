import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { getTeamDir, discoverCoderCount } from './worktrees.js';
import { detectRepoRoot, detectRepoName } from './detect.js';
import { startAgentville, waitForAgentville, registerAgentvilleAgents, stopAgentville } from './agentville.js';
import { generateWorldConfig, mergeWorldConfig } from './world-config.js';
import { installHooks } from './hooks.js';
import { loadCitizenConfig, resolveCitizenProps, hexToTmuxStyle } from './citizen-config.js';
import { loadAgentConfig, resolveAgentConfig, buildRunnerForAgent } from './agent-config.js';
import type { AgentEntry, StartOptions, CitizenOverrides } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATUS_SCRIPT = join(__dirname, '..', 'bin', 'ns-status.sh');
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

const DEFAULT_VIZ_PORT = 4321;
const AGENT_LOOP_SCRIPT = join(__dirname, '..', 'bin', 'ns-agent-loop.sh');

/**
 * Set up visualization server, hooks, and world config.
 * Shared between tmux and headless modes.
 */
async function setupVisualization(
  team: string, agents: AgentEntry[], repoRoot: string,
  repoName: string, citizenOverrides: CitizenOverrides, vizPort: number,
): Promise<string | null> {
  let vizUrl: string | null = null;
  try {
    const miniverseDir = join(homedir(), '.nightshift', 'miniverse');
    const teamWorldDir = join(miniverseDir, repoName, team);

    // Read base world data for spawn position computation
    const baseWorldDir = join(__dirname, '..', 'worlds', 'agentville');
    let baseWorld: { floor: string[][]; gridCols: number; gridRows: number; props: Array<{ x: number; y: number; w: number; h: number }> } | undefined;
    const srcBaseWorldPath = join(baseWorldDir, 'base-world.json');
    if (existsSync(srcBaseWorldPath)) {
      try {
        baseWorld = JSON.parse(readFileSync(srcBaseWorldPath, 'utf-8'));
      } catch { /* fallback to no positions */ }
    }

    // Generate dynamic world config (with spawn positions if base world available)
    const worldConfig = generateWorldConfig(agents, team, citizenOverrides, baseWorld);

    // Copy base world assets to team world dir
    mkdirSync(teamWorldDir, { recursive: true });
    if (existsSync(baseWorldDir)) {
      execSync(`cp -R "${baseWorldDir}/world_assets" "${baseWorldDir}/base-world.json" "${teamWorldDir}/" 2>/dev/null || true`, { stdio: 'pipe' });
      execSync(`cp -R "${baseWorldDir}/universal_assets" "${miniverseDir}/" 2>/dev/null || true`, { stdio: 'pipe' });
    }

    const baseWorldPath = join(teamWorldDir, 'base-world.json');
    const merged = mergeWorldConfig(baseWorldPath, worldConfig);
    writeFileSync(join(teamWorldDir, 'world.json'), JSON.stringify(merged, null, 2) + '\n');

    const coreDir = join(__dirname, 'agentville', 'core');
    mkdirSync(join(miniverseDir, '..', 'core'), { recursive: true });
    if (existsSync(join(coreDir, 'agentville-core.js'))) {
      execSync(`cp "${coreDir}/agentville-core.js" "${join(miniverseDir, '..', 'core')}/" 2>/dev/null || true`, { stdio: 'pipe' });
    }

    stopAgentville();
    const result = startAgentville(vizPort, miniverseDir);
    if (!result) {
      console.warn(chalk.yellow('  Warning: Could not start visualization server. Run `bun run build` first.'));
      throw new Error('Server start failed');
    }
    const healthy = await waitForAgentville(result.url, 10000);
    if (!healthy) {
      console.warn(chalk.yellow('  Warning: Visualization server did not become healthy'));
      throw new Error('Server health check failed');
    }

    await registerAgentvilleAgents(result.url, agents, team, citizenOverrides);
    vizUrl = result.url;

    const allRoles = agents.map(a => a.role);
    installHooks(repoName, team, allRoles, result.url, repoRoot);
  } catch (err) {
    if (!vizUrl) {
      console.warn(chalk.yellow(`  Warning: Visualization failed to start: ${(err as Error).message}`));
    }
  }
  return vizUrl;
}

// --- Headless PID management ---

export function getHeadlessPidDir(repoName: string, team: string): string {
  return join(getTeamDir(repoName, team), 'pids');
}

export function writeAgentPid(repoName: string, team: string, role: string, pid: number): void {
  const dir = getHeadlessPidDir(repoName, team);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${role}.pid`), String(pid));
}

export function stopHeadlessAgents(repoName: string, team: string): number {
  const dir = getHeadlessPidDir(repoName, team);
  if (!existsSync(dir)) return 0;
  let stopped = 0;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.pid')) continue;
    const pidStr = readFileSync(join(dir, file), 'utf-8').trim();
    const pid = parseInt(pidStr, 10);
    if (!isNaN(pid)) {
      try {
        process.kill(pid, 0); // check if alive
        process.kill(-pid); // kill entire process group (detached: true creates new group)
        stopped++;
      } catch { /* already dead */ }
    }
    try { unlinkSync(join(dir, file)); } catch { /* ignore */ }
  }
  return stopped;
}

/**
 * Launch agents as background processes without tmux.
 */
async function startHeadlessSession(team: string, options?: StartOptions): Promise<void> {
  const repoRoot = detectRepoRoot();
  const repoName = detectRepoName();
  const coderCount = discoverCoderCount(repoName, team);

  if (coderCount === 0) {
    console.error(chalk.red(`Team "${team}" is not initialized. Run: npx nightshift init --team ${team}`));
    process.exit(1);
  }

  const agents = buildAgentList(team, coderCount, repoRoot, repoName);
  const baseRunner = parseRunner(repoRoot);
  const citizenOverrides = loadCitizenConfig(repoRoot, team);
  const agentConfigs = loadAgentConfig(repoRoot, team);

  // Stop any existing headless agents and tmux sessions (reviewer S3)
  stopHeadlessAgents(repoName, team);
  const session = getSessionName(repoName, team);
  try { tmux(`kill-session -t "${session}"`); } catch { /* no tmux session */ }

  const vizPort = options?.port ?? DEFAULT_VIZ_PORT;
  const vizUrl = await setupVisualization(team, agents, repoRoot, repoName, citizenOverrides, vizPort);

  const statusDir = join(getTeamDir(repoName, team), 'status');
  const logDir = join(getTeamDir(repoName, team), 'logs');
  mkdirSync(statusDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });

  for (const agent of agents) {
    const config = resolveAgentConfig(agent.role, agentConfigs);
    const runner = buildRunnerForAgent(baseRunner, config);
    const statusFile = join(statusDir, agent.role);
    const logFile = join(logDir, `${agent.role}.log`);
    const logFd = openSync(logFile, 'a');

    const child = spawn('bash', [
      AGENT_LOOP_SCRIPT, agent.agent, agent.cwd,
      String(LOOP_INTERVAL), runner, statusFile,
    ], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });

    if (child.pid) {
      child.unref();
      writeAgentPid(repoName, team, agent.role, child.pid);
    }
    closeSync(logFd);
  }

  // Print summary
  console.log(chalk.bold(`
       _       __    __       __    _ ______
 ___  (_)___ _/ /_  / /______/ /_  (_) __/ /_
/ _ \\/ / __ \`/ __ \\/ __/ ___/ __ \\/ / /_/ __/
/ / / / / /_/ / / / / /_(__  ) / / / / __/ /_
/_/ /_/_/\\__, /_/ /_/\\__/____/_/ /_/_/_/  \\__/
        /____/`));
  console.log(chalk.dim(`  Started ${agents.length} agents in headless mode`));
  console.log(chalk.dim(`  Runner: ${baseRunner}`));
  if (vizUrl) {
    console.log(chalk.dim(`  Visualization: ${vizUrl}`));
  }
  console.log('');
  console.log(chalk.bold('  Agents:'));
  for (const a of agents) {
    const config = resolveAgentConfig(a.role, agentConfigs);
    const model = config.model ? chalk.dim(` (${config.model})`) : '';
    console.log(`    ${a.role.padEnd(10)} → @${a.agent}${model}`);
  }
  console.log('');
  console.log(chalk.dim(`  Logs: ${logDir}/`));
  console.log(chalk.dim(`  Stop: npx nightshift stop --team ${team}`));
  console.log('');
}

/**
 * Launch all agents for a team.
 * Dispatches to headless or tmux mode based on options.
 */
export async function startSession(team: string, options?: StartOptions): Promise<void> {
  if (options?.headless) {
    return startHeadlessSession(team, options);
  }

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
  const baseRunner = parseRunner(repoRoot);
  const citizenOverrides = loadCitizenConfig(repoRoot, team);
  const agentConfigs = loadAgentConfig(repoRoot, team);

  // Stop any existing headless agents (reviewer S3)
  stopHeadlessAgents(repoName, team);

  const vizPort = options?.port ?? DEFAULT_VIZ_PORT;
  const vizUrl = await setupVisualization(team, agents, repoRoot, repoName, citizenOverrides, vizPort);

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

  const statusDir = join(getTeamDir(repoName, team), 'status');

  tmux(`set-window-option -t "${session}" pane-border-status top`);
  tmux(`set-window-option -t "${session}" pane-border-format "#[#{@agent_color},bold] #{@agent_label} #[default] #(${STATUS_SCRIPT} #{@status_file} ${LOOP_INTERVAL})"`);
  tmux(`set-option -t "${session}" status-interval 10`);

  const allPanes = [...sidebar, ...coders];
  for (let i = 0; i < allPanes.length; i++) {
    const a = allPanes[i];
    const agentConfig = resolveAgentConfig(a.role, agentConfigs);
    const modelSuffix = agentConfig.model ? ` [${agentConfig.model}]` : '';
    const resolved = resolveCitizenProps(a.role, citizenOverrides);
    const color = hexToTmuxStyle(resolved.color);
    const statusFile = join(statusDir, a.role);
    tmux(`set-option -p -t "${session}:0.${i}" @agent_label "${a.role}${modelSuffix}  ·  /loop 15m @${a.agent}"`);
    tmux(`set-option -p -t "${session}:0.${i}" @agent_color "${color}"`);
    tmux(`set-option -p -t "${session}:0.${i}" @status_file "${statusFile}"`);
  }

  // Launch runner in each pane with per-agent config
  for (let i = 0; i < allPanes.length; i++) {
    const config = resolveAgentConfig(allPanes[i].role, agentConfigs);
    const runner = buildRunnerForAgent(baseRunner, config);
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
  console.log(chalk.dim(`  Runner: ${baseRunner}`));
  if (vizUrl) {
    console.log(chalk.dim(`  Visualization: ${vizUrl}`));
    try {
      execSync(`open "${vizUrl}"`, { stdio: 'pipe' });
    } catch { /* non-macOS or open not available */ }
  }
  console.log('');
  console.log(chalk.bold('  Agents:'));
  for (const a of agents) {
    const config = resolveAgentConfig(a.role, agentConfigs);
    const model = config.model ? chalk.dim(` (${config.model})`) : '';
    console.log(`    ${a.role.padEnd(10)} → @${a.agent}${model}`);
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

  // Stop headless agents (if any)
  const headlessStopped = stopHeadlessAgents(repoName, team);
  if (headlessStopped > 0) {
    console.log(chalk.green(`Stopped ${headlessStopped} headless agent(s).`));
  }

  // Only stop the global server if no other nightshift sessions are running (across all repos)
  const sessionPrefix = 'nightshift-';
  try {
    const sessions = execSync('tmux list-sessions -F "#{session_name}"', { encoding: 'utf-8' });
    const otherSessions = sessions.split('\n').map(s => s.trim()).filter(s => s.startsWith(sessionPrefix) && s !== session);
    if (otherSessions.length === 0) {
      stopAgentville();
    }
  } catch {
    // No tmux server running — safe to stop
    stopAgentville();
  }

  try {
    tmux(`kill-session -t "${session}"`);
    console.log(chalk.green(`Stopped session: ${session}`));
  } catch {
    console.log(chalk.dim(`No active session: ${session}`));
  }
}
