import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import {
  detectRepoRoot,
  detectRepoName,
  detectMainBranch,
  detectPackageManager,
  detectLanguage,
  detectScripts,
  validateTeamName,
  detectRemote,
} from '../lib/detect.js';

let tmp;
let origCwd;

beforeEach(() => {
  origCwd = process.cwd();
  tmp = mkdtempSync(join(tmpdir(), 'nightshift-test-'));
  execSync('git init', { cwd: tmp, stdio: 'pipe' });
  execSync('git commit --allow-empty -m "init"', { cwd: tmp, stdio: 'pipe' });
  process.chdir(tmp);
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(tmp, { recursive: true, force: true });
});

describe('detectRepoRoot', () => {
  it('returns the repo root', () => {
    const root = detectRepoRoot();
    assert.equal(realpathSync(root), realpathSync(tmp));
  });

  it('throws outside a git repo', () => {
    const nonGit = mkdtempSync(join(tmpdir(), 'nightshift-nogit-'));
    process.chdir(nonGit);
    try {
      assert.throws(() => detectRepoRoot(), /not inside a git repository/i);
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });
});

describe('detectRepoName', () => {
  it('returns the basename of the repo root', () => {
    const name = detectRepoName();
    assert.equal(name, basename(realpathSync(tmp)));
  });
});

describe('detectMainBranch', () => {
  it('falls back to current branch when no remote', () => {
    const currentBranch = execSync('git branch --show-current', {
      cwd: tmp,
      encoding: 'utf-8',
    }).trim();
    const result = detectMainBranch();
    assert.equal(result, currentBranch);
  });
});

describe('detectPackageManager', () => {
  it('detects pnpm from pnpm-lock.yaml', () => {
    writeFileSync(join(tmp, 'pnpm-lock.yaml'), '');
    assert.equal(detectPackageManager(tmp), 'pnpm');
  });

  it('detects yarn from yarn.lock', () => {
    writeFileSync(join(tmp, 'yarn.lock'), '');
    assert.equal(detectPackageManager(tmp), 'yarn');
  });

  it('detects bun from bun.lockb', () => {
    writeFileSync(join(tmp, 'bun.lockb'), '');
    assert.equal(detectPackageManager(tmp), 'bun');
  });

  it('detects bun from bun.lock', () => {
    writeFileSync(join(tmp, 'bun.lock'), '');
    assert.equal(detectPackageManager(tmp), 'bun');
  });

  it('defaults to npm when no lockfile', () => {
    assert.equal(detectPackageManager(tmp), 'npm');
  });

  it('pnpm takes priority over yarn', () => {
    writeFileSync(join(tmp, 'pnpm-lock.yaml'), '');
    writeFileSync(join(tmp, 'yarn.lock'), '');
    assert.equal(detectPackageManager(tmp), 'pnpm');
  });
});

describe('detectLanguage', () => {
  it('detects javascript from package.json', () => {
    writeFileSync(join(tmp, 'package.json'), '{}');
    assert.equal(detectLanguage(tmp), 'javascript');
  });

  it('detects go from go.mod', () => {
    writeFileSync(join(tmp, 'go.mod'), 'module example.com/foo');
    assert.equal(detectLanguage(tmp), 'go');
  });

  it('returns unknown when no markers', () => {
    assert.equal(detectLanguage(tmp), 'unknown');
  });
});

describe('detectScripts', () => {
  it('detects build and test scripts from package.json', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({
        scripts: { build: 'tsc', test: 'vitest' },
      })
    );
    const scripts = detectScripts(tmp);
    assert.equal(scripts.build, 'tsc');
    assert.equal(scripts.test, 'vitest');
    assert.equal(scripts.lint, null);
    assert.equal(scripts.typecheck, null);
  });

  it('returns all nulls without package.json', () => {
    const scripts = detectScripts(tmp);
    assert.equal(scripts.build, null);
    assert.equal(scripts.test, null);
    assert.equal(scripts.lint, null);
    assert.equal(scripts.typecheck, null);
  });
});

describe('validateTeamName', () => {
  it('accepts valid names', () => {
    assert.equal(validateTeamName('dev'), true);
    assert.equal(validateTeamName('my-team'), true);
    assert.equal(validateTeamName('a'), true);
  });

  it('rejects invalid names', () => {
    assert.equal(validateTeamName('Dev'), false);
    assert.equal(validateTeamName('123'), false);
    assert.equal(validateTeamName('dev-'), false);
    assert.equal(validateTeamName('-dev'), false);
    assert.equal(validateTeamName(''), false);
  });
});

describe('detectRemote', () => {
  it('returns the remote URL in a repo with a remote', () => {
    // Create a bare repo and clone it to get a remote
    const bareDir = mkdtempSync(join(tmpdir(), 'nightshift-bare-'));
    const bareRepo = join(bareDir, 'origin.git');
    execSync(`git init --bare "${bareRepo}"`, { stdio: 'pipe' });

    const cloneDir = mkdtempSync(join(tmpdir(), 'nightshift-clone-'));
    const clonedRepo = join(cloneDir, 'repo');
    execSync(`git clone "${bareRepo}" "${clonedRepo}"`, { stdio: 'pipe' });
    execSync('git commit --allow-empty -m "init"', {
      cwd: clonedRepo,
      stdio: 'pipe',
    });

    process.chdir(clonedRepo);
    try {
      const url = detectRemote();
      assert.ok(url.length > 0, 'should return a non-empty URL');
      assert.ok(url.includes('origin.git'), 'should include the repo path');
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
      rmSync(cloneDir, { recursive: true, force: true });
    }
  });

  it('throws in a repo without a remote', () => {
    assert.throws(() => detectRemote(), /no remote "origin" found/i);
  });
});
