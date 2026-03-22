import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  getTeamDir,
  createWorktrees,
  removeWorktrees,
  discoverCoderCount,
  discoverTeams,
  getNightshiftDir,
} from '../lib/worktrees.js';

describe('getTeamDir', () => {
  it('returns ~/.nightshift/<repoName>/<team>/', () => {
    const result = getTeamDir('my-repo', 'dev');
    assert.equal(result, join(homedir(), '.nightshift', 'my-repo', 'dev'));
  });

  it('handles different team names', () => {
    const result = getTeamDir('my-repo', 'content');
    assert.ok(result.endsWith('my-repo/content'));
  });
});

describe('createWorktrees + removeWorktrees', () => {
  const repoName = `nightshift-wt-test-${Date.now()}`;
  const team = 'dev';
  const roles = ['planner', 'reviewer', 'coder-1', 'tester'];
  let tmp;
  let clonedRepo;
  let origCwd;

  beforeEach(() => {
    origCwd = process.cwd();
    tmp = mkdtempSync(join(tmpdir(), 'nightshift-test-'));

    // Create a bare repo to act as "origin"
    const bareRepo = join(tmp, 'origin.git');
    execSync(`git init --bare "${bareRepo}"`, { stdio: 'pipe' });

    // Clone it to get a working repo with a remote
    clonedRepo = join(tmp, 'repo');
    execSync(`git clone "${bareRepo}" "${clonedRepo}"`, { stdio: 'pipe' });
    execSync('git commit --allow-empty -m "init"', {
      cwd: clonedRepo,
      stdio: 'pipe',
    });
    execSync('git push origin main', { cwd: clonedRepo, stdio: 'pipe' });

    process.chdir(clonedRepo);
  });

  afterEach(() => {
    process.chdir(origCwd);

    // Clean up worktrees and branches from the cloned repo
    const teamDir = getTeamDir(repoName, team);
    for (const role of roles) {
      const wt = join(teamDir, 'worktrees', role);
      if (existsSync(wt)) {
        try {
          execSync(`git worktree remove "${wt}" --force`, {
            cwd: clonedRepo,
            stdio: 'pipe',
          });
        } catch {
          /* ignore */
        }
      }
      try {
        execSync(`git branch -D _ns/${team}/${role}`, {
          cwd: clonedRepo,
          stdio: 'pipe',
        });
      } catch {
        /* ignore */
      }
    }

    // Clean up ~/.nightshift/<repoName>
    const nightshiftDir = getNightshiftDir(repoName);
    if (existsSync(nightshiftDir)) {
      rmSync(nightshiftDir, { recursive: true, force: true });
    }

    rmSync(tmp, { recursive: true, force: true });
  });

  it('creates worktrees for all roles', () => {
    createWorktrees(repoName, team, roles, 'main');

    const dir = getTeamDir(repoName, team);
    for (const role of roles) {
      assert.ok(
        existsSync(join(dir, 'worktrees', role)),
        `worktree for ${role} should exist`
      );
    }
  });

  it('creates locks directory', () => {
    createWorktrees(repoName, team, roles, 'main');
    const dir = getTeamDir(repoName, team);
    assert.ok(existsSync(join(dir, 'locks')));
  });

  it('creates _ns/dev/* branches', () => {
    createWorktrees(repoName, team, roles, 'main');

    for (const role of roles) {
      const result = execSync(
        `git rev-parse --verify _ns/${team}/${role}`,
        {
          cwd: clonedRepo,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );
      assert.ok(
        result.trim().length > 0,
        `_ns/${team}/${role} branch should exist`
      );
    }
  });

  it('is idempotent (skips existing worktrees)', () => {
    createWorktrees(repoName, team, roles, 'main');
    assert.doesNotThrow(() =>
      createWorktrees(repoName, team, roles, 'main')
    );
  });

  it('removeWorktrees cleans up worktree directories', () => {
    createWorktrees(repoName, team, roles, 'main');
    removeWorktrees(repoName, team);

    const dir = getTeamDir(repoName, team);
    for (const role of roles) {
      assert.ok(
        !existsSync(join(dir, 'worktrees', role)),
        `worktree for ${role} should be removed`
      );
    }
  });
});

describe('discoverCoderCount', () => {
  const repoName = `nightshift-dc-test-${Date.now()}`;
  const team = 'dev';

  afterEach(() => {
    const nightshiftDir = getNightshiftDir(repoName);
    if (existsSync(nightshiftDir)) {
      rmSync(nightshiftDir, { recursive: true, force: true });
    }
  });

  it('returns 0 when no worktrees exist', () => {
    assert.equal(discoverCoderCount(repoName, team), 0);
  });

  it('counts coder-* directories', () => {
    const teamDir = getTeamDir(repoName, team);
    const wtDir = join(teamDir, 'worktrees');
    mkdirSync(join(wtDir, 'coder-1'), { recursive: true });
    mkdirSync(join(wtDir, 'coder-2'), { recursive: true });
    mkdirSync(join(wtDir, 'planner'), { recursive: true });

    assert.equal(discoverCoderCount(repoName, team), 2);
  });
});

describe('discoverTeams', () => {
  const repoName = `nightshift-dt-test-${Date.now()}`;

  afterEach(() => {
    const nightshiftDir = getNightshiftDir(repoName);
    if (existsSync(nightshiftDir)) {
      rmSync(nightshiftDir, { recursive: true, force: true });
    }
  });

  it('returns empty array when no teams exist', () => {
    assert.deepEqual(discoverTeams(repoName), []);
  });

  it('lists team directories', () => {
    const nightshiftDir = getNightshiftDir(repoName);
    mkdirSync(join(nightshiftDir, 'dev'), { recursive: true });
    mkdirSync(join(nightshiftDir, 'content'), { recursive: true });

    const teams = discoverTeams(repoName).sort();
    assert.deepEqual(teams, ['content', 'dev']);
  });
});
