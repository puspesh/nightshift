import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendClaudeMd } from '../lib/init.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'nightshift-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('appendClaudeMd', () => {
  it('creates CLAUDE.md with Nightshift Teams section and team subsection', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev');

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('## Nightshift Teams'));
    assert.ok(content.includes('### dev'));
    assert.ok(content.includes('test-repo'));
  });

  it('appends to existing CLAUDE.md', () => {
    writeFileSync(join(tmp, 'CLAUDE.md'), '# My Project\n\nSome content.\n');

    appendClaudeMd(tmp, 'test-repo', 'dev');

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.startsWith('# My Project'));
    assert.ok(content.includes('## Nightshift Teams'));
    assert.ok(content.includes('### dev'));
  });

  it('creates placeholder subsection for team', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev');

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('### dev'), 'should have dev heading');
    assert.ok(content.includes('team.yaml'), 'placeholder should mention team.yaml');
  });

  it('is idempotent (does not duplicate)', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev');
    appendClaudeMd(tmp, 'test-repo', 'dev');

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    const count = content.split('### dev').length - 1;
    assert.equal(count, 1, 'should appear exactly once');
  });

  it('appends second team without duplicating section header', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev');
    appendClaudeMd(tmp, 'test-repo', 'content');

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    const sectionCount = content.split('## Nightshift Teams').length - 1;
    assert.equal(sectionCount, 1, '## Nightshift Teams should appear once');
    assert.ok(content.includes('### dev'), 'should have dev subsection');
    assert.ok(
      content.includes('### content'),
      'should have content subsection'
    );
  });

  it('creates valid CLAUDE.md structure on fresh call', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev');

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('# test-repo'), 'should have repo name header');
    assert.ok(content.includes('## Nightshift Teams'), 'should have teams section');
    assert.ok(content.includes('### dev'), 'should have team subsection');
  });
});
