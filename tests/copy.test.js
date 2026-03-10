import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  copyExtensionFiles,
  removeExtensionFiles,
  copyRepoMd,
  removeRepoMd,
} from '../lib/copy.js';

let tmp;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'nightshift-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('copyExtensionFiles', () => {
  it('copies all default files to .claude/nightshift/', () => {
    const { copied, skipped } = copyExtensionFiles(tmp, 'dev');

    assert.ok(copied.length > 0, 'should copy at least one file');
    assert.equal(skipped.length, 0, 'should skip nothing on fresh dir');

    for (const file of copied) {
      const target = join(tmp, '.claude', 'nightshift', file);
      assert.ok(existsSync(target), `${file} should exist at target`);
    }
  });

  it('copies ns-dev-* named files', () => {
    const { copied } = copyExtensionFiles(tmp, 'dev');

    for (const file of copied) {
      assert.ok(
        file.startsWith('ns-dev-'),
        `${file} should start with ns-dev-`
      );
    }
  });

  it('copies the expected 4 default files', () => {
    const { copied } = copyExtensionFiles(tmp, 'dev');

    const expected = [
      'ns-dev-plan-template.md',
      'ns-dev-pr-template.md',
      'ns-dev-review-criteria.md',
      'ns-dev-test-config.md',
    ];
    assert.deepEqual(copied.sort(), expected.sort());
  });

  it('skips files that already exist', () => {
    copyExtensionFiles(tmp, 'dev');

    // Modify one file to prove it's not overwritten
    const configPath = join(
      tmp,
      '.claude',
      'nightshift',
      'ns-dev-review-criteria.md'
    );
    writeFileSync(configPath, 'custom content');

    const { copied, skipped } = copyExtensionFiles(tmp, 'dev');

    assert.equal(copied.length, 0, 'should copy nothing the second time');
    assert.ok(skipped.length > 0, 'should skip all existing files');
    assert.equal(readFileSync(configPath, 'utf-8'), 'custom content');
  });
});

describe('removeExtensionFiles', () => {
  it('removes ns-dev-*.md files from .claude/nightshift/', () => {
    copyExtensionFiles(tmp, 'dev');
    assert.ok(existsSync(join(tmp, '.claude', 'nightshift')));

    const removed = removeExtensionFiles(tmp, 'dev');
    assert.ok(removed.length > 0, 'should remove at least one file');

    for (const file of removed) {
      assert.ok(
        !existsSync(join(tmp, '.claude', 'nightshift', file)),
        `${file} should be removed`
      );
    }
  });

  it('does not remove repo.md', () => {
    copyExtensionFiles(tmp, 'dev');
    copyRepoMd(tmp, 'repo content');

    removeExtensionFiles(tmp, 'dev');

    assert.ok(
      existsSync(join(tmp, '.claude', 'nightshift', 'repo.md')),
      'repo.md should still exist'
    );
  });

  it('returns empty array when directory does not exist', () => {
    const removed = removeExtensionFiles(tmp, 'dev');
    assert.deepEqual(removed, []);
  });
});

describe('copyRepoMd', () => {
  it('writes to .claude/nightshift/repo.md', () => {
    const written = copyRepoMd(tmp, 'test content');
    assert.equal(written, true);

    const content = readFileSync(
      join(tmp, '.claude', 'nightshift', 'repo.md'),
      'utf-8'
    );
    assert.equal(content, 'test content');
  });

  it('skips if repo.md already exists', () => {
    copyRepoMd(tmp, 'original');
    const written = copyRepoMd(tmp, 'overwrite attempt');

    assert.equal(written, false);
    const content = readFileSync(
      join(tmp, '.claude', 'nightshift', 'repo.md'),
      'utf-8'
    );
    assert.equal(content, 'original');
  });
});

describe('removeRepoMd', () => {
  it('removes repo.md', () => {
    copyRepoMd(tmp, 'content');
    assert.ok(existsSync(join(tmp, '.claude', 'nightshift', 'repo.md')));

    const removed = removeRepoMd(tmp);
    assert.equal(removed, true);
    assert.ok(!existsSync(join(tmp, '.claude', 'nightshift', 'repo.md')));
  });

  it('returns false when repo.md does not exist', () => {
    const removed = removeRepoMd(tmp);
    assert.equal(removed, false);
  });
});
