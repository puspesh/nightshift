import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { getSessionName, buildAgentListFromConfig, loadTeamConfig, parseRunner, getHeadlessPidDir, writeAgentPid, stopHeadlessAgents, checkTeamInitialized, isTeamRunning } from '../lib/start.js';
import { resolveAgentConfig } from '../lib/agent-config.js';
import { parseTeamConfig, parseTeamConfigFromString } from '../lib/team-config.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PRESETS_DIR = join(__dirname, '..', '..', 'presets');

describe('getSessionName', () => {
  it('returns nightshift-<repo>-<team>', () => {
    assert.equal(getSessionName('myapp', 'dev'), 'nightshift-myapp-dev');
  });

  it('handles hyphenated names', () => {
    assert.equal(getSessionName('my-app', 'team-a'), 'nightshift-my-app-team-a');
  });
});

describe('parseRunner', () => {
  const tmp = join(tmpdir(), `ns-runner-test-${Date.now()}`);

  it('returns default when repo.md does not exist', () => {
    assert.equal(parseRunner('/nonexistent'), 'claude --dangerously-skip-permissions');
  });

  it('parses runner from repo.md', () => {
    const dir = join(tmp, 'a', '.claude', 'nightshift');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'repo.md'), `# Repo

## Runner

\`\`\`
claude --dangerously-skip-permissions --model sonnet
\`\`\`
`);
    assert.equal(parseRunner(join(tmp, 'a')), 'claude --dangerously-skip-permissions --model sonnet');
    rmSync(join(tmp, 'a'), { recursive: true, force: true });
  });

  it('returns default when no Runner section', () => {
    const dir = join(tmp, 'b', '.claude', 'nightshift');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'repo.md'), '# Repo\n\n## Commands\n');
    assert.equal(parseRunner(join(tmp, 'b')), 'claude --dangerously-skip-permissions');
    rmSync(join(tmp, 'b'), { recursive: true, force: true });
  });
});

describe('headless PID management', () => {
  it('getHeadlessPidDir returns expected path', () => {
    const dir = getHeadlessPidDir('myapp', 'dev');
    assert.ok(dir.includes('.nightshift/myapp/dev/pids'));
  });

  it('stopHeadlessAgents returns 0 when no PID directory exists', () => {
    const stopped = stopHeadlessAgents('nonexistent-repo-xyz', 'dev');
    assert.equal(stopped, 0);
  });

  it('writeAgentPid creates PID file with correct content', () => {
    // Use a unique repo name to avoid collisions with real data
    const repoName = `test-pid-write-${Date.now()}`;
    const repoDir = join(homedir(), '.nightshift', repoName);
    try {
      writeAgentPid(repoName, 'dev', 'producer', 99999);
      const pidDir = getHeadlessPidDir(repoName, 'dev');
      const content = readFileSync(join(pidDir, 'producer.pid'), 'utf-8');
      assert.equal(content, '99999');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('writeAgentPid creates pid directory if missing', () => {
    const repoName = `test-pid-mkdir-${Date.now()}`;
    const repoDir = join(homedir(), '.nightshift', repoName);
    try {
      const pidDir = getHeadlessPidDir(repoName, 'dev');
      assert.ok(!existsSync(pidDir));
      writeAgentPid(repoName, 'dev', 'planner', 12345);
      assert.ok(existsSync(pidDir));
      assert.ok(existsSync(join(pidDir, 'planner.pid')));
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('stopHeadlessAgents cleans up PID files for dead processes', () => {
    const repoName = `test-pid-stop-${Date.now()}`;
    const repoDir = join(homedir(), '.nightshift', repoName);
    try {
      // Write a PID that doesn't correspond to a running process
      writeAgentPid(repoName, 'dev', 'reviewer', 2147483647);
      const pidDir = getHeadlessPidDir(repoName, 'dev');
      assert.ok(existsSync(join(pidDir, 'reviewer.pid')));
      const stopped = stopHeadlessAgents(repoName, 'dev');
      // Process doesn't exist, so stopped count is 0 but file should be cleaned up
      assert.equal(stopped, 0);
      assert.ok(!existsSync(join(pidDir, 'reviewer.pid')));
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('stopHeadlessAgents ignores non-.pid files', () => {
    const repoName = `test-pid-ignore-${Date.now()}`;
    const repoDir = join(homedir(), '.nightshift', repoName);
    try {
      const pidDir = getHeadlessPidDir(repoName, 'dev');
      mkdirSync(pidDir, { recursive: true });
      writeFileSync(join(pidDir, 'notes.txt'), 'not a pid');
      const stopped = stopHeadlessAgents(repoName, 'dev');
      assert.equal(stopped, 0);
      // Non-pid file should still exist
      assert.ok(existsSync(join(pidDir, 'notes.txt')));
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('stopHeadlessAgents handles invalid PID content gracefully', () => {
    const repoName = `test-pid-invalid-${Date.now()}`;
    const repoDir = join(homedir(), '.nightshift', repoName);
    try {
      const pidDir = getHeadlessPidDir(repoName, 'dev');
      mkdirSync(pidDir, { recursive: true });
      writeFileSync(join(pidDir, 'broken.pid'), 'not-a-number');
      const stopped = stopHeadlessAgents(repoName, 'dev');
      assert.equal(stopped, 0);
      // File should still be cleaned up
      assert.ok(!existsSync(join(pidDir, 'broken.pid')));
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('isTeamRunning', () => {
  it('returns false when no tmux and no PID dir', () => {
    const repoName = `test-running-none-${Date.now()}`;
    const result = isTeamRunning(repoName, 'dev');
    assert.equal(result, false);
  });

  it('returns true when headless PIDs exist with live processes', () => {
    const repoName = `test-running-alive-${Date.now()}`;
    const repoDir = join(homedir(), '.nightshift', repoName);
    try {
      // Use current process PID — guaranteed alive
      writeAgentPid(repoName, 'dev', 'producer', process.pid);
      const result = isTeamRunning(repoName, 'dev');
      assert.equal(result, true);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('returns false when headless PIDs exist but processes are dead', () => {
    const repoName = `test-running-dead-${Date.now()}`;
    const repoDir = join(homedir(), '.nightshift', repoName);
    try {
      // Use a PID that almost certainly doesn't exist
      writeAgentPid(repoName, 'dev', 'reviewer', 2147483647);
      const result = isTeamRunning(repoName, 'dev');
      assert.equal(result, false);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('returns false when PID dir exists but is empty', () => {
    const repoName = `test-running-empty-${Date.now()}`;
    const repoDir = join(homedir(), '.nightshift', repoName);
    try {
      const pidDir = getHeadlessPidDir(repoName, 'dev');
      mkdirSync(pidDir, { recursive: true });
      const result = isTeamRunning(repoName, 'dev');
      assert.equal(result, false);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('buildAgentListFromConfig', () => {
  const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));

  it('returns correct number of agents (6 with 2 default coders)', () => {
    const agents = buildAgentListFromConfig(config, '/repo', 'myapp');
    assert.equal(agents.length, 6);
  });

  it('worktree: false agents get repoRoot as cwd', () => {
    const agents = buildAgentListFromConfig(config, '/my/repo', 'myapp');
    const producer = agents.find(a => a.role === 'producer');
    assert.equal(producer?.cwd, '/my/repo');
  });

  it('worktree agents get worktree paths', () => {
    const agents = buildAgentListFromConfig(config, '/repo', 'myapp');
    const planner = agents.find(a => a.role === 'planner');
    assert.ok(planner?.cwd.includes('worktrees/planner'));
  });

  it('scalable overrides increase agent count', () => {
    const agents = buildAgentListFromConfig(config, '/repo', 'myapp', { coder: 3 });
    assert.equal(agents.length, 7);
    const coders = agents.filter(a => a.role.startsWith('coder-'));
    assert.equal(coders.length, 3);
  });

  it('agent names follow ns-<team>-<role> pattern', () => {
    const agents = buildAgentListFromConfig(config, '/repo', 'myapp');
    for (const a of agents) {
      assert.ok(a.agent.startsWith('ns-dev-'), `Expected ns-dev- prefix for ${a.agent}`);
    }
  });

  it('coder instances have numbered worktree paths', () => {
    const agents = buildAgentListFromConfig(config, '/repo', 'myapp');
    const coder1 = agents.find(a => a.role === 'coder-1');
    const coder2 = agents.find(a => a.role === 'coder-2');
    assert.ok(coder1?.cwd.includes('worktrees/coder-1'));
    assert.ok(coder2?.cwd.includes('worktrees/coder-2'));
  });

  it('splits agents into scalable and non-scalable groups', () => {
    const agents = buildAgentListFromConfig(config, '/repo', 'myapp');
    const scalableRoles = new Set(
      Object.entries(config.agents)
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

    // Dev team: producer, planner, reviewer, tester are non-scalable (sidebar)
    assert.equal(sidebar.length, 4);
    // Dev team: coder-1, coder-2 are scalable (main column)
    assert.equal(mainColumn.length, 2);
    // All agents accounted for
    assert.equal(sidebar.length + mainColumn.length, agents.length);
  });
});

describe('checkTeamInitialized', () => {
  // Minimal team.yaml: one worktree agent + one non-worktree agent.
  // Using a unique team name so ns-<team>-<role>.md paths don't collide with
  // real profiles in ~/.claude/agents/.
  function makeConfig(teamName: string) {
    return parseTeamConfigFromString(`
name: ${teamName}
description: test team
stages:
  - name: wip
    color: "ededed"
    meta: true
agents:
  producer:
    description: triages
    watches: [unlabeled]
    transitions:
      triage: wip
    tools: [Read, Bash]
    model: sonnet
    worktree: false
  planner:
    description: plans
    watches: [wip]
    transitions:
      done: wip
    tools: [Read, Bash]
    model: opus
`);
  }

  it('returns missing profile and worktree when nothing is installed', () => {
    const teamName = `test-init-check-none-${Date.now()}`;
    const repoName = `test-init-check-repo-none-${Date.now()}`;
    const config = makeConfig(teamName);

    const missing = checkTeamInitialized(config, repoName);

    // producer: profile missing (no worktree expected since worktree: false)
    // planner: profile + worktree missing
    assert.equal(missing.length, 3);
    assert.ok(missing.some(m => m.includes(`ns-${teamName}-producer.md`)));
    assert.ok(missing.some(m => m.includes(`ns-${teamName}-planner.md`)));
    assert.ok(missing.some(m => m.includes(`worktrees/planner`)));
    // producer has worktree: false → no worktree check
    assert.ok(!missing.some(m => m.includes(`worktrees/producer`)));
  });

  it('returns empty when all profiles and worktrees exist', () => {
    const teamName = `test-init-check-ok-${Date.now()}`;
    const repoName = `test-init-check-repo-ok-${Date.now()}`;
    const config = makeConfig(teamName);
    const agentsDir = join(homedir(), '.claude', 'agents');
    const teamDir = join(homedir(), '.nightshift', repoName, teamName);

    mkdirSync(agentsDir, { recursive: true });
    const producerProfile = join(agentsDir, `ns-${teamName}-producer.md`);
    const plannerProfile = join(agentsDir, `ns-${teamName}-planner.md`);
    const plannerWorktree = join(teamDir, 'worktrees', 'planner');

    try {
      writeFileSync(producerProfile, '---\nname: test\n---\n');
      writeFileSync(plannerProfile, '---\nname: test\n---\n');
      mkdirSync(plannerWorktree, { recursive: true });

      const missing = checkTeamInitialized(config, repoName);
      assert.deepEqual(missing, []);
    } finally {
      rmSync(producerProfile, { force: true });
      rmSync(plannerProfile, { force: true });
      rmSync(join(homedir(), '.nightshift', repoName), { recursive: true, force: true });
    }
  });

  it('reports only the missing artifacts when profiles exist but worktrees dont', () => {
    const teamName = `test-init-check-partial-${Date.now()}`;
    const repoName = `test-init-check-repo-partial-${Date.now()}`;
    const config = makeConfig(teamName);
    const agentsDir = join(homedir(), '.claude', 'agents');

    mkdirSync(agentsDir, { recursive: true });
    const producerProfile = join(agentsDir, `ns-${teamName}-producer.md`);
    const plannerProfile = join(agentsDir, `ns-${teamName}-planner.md`);

    try {
      writeFileSync(producerProfile, '---\nname: test\n---\n');
      writeFileSync(plannerProfile, '---\nname: test\n---\n');

      const missing = checkTeamInitialized(config, repoName);
      // Only the planner's worktree should be reported missing
      assert.equal(missing.length, 1);
      assert.ok(missing[0].includes('worktrees/planner'));
    } finally {
      rmSync(producerProfile, { force: true });
      rmSync(plannerProfile, { force: true });
    }
  });
});

describe('resolveAgentConfig with team.yaml agents', () => {
  it('resolves model config directly from team.yaml agents', () => {
    const config = parseTeamConfigFromString(`
name: dev
description: test
stages:
  - name: wip
    color: "AAAAAA"
    meta: true
agents:
  producer:
    description: test
    watches: [wip]
    transitions: {}
    tools: []
    model: claude-sonnet-4-20250514
    worktree: false
    reasoning_effort: medium
  coder:
    description: test
    watches: [wip]
    transitions: {}
    tools: []
    model: claude-opus-4-20250514
    scalable: true
    instances: 1
`);
    const producer = resolveAgentConfig('producer', config.agents);
    assert.equal(producer?.model, 'claude-sonnet-4-20250514');
    assert.equal(producer?.reasoning_effort, 'medium');
    const coder = resolveAgentConfig('coder', config.agents);
    assert.equal(coder?.model, 'claude-opus-4-20250514');
  });

  it('resolves coder-1 to coder base role', () => {
    const config = parseTeamConfigFromString(`
name: dev
description: test
stages:
  - name: wip
    color: "AAAAAA"
    meta: true
agents:
  coder:
    description: test
    watches: [wip]
    transitions: {}
    tools: []
    model: claude-opus-4-20250514
    scalable: true
    instances: 1
`);
    const coder1 = resolveAgentConfig('coder-1', config.agents);
    assert.equal(coder1?.model, 'claude-opus-4-20250514');
  });
});

describe('loadTeamConfig', () => {
  it('loads dev preset team.yaml', () => {
    // loadTeamConfig checks .claude/nightshift/teams/<team>/team.yaml first,
    // then falls back to presets/<team>/team.yaml
    // For testing, just verify it can find the preset
    const tmp = join(tmpdir(), `ns-load-config-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    try {
      const config = loadTeamConfig('dev', tmp);
      assert.ok(config);
      assert.equal(config!.name, 'dev');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns null for nonexistent team', () => {
    const config = loadTeamConfig('nonexistent-team-xyz', '/tmp');
    assert.equal(config, null);
  });
});
