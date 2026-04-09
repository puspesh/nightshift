import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getSessionName, buildAgentList, parseRunner, getHeadlessPidDir, writeAgentPid, stopHeadlessAgents } from '../lib/start.js';

describe('getSessionName', () => {
  it('returns nightshift-<repo>-<team>', () => {
    assert.equal(getSessionName('myapp', 'dev'), 'nightshift-myapp-dev');
  });

  it('handles hyphenated names', () => {
    assert.equal(getSessionName('my-app', 'team-a'), 'nightshift-my-app-team-a');
  });
});

describe('buildAgentList', () => {
  it('returns 5 agents for 1 coder', () => {
    const agents = buildAgentList('dev', 1, '/repo', 'myapp');
    assert.equal(agents.length, 5);
    assert.equal(agents[0].role, 'producer');
    assert.equal(agents[1].role, 'planner');
    assert.equal(agents[2].role, 'reviewer');
    assert.equal(agents[3].role, 'coder-1');
    assert.equal(agents[4].role, 'tester');
  });

  it('returns 7 agents for 3 coders', () => {
    const agents = buildAgentList('dev', 3, '/repo', 'myapp');
    assert.equal(agents.length, 7);
    assert.equal(agents[3].role, 'coder-1');
    assert.equal(agents[4].role, 'coder-2');
    assert.equal(agents[5].role, 'coder-3');
    assert.equal(agents[6].role, 'tester');
  });

  it('returns 8 agents for 4 coders', () => {
    const agents = buildAgentList('dev', 4, '/repo', 'myapp');
    assert.equal(agents.length, 8);
  });

  it('sets correct agent names', () => {
    const agents = buildAgentList('dev', 1, '/repo', 'myapp');
    assert.equal(agents[0].agent, 'ns-dev-producer');
    assert.equal(agents[1].agent, 'ns-dev-planner');
    assert.equal(agents[2].agent, 'ns-dev-reviewer');
    assert.equal(agents[3].agent, 'ns-dev-coder-1');
    assert.equal(agents[4].agent, 'ns-dev-tester');
  });

  it('producer runs from repoRoot', () => {
    const agents = buildAgentList('dev', 1, '/my/repo', 'myapp');
    assert.equal(agents[0].cwd, '/my/repo');
  });

  it('other agents run from worktree paths', () => {
    const agents = buildAgentList('dev', 1, '/repo', 'myapp');
    assert.ok(agents[1].cwd.includes('worktrees/planner'));
    assert.ok(agents[2].cwd.includes('worktrees/reviewer'));
    assert.ok(agents[3].cwd.includes('worktrees/coder-1'));
    assert.ok(agents[4].cwd.includes('worktrees/tester'));
  });

  it('separates sidebar and coder agents correctly', () => {
    const agents = buildAgentList('dev', 2, '/repo', 'myapp');
    const sidebar = agents.filter(a => !a.role.startsWith('coder-'));
    const coders = agents.filter(a => a.role.startsWith('coder-'));
    assert.equal(sidebar.length, 4);
    assert.equal(coders.length, 2);
    // sidebar order: producer, planner, reviewer, tester
    assert.deepEqual(sidebar.map(a => a.role), ['producer', 'planner', 'reviewer', 'tester']);
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
    const pidDir = getHeadlessPidDir(repoName, 'dev');
    try {
      writeAgentPid(repoName, 'dev', 'producer', 99999);
      const content = readFileSync(join(pidDir, 'producer.pid'), 'utf-8');
      assert.equal(content, '99999');
    } finally {
      rmSync(pidDir, { recursive: true, force: true });
    }
  });

  it('writeAgentPid creates pid directory if missing', () => {
    const repoName = `test-pid-mkdir-${Date.now()}`;
    const pidDir = getHeadlessPidDir(repoName, 'dev');
    try {
      assert.ok(!existsSync(pidDir));
      writeAgentPid(repoName, 'dev', 'planner', 12345);
      assert.ok(existsSync(pidDir));
      assert.ok(existsSync(join(pidDir, 'planner.pid')));
    } finally {
      rmSync(pidDir, { recursive: true, force: true });
    }
  });

  it('stopHeadlessAgents cleans up PID files for dead processes', () => {
    const repoName = `test-pid-stop-${Date.now()}`;
    const pidDir = getHeadlessPidDir(repoName, 'dev');
    try {
      // Write a PID that doesn't correspond to a running process
      writeAgentPid(repoName, 'dev', 'reviewer', 2147483647);
      assert.ok(existsSync(join(pidDir, 'reviewer.pid')));
      const stopped = stopHeadlessAgents(repoName, 'dev');
      // Process doesn't exist, so stopped count is 0 but file should be cleaned up
      assert.equal(stopped, 0);
      assert.ok(!existsSync(join(pidDir, 'reviewer.pid')));
    } finally {
      rmSync(pidDir, { recursive: true, force: true });
    }
  });

  it('stopHeadlessAgents ignores non-.pid files', () => {
    const repoName = `test-pid-ignore-${Date.now()}`;
    const pidDir = getHeadlessPidDir(repoName, 'dev');
    try {
      mkdirSync(pidDir, { recursive: true });
      writeFileSync(join(pidDir, 'notes.txt'), 'not a pid');
      const stopped = stopHeadlessAgents(repoName, 'dev');
      assert.equal(stopped, 0);
      // Non-pid file should still exist
      assert.ok(existsSync(join(pidDir, 'notes.txt')));
    } finally {
      rmSync(pidDir, { recursive: true, force: true });
    }
  });

  it('stopHeadlessAgents handles invalid PID content gracefully', () => {
    const repoName = `test-pid-invalid-${Date.now()}`;
    const pidDir = getHeadlessPidDir(repoName, 'dev');
    try {
      mkdirSync(pidDir, { recursive: true });
      writeFileSync(join(pidDir, 'broken.pid'), 'not-a-number');
      const stopped = stopHeadlessAgents(repoName, 'dev');
      assert.equal(stopped, 0);
      // File should still be cleaned up
      assert.ok(!existsSync(join(pidDir, 'broken.pid')));
    } finally {
      rmSync(pidDir, { recursive: true, force: true });
    }
  });
});
