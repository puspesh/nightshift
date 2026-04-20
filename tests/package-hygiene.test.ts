import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

describe('package hygiene', () => {
  const packOutput = execSync('npm pack --dry-run 2>&1', {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });

  it('npm pack output excludes docs/plans/', () => {
    const lines = packOutput.split('\n');
    const planFiles = lines.filter((l) => l.includes('docs/plans/'));
    assert.equal(
      planFiles.length,
      0,
      `docs/plans/ files should not be in npm pack output, found: ${planFiles.join(', ')}`,
    );
  });

  it('npm pack output excludes plans/', () => {
    const lines = packOutput.split('\n');
    // Match lines that start with plans/ but not docs/plans/
    const planFiles = lines.filter(
      (l) => l.match(/\bplans\//) && !l.includes('docs/plans/'),
    );
    assert.equal(
      planFiles.length,
      0,
      `plans/ files should not be in npm pack output, found: ${planFiles.join(', ')}`,
    );
  });

  it('npm pack output excludes tests/', () => {
    const lines = packOutput.split('\n');
    // Only match top-level tests/ not dist/tests/
    const testFiles = lines.filter(
      (l) => l.match(/(?:^|\s)tests\//) && !l.includes('dist/tests/'),
    );
    assert.equal(
      testFiles.length,
      0,
      `tests/ files should not be in npm pack output, found: ${testFiles.join(', ')}`,
    );
  });

  it('npm pack output includes required files', () => {
    const required = [
      'dist/',
      'presets/',
      'README.md',
      'LICENSE',
      'CHANGELOG.md',
    ];
    for (const file of required) {
      assert.ok(
        packOutput.includes(file),
        `npm pack output should include ${file}`,
      );
    }
  });

  it('package.json has required fields', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    assert.ok(pkg.bugs?.url, 'package.json should have bugs.url');
    assert.ok(pkg.homepage, 'package.json should have homepage');
    assert.ok(pkg.repository?.url, 'package.json should have repository.url');
  });
});
