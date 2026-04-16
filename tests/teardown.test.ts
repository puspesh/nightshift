import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';
import { discoverAgentEntries, cleanClaudeMd } from '../lib/teardown.js';

describe('discoverAgentEntries', () => {
  const repoName = `teardown-test-${Date.now()}`;
  // Use a team name that doesn't match any preset, so team.yaml merge doesn't interfere
  const team = 'testteam';
  const nightshiftDir = join(homedir(), '.nightshift', repoName, team);
  const tmp = join(tmpdir(), `ns-teardown-${Date.now()}`);

  afterEach(() => {
    try { rmSync(nightshiftDir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(join(homedir(), '.nightshift', repoName), { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('discovers roles from worktree directories', () => {
    const worktreesDir = join(nightshiftDir, 'worktrees');
    mkdirSync(join(worktreesDir, 'planner'), { recursive: true });
    mkdirSync(join(worktreesDir, 'coder-1'), { recursive: true });
    mkdirSync(join(worktreesDir, 'reviewer'), { recursive: true });

    const entries = discoverAgentEntries(repoName, team, tmp);
    const roles = entries.map(e => e.role).sort();
    assert.deepEqual(roles, ['coder-1', 'planner', 'reviewer']);
  });

  it('sets correct agent names', () => {
    const worktreesDir = join(nightshiftDir, 'worktrees');
    mkdirSync(join(worktreesDir, 'planner'), { recursive: true });

    const entries = discoverAgentEntries(repoName, team, tmp);
    assert.equal(entries[0].agent, `ns-${team}-planner`);
  });

  it('sets worktree path as cwd for worktree agents', () => {
    const worktreesDir = join(nightshiftDir, 'worktrees');
    mkdirSync(join(worktreesDir, 'tester'), { recursive: true });

    const entries = discoverAgentEntries(repoName, team, tmp);
    assert.ok(entries[0].cwd.includes('worktrees/tester'));
  });

  it('returns empty array when no worktrees or agents exist', () => {
    const entries = discoverAgentEntries(repoName, team, tmp);
    assert.equal(entries.length, 0);
  });

  it('deduplicates roles found in both worktrees and agent files', () => {
    // Create worktree dir
    const worktreesDir = join(nightshiftDir, 'worktrees');
    mkdirSync(join(worktreesDir, 'planner'), { recursive: true });

    // Create agent file for same role
    const agentsDir = join(homedir(), '.claude', 'agents');
    const agentFile = join(agentsDir, `ns-${team}-planner.md`);
    const existed = existsSync(agentFile);

    if (!existed) {
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(agentFile, '# test');
    }

    try {
      const entries = discoverAgentEntries(repoName, team, tmp);
      const planners = entries.filter(e => e.role === 'planner');
      assert.equal(planners.length, 1, 'Should not duplicate planner');
    } finally {
      if (!existed) {
        try { rmSync(agentFile); } catch { /* ignore */ }
      }
    }
  });
});

describe('cleanClaudeMd', () => {
  const tmp = join(tmpdir(), `ns-claude-md-${Date.now()}`);

  afterEach(() => {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('removes team subsection from CLAUDE.md', () => {
    mkdirSync(tmp, { recursive: true });
    const claudeMd = join(tmp, 'CLAUDE.md');
    writeFileSync(claudeMd, `# Project

## Nightshift Teams

### dev

Agent roster:
- producer
- coder

### ops

- deployer
`);

    cleanClaudeMd(tmp, 'dev');
    const result = readFileSync(claudeMd, 'utf-8');
    assert.ok(!result.includes('### dev'));
    assert.ok(result.includes('### ops'));
  });

  it('removes entire section when last team removed', () => {
    mkdirSync(tmp, { recursive: true });
    const claudeMd = join(tmp, 'CLAUDE.md');
    writeFileSync(claudeMd, `# Project

## Nightshift Teams

### dev

Some content
`);

    cleanClaudeMd(tmp, 'dev');
    const result = readFileSync(claudeMd, 'utf-8');
    assert.ok(!result.includes('## Nightshift Teams'));
  });

  it('is a no-op when CLAUDE.md does not exist', () => {
    mkdirSync(tmp, { recursive: true });
    cleanClaudeMd(tmp, 'dev'); // should not throw
  });
});