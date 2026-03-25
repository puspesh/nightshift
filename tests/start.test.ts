import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getSessionName, buildAgentList, parseRunner, getHeadlessPidDir, stopHeadlessAgents } from '../lib/start.js';

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
  const pidTmp = join(tmpdir(), `ns-headless-pid-test-${Date.now()}`);

  afterEach(() => {
    try { rmSync(pidTmp, { recursive: true, force: true }); } catch { /* */ }
  });

  it('getHeadlessPidDir returns expected path', () => {
    const dir = getHeadlessPidDir('myapp', 'dev');
    assert.ok(dir.includes('.nightshift/myapp/dev/pids'));
  });

  it('stopHeadlessAgents returns 0 when no PID directory exists', () => {
    const stopped = stopHeadlessAgents('nonexistent-repo-xyz', 'dev');
    assert.equal(stopped, 0);
  });

  it('PID files can be created and read at expected path', () => {
    const pidDir = join(pidTmp, 'pids');
    mkdirSync(pidDir, { recursive: true });
    writeFileSync(join(pidDir, 'producer.pid'), '12345');
    const content = readFileSync(join(pidDir, 'producer.pid'), 'utf-8');
    assert.equal(content, '12345');
    assert.ok(existsSync(join(pidDir, 'producer.pid')));
  });
});
