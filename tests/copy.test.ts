import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  copyExtensionFiles,
  removeExtensionFiles,
  copyRepoMd,
  removeRepoMd,
  getPresetDefaultsDir,
  copyScaffoldFiles,
} from '../lib/copy.js';
import { readdirSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PRESETS_DIR = join(__dirname, '..', '..', 'presets');

let tmp: string;

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

  it('copies all default files from preset defaults directory', () => {
    const { copied } = copyExtensionFiles(tmp, 'dev');

    const defaultsDir = getPresetDefaultsDir('dev');
    const expected = readdirSync(defaultsDir).filter(f => f.endsWith('.md') || f.endsWith('.json'));
    assert.deepEqual(copied.sort(), expected.sort());
  });

  it('copies .json files from presets', () => {
    const { copied } = copyExtensionFiles(tmp, 'dev');
    const jsonFiles = copied.filter(f => f.endsWith('.json'));
    assert.ok(jsonFiles.length > 0, 'should copy at least one JSON file');

    for (const file of jsonFiles) {
      const target = join(tmp, '.claude', 'nightshift', file);
      assert.ok(existsSync(target), `${file} should exist at target`);
    }
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

describe('content preset file existence', () => {
  it('defaults dir exists and has files', () => {
    const defaultsDir = join(PRESETS_DIR, 'content', 'defaults');
    assert.ok(existsSync(defaultsDir), 'content defaults dir should exist');
    const files = readdirSync(defaultsDir);
    assert.ok(files.includes('ns-content-style-guide.md'), 'should have style guide');
    assert.ok(files.includes('ns-content-platforms.md'), 'should have platforms guide');
    assert.ok(files.includes('ns-content-citizens.json'), 'should have citizens JSON');
  });

  it('scaffold dir exists with expected structure', () => {
    const scaffoldDir = join(PRESETS_DIR, 'content', 'scaffold');
    assert.ok(existsSync(scaffoldDir), 'content scaffold dir should exist');
    assert.ok(existsSync(join(scaffoldDir, 'config', 'topics.yaml')), 'should have config/topics.yaml');
    assert.ok(existsSync(join(scaffoldDir, 'config', 'platforms.yaml')), 'should have config/platforms.yaml');
    assert.ok(existsSync(join(scaffoldDir, 'knowledge', 'style-guide.md')), 'should have knowledge/style-guide.md');
    assert.ok(existsSync(join(scaffoldDir, 'knowledge', 'references', '.gitkeep')), 'should have references/.gitkeep');
    assert.ok(existsSync(join(scaffoldDir, 'knowledge', 'past-posts', '.gitkeep')), 'should have past-posts/.gitkeep');
    assert.ok(existsSync(join(scaffoldDir, 'content-calendar.md')), 'should have content-calendar.md');
    assert.ok(existsSync(join(scaffoldDir, 'drafts', '.gitkeep')), 'should have drafts/.gitkeep');
    assert.ok(existsSync(join(scaffoldDir, 'CLAUDE.md')), 'should have CLAUDE.md');
  });
});

describe('copyScaffoldFiles', () => {
  it('copies directory tree to repo root', () => {
    // Create a mock preset with scaffold dir
    const presetDir = join(tmp, 'mock-preset');
    const scaffoldDir = join(presetDir, 'scaffold');
    mkdirSync(join(scaffoldDir, 'config'), { recursive: true });
    writeFileSync(join(scaffoldDir, 'config', 'topics.yaml'), 'topics: []');
    writeFileSync(join(scaffoldDir, 'README.md'), '# Content Repo');

    const repoRoot = join(tmp, 'repo');
    mkdirSync(repoRoot, { recursive: true });

    const { copied, skipped } = copyScaffoldFiles(repoRoot, presetDir);
    assert.equal(copied.length, 2);
    assert.equal(skipped.length, 0);
    assert.ok(existsSync(join(repoRoot, 'config', 'topics.yaml')));
    assert.ok(existsSync(join(repoRoot, 'README.md')));
    assert.equal(readFileSync(join(repoRoot, 'config', 'topics.yaml'), 'utf-8'), 'topics: []');
  });

  it('skips existing files', () => {
    const presetDir = join(tmp, 'mock-preset');
    const scaffoldDir = join(presetDir, 'scaffold');
    mkdirSync(join(scaffoldDir, 'config'), { recursive: true });
    writeFileSync(join(scaffoldDir, 'config', 'topics.yaml'), 'default content');

    const repoRoot = join(tmp, 'repo');
    mkdirSync(join(repoRoot, 'config'), { recursive: true });
    writeFileSync(join(repoRoot, 'config', 'topics.yaml'), 'custom content');

    const { copied, skipped } = copyScaffoldFiles(repoRoot, presetDir);
    assert.equal(copied.length, 0);
    assert.equal(skipped.length, 1);
    assert.ok(skipped[0].includes('topics.yaml'));
    assert.equal(readFileSync(join(repoRoot, 'config', 'topics.yaml'), 'utf-8'), 'custom content');
  });

  it('creates nested directories', () => {
    const presetDir = join(tmp, 'mock-preset');
    const scaffoldDir = join(presetDir, 'scaffold');
    mkdirSync(join(scaffoldDir, 'knowledge', 'references'), { recursive: true });
    writeFileSync(join(scaffoldDir, 'knowledge', 'references', '.gitkeep'), '');

    const repoRoot = join(tmp, 'repo');
    mkdirSync(repoRoot, { recursive: true });

    const { copied } = copyScaffoldFiles(repoRoot, presetDir);
    assert.equal(copied.length, 1);
    assert.ok(existsSync(join(repoRoot, 'knowledge', 'references', '.gitkeep')));
  });

  it('returns empty result when no scaffold dir', () => {
    const presetDir = join(tmp, 'mock-preset');
    mkdirSync(presetDir, { recursive: true });
    // No scaffold/ directory

    const repoRoot = join(tmp, 'repo');
    mkdirSync(repoRoot, { recursive: true });

    const { copied, skipped } = copyScaffoldFiles(repoRoot, presetDir);
    assert.equal(copied.length, 0);
    assert.equal(skipped.length, 0);
  });

  it('handles empty scaffold dir', () => {
    const presetDir = join(tmp, 'mock-preset');
    mkdirSync(join(presetDir, 'scaffold'), { recursive: true });

    const repoRoot = join(tmp, 'repo');
    mkdirSync(repoRoot, { recursive: true });

    const { copied, skipped } = copyScaffoldFiles(repoRoot, presetDir);
    assert.equal(copied.length, 0);
    assert.equal(skipped.length, 0);
  });
});
