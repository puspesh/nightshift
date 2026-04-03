import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { getTeamDir, getStatusDir } from './worktrees.js';
import { detectRepoRoot, detectRepoName, detectMainBranch } from './detect.js';
import { parseTeamConfig, expandAgentInstances } from './team-config.js';
import type { TeamConfig } from './team-config.js';
import { getPresetDir } from './copy.js';
import { startServer, waitForServer, registerAgents, stopServer } from './visualize.js';
import { generateWorldConfig, mergeWorldConfig } from './world-config.js';
import { installHooks } from './hooks.js';
import { loadCitizenConfig, resolveCitizenProps, hexToTmuxStyle } from './citizen-config.js';
import { resolveAgentConfig, buildRunnerForAgent } from './agent-config.js';
import type { AgentEntry, StartOptions, CitizenOverrides } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATUS_SCRIPT = join(__dirname, '..', 'bin', 'ns-status.sh');
const DEFAULT_RUNNER = 'claude --dangerously-skip-permissions';
const LOOP_INTERVAL = 900; // 15 minutes in seconds
const PIPELINE_PROMPT = 'Start your pipeline cycle.';

/** POSIX-safe single-quote for shell args. */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

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
 * Build agent list from team.yaml config.
 * Uses worktree flag from agent definition to determine cwd.
 */
export function buildAgentListFromConfig(
  config: TeamConfig,
  repoRoot: string,
  repoName: string,
  overrides?: Record<string, number>,
): AgentEntry[] {
  const teamDir = join(homedir(), '.nightshift', repoName, config.name);
  const expanded = expandAgentInstances(config, overrides);

  return expanded.map(ea => ({
    role: ea.role,
    agent: ea.agent,
    cwd: ea.definition.worktree === false
      ? repoRoot
      : join(teamDir, 'worktrees', ea.role),
  }));
}

/**
 * Try to load team.yaml for a team.
 * Checks .claude/nightshift/teams/<team>/team.yaml first, then presets/<team>/team.yaml.
 * Returns null if team.yaml doesn't exist.
 */
export function loadTeamConfig(team: string, repoRoot: string): TeamConfig | null {
  // Check repo-local override first
  const localPath = join(repoRoot, '.claude', 'nightshift', 'teams', team, 'team.yaml');
  if (existsSync(localPath)) {
    return parseTeamConfig(localPath);
  }
  // Fall back to preset
  const presetPath = join(getPresetDir(team), 'team.yaml');
  if (existsSync(presetPath)) {
    return parseTeamConfig(presetPath);
  }
  return null;
}

/**
 * Verify `init` has been run for this team by checking critical artifacts:
 * agent profiles in ~/.claude/agents/ and worktrees for worktree agents.
 *
 * team.yaml can resolve from presets/ even when `init` has never run, so
 * team.yaml existence alone is NOT a sufficient signal.
 *
 * Returns the list of missing artifact paths; empty if fully initialized.
 */
export function checkTeamInitialized(
  teamConfig: TeamConfig,
  repoName: string,
): string[] {
  const missing: string[] = [];
  const expanded = expandAgentInstances(teamConfig);
  const agentsDir = join(homedir(), '.claude', 'agents');
  const teamDir = getTeamDir(repoName, teamConfig.name);

  for (const entry of expanded) {
    const profilePath = join(agentsDir, `${entry.agent}.md`);
    if (!existsSync(profilePath)) {
      missing.push(`agent profile: ~/.claude/agents/${entry.agent}.md`);
    }
    if (entry.definition.worktree !== false) {
      const worktreePath = join(teamDir, 'worktrees', entry.role);
      if (!existsSync(worktreePath)) {
        missing.push(`worktree: ${worktreePath}`);
      }
    }
  }

  return missing;
}

/**
 * Exit with a helpful error if the team isn't initialized.
 * Called at the top of every `start` path.
 */
function requireInitialized(team: string, teamConfig: TeamConfig, repoName: string): void {
  const missing = checkTeamInitialized(teamConfig, repoName);
  if (missing.length === 0) return;

  console.error(chalk.red(`Team "${team}" has not been initialized for this repo.`));
  console.error(chalk.red('  Missing:'));
  for (const m of missing.slice(0, 8)) {
    console.error(chalk.red(`    - ${m}`));
  }
  if (missing.length > 8) {
    console.error(chalk.red(`    …and ${missing.length - 8} more`));
  }
  console.error('');
  console.error(chalk.yellow(`  Run: npx nightshift init --team ${team}`));
  process.exit(1);
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
    const baseWorldDir = join(__dirname, '..', 'worlds', 'nightshift');
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

    const coreDir = join(__dirname, 'miniverse', 'core');
    mkdirSync(join(miniverseDir, '..', 'core'), { recursive: true });
    if (existsSync(join(coreDir, 'miniverse-core.js'))) {
      execSync(`cp "${coreDir}/miniverse-core.js" "${join(miniverseDir, '..', 'core')}/" 2>/dev/null || true`, { stdio: 'pipe' });
    }

    stopServer();
    const result = startServer(vizPort, miniverseDir);
    if (!result) {
      console.warn(chalk.yellow('  Warning: Could not start visualization server. Run `bun run build` first.'));
      throw new Error('Server start failed');
    }
    const healthy = await waitForServer(result.url, 10000);
    if (!healthy) {
      console.warn(chalk.yellow('  Warning: Visualization server did not become healthy'));
      throw new Error('Server health check failed');
    }

    await registerAgents(result.url, agents, team, citizenOverrides);
    vizUrl = result.url;

    installHooks(repoName, team, agents, result.url);
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

  const teamConfig = loadTeamConfig(team, repoRoot);
  if (!teamConfig) {
    console.error(chalk.red(`Team "${team}" not found — no team.yaml in repo or presets.`));
    console.error(chalk.yellow(`  Run: npx nightshift init --team ${team}`));
    process.exit(1);
  }
  requireInitialized(team, teamConfig, repoName);

  const agents = buildAgentListFromConfig(teamConfig, repoRoot, repoName);
  const agentDefs = teamConfig.agents;

  const baseRunner = parseRunner(repoRoot);
  const citizenOverrides = loadCitizenConfig(repoRoot, team);

  // Stop any existing headless agents and tmux sessions (reviewer S3)
  stopHeadlessAgents(repoName, team);
  const session = getSessionName(repoName, team);
  try { tmux(`kill-session -t "${session}"`); } catch { /* no tmux session */ }

  const vizPort = options?.port ?? DEFAULT_VIZ_PORT;
  const vizUrl = await setupVisualization(team, agents, repoRoot, repoName, citizenOverrides, vizPort);

  const statusDir = getStatusDir(repoName, team);
  const teamDir = getTeamDir(repoName, team);
  const logDir = join(teamDir, 'logs');
  const costsFile = join(teamDir, 'costs.jsonl');
  mkdirSync(logDir, { recursive: true });

  for (const agent of agents) {
    const config = resolveAgentConfig(agent.role, agentDefs);
    const runner = buildRunnerForAgent(baseRunner, config, agent.agent);
    const statusFile = join(statusDir, agent.role);
    const logFile = join(logDir, `${agent.role}.log`);
    const logFd = openSync(logFile, 'a');

    const child = spawn('bash', [
      AGENT_LOOP_SCRIPT, agent.cwd,
      String(LOOP_INTERVAL), runner, statusFile, PIPELINE_PROMPT,
      costsFile, agent.agent,
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
    const def = resolveAgentConfig(a.role, agentDefs);
    const model = def?.model ? chalk.dim(` (${def.model})`) : '';
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

  const teamConfig = loadTeamConfig(team, repoRoot);
  if (!teamConfig) {
    console.error(chalk.red(`Team "${team}" not found — no team.yaml in repo or presets.`));
    console.error(chalk.yellow(`  Run: npx nightshift init --team ${team}`));
    process.exit(1);
  }
  requireInitialized(team, teamConfig, repoName);

  const agents = buildAgentListFromConfig(teamConfig, repoRoot, repoName);
  const agentDefs = teamConfig.agents;

  const session = getSessionName(repoName, team);
  const baseRunner = parseRunner(repoRoot);
  const citizenOverrides = loadCitizenConfig(repoRoot, team);

  // Stop any existing headless agents (reviewer S3)
  stopHeadlessAgents(repoName, team);

  const vizPort = options?.port ?? DEFAULT_VIZ_PORT;
  const vizUrl = await setupVisualization(team, agents, repoRoot, repoName, citizenOverrides, vizPort);

  // Split agents into sidebar (non-scalable) and main column (scalable)
  const scalableRoles = new Set(
    Object.entries(teamConfig.agents)
      .filter(([, def]) => def.scalable)
      .map(([name]) => name)
  );
  const sidebar = agents.filter(a => {
    const baseRole = a.role.replace(/-\d+$/, '');
    return !scalableRoles.has(baseRole);
  });
  const mainColumn = agents.filter(a => {
    const baseRole = a.role.replace(/-\d+$/, '');
    return scalableRoles.has(baseRole);
  });

  // Kill existing session if any
  try {
    tmux(`kill-session -t "${session}"`);
  } catch { /* no existing session */ }

  // Determine the first agent for session creation
  const firstAgent = sidebar[0] ?? mainColumn[0];
  if (!firstAgent) {
    console.error(chalk.red('No agents to start for this team.'));
    process.exit(1);
  }

  // Build per-pane shell command (bypasses user's interactive shell/.zshrc).
  // Wrapped via `sh -c` so panes stay open for inspection when claude exits.
  // Quoted with shellQuote so runner content from repo.md can't trigger shell
  // expansion in the outer execSync layer.
  const paneCommand = (p: AgentEntry): string => {
    const config = resolveAgentConfig(p.role, agentDefs);
    const runner = buildRunnerForAgent(baseRunner, config, p.agent);
    // POSIX-portable: `read` waits for Enter (portable across bash/zsh/dash).
    const body = `${runner}; echo; echo '[agent exited - press Enter to close]'; read _`;
    return shellQuote(body);
  };

  // Create session — first pane launches claude directly (no interactive shell)
  tmux(`new-session -d -s "${session}" -c "${firstAgent.cwd}" ${paneCommand(firstAgent)}`);

  if (sidebar.length > 0 && mainColumn.length > 0) {
    // Split into left (30%) and right (70%) columns
    tmux(`split-window -h -t "${session}:0.0" -l 70% -c "${mainColumn[0].cwd}" ${paneCommand(mainColumn[0])}`);
  }

  // Split left column into N sidebar panes dynamically.
  // After each split, tmux renumbers panes in visual order.
  // Splitting pane X creates a new pane at X+1 (bottom portion).
  // Next iteration targets X+1 (the larger bottom) to subdivide it further.
  for (let i = 1; i < sidebar.length; i++) {
    const remaining = sidebar.length - i;
    const pct = Math.floor(100 * remaining / (remaining + 1));
    tmux(`split-window -v -t "${session}:0.${i - 1}" -l ${pct}% -c "${sidebar[i].cwd}" ${paneCommand(sidebar[i])}`);
  }

  // Split right column into N main column panes (same renumbering logic)
  if (mainColumn.length > 1) {
    const rightBase = sidebar.length > 0 ? sidebar.length : 0;
    for (let i = 1; i < mainColumn.length; i++) {
      const remaining = mainColumn.length - i;
      const pct = Math.floor(100 * remaining / (remaining + 1));
      tmux(`split-window -v -t "${session}:0.${rightBase + i - 1}" -l ${pct}% -c "${mainColumn[i].cwd}" ${paneCommand(mainColumn[i])}`);
    }
  }

  const statusDir = getStatusDir(repoName, team);

  tmux(`set-window-option -t "${session}" pane-border-status top`);
  tmux(`set-window-option -t "${session}" pane-border-format "#[#{@agent_color},bold] #{@agent_label} #[default] #(${STATUS_SCRIPT} #{@status_file} ${LOOP_INTERVAL})"`);
  tmux(`set-option -t "${session}" status-interval 10`);

  const nowTs = Math.floor(Date.now() / 1000);
  const allPanes = [...sidebar, ...mainColumn];
  for (let i = 0; i < allPanes.length; i++) {
    const a = allPanes[i];
    const agentDef = resolveAgentConfig(a.role, agentDefs);
    const modelSuffix = agentDef?.model ? ` [${agentDef.model}]` : '';
    const resolved = resolveCitizenProps(a.role, citizenOverrides);
    const color = hexToTmuxStyle(resolved.color);
    const statusFile = join(statusDir, a.role);
    // Pre-initialize status file with 'ready' state so pane border shows fresh
    // status on session start (overwrites any stale state from a prior session).
    // Agent will update to working/idle once it starts running cycles.
    writeFileSync(statusFile, `ready|${nowTs}|`);
    tmux(`set-option -p -t "${session}:0.${i}" @agent_label "${a.role}${modelSuffix}"`);
    tmux(`set-option -p -t "${session}:0.${i}" @agent_color "${color}"`);
    tmux(`set-option -p -t "${session}:0.${i}" @status_file "${statusFile}"`);
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
    const def = resolveAgentConfig(a.role, agentDefs);
    const model = def?.model ? chalk.dim(` (${def.model})`) : '';
    console.log(`    ${a.role.padEnd(10)} → @${a.agent}${model}`);
  }
  console.log('');
  console.log(chalk.dim(`  In each pane, type: /loop 15m ${PIPELINE_PROMPT}`));
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
      stopServer();
    }
  } catch {
    // No tmux server running — safe to stop
    stopServer();
  }

  try {
    tmux(`kill-session -t "${session}"`);
    console.log(chalk.green(`Stopped session: ${session}`));
  } catch {
    console.log(chalk.dim(`No active session: ${session}`));
  }
}
