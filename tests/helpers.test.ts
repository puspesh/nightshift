import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendClaudeMd } from '../lib/init.js';
import { cleanClaudeMd } from '../lib/teardown.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'nightshift-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('appendClaudeMd', () => {
  it('creates CLAUDE.md with Nightshift Teams section and team subsection', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev', 1);

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('## Nightshift Teams'));
    assert.ok(content.includes('### dev'));
    assert.ok(content.includes('test-repo'));
    assert.ok(content.includes('@ns-dev-producer'));
  });

  it('appends to existing CLAUDE.md', () => {
    writeFileSync(join(tmp, 'CLAUDE.md'), '# My Project\n\nSome content.\n');

    appendClaudeMd(tmp, 'test-repo', 'dev', 1);

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.startsWith('# My Project'));
    assert.ok(content.includes('## Nightshift Teams'));
    assert.ok(content.includes('### dev'));
  });

  it('includes coder-1 and coder-2 when coderCount is 2', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev', 2);

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    assert.ok(
      content.includes('@ns-dev-coder-1'),
      'should include coder-1'
    );
    assert.ok(
      content.includes('@ns-dev-coder-2'),
      'should include coder-2'
    );
  });

  it('is idempotent (does not duplicate)', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev', 1);
    appendClaudeMd(tmp, 'test-repo', 'dev', 1);

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    const count = content.split('### dev').length - 1;
    assert.equal(count, 1, 'should appear exactly once');
  });

  it('appends second team without duplicating section header', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev', 1);
    appendClaudeMd(tmp, 'test-repo', 'content', 1);

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    const sectionCount = content.split('## Nightshift Teams').length - 1;
    assert.equal(sectionCount, 1, '## Nightshift Teams should appear once');
    assert.ok(content.includes('### dev'), 'should have dev subsection');
    assert.ok(
      content.includes('### content'),
      'should have content subsection'
    );
  });

  it('includes all 5 agent names for dev team', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev', 1);

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    for (const agent of [
      'ns-dev-producer',
      'ns-dev-planner',
      'ns-dev-reviewer',
      'ns-dev-coder-1',
      'ns-dev-tester',
    ]) {
      assert.ok(
        content.includes(`@${agent}`),
        `should include @${agent}`
      );
    }
  });
});

describe('cleanClaudeMd', () => {
  it('removes the team subsection', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev', 1);
    cleanClaudeMd(tmp, 'dev');

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    assert.ok(!content.includes('### dev'));
    assert.ok(!content.includes('ns-dev-'));
  });

  it('removing last team removes entire Nightshift Teams section', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev', 1);
    cleanClaudeMd(tmp, 'dev');

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    assert.ok(
      !content.includes('## Nightshift Teams'),
      'should remove the entire section'
    );
  });

  it('removing one team of two leaves the other', () => {
    appendClaudeMd(tmp, 'test-repo', 'dev', 1);
    appendClaudeMd(tmp, 'test-repo', 'content', 1);
    cleanClaudeMd(tmp, 'dev');

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    assert.ok(
      content.includes('## Nightshift Teams'),
      'section header should remain'
    );
    assert.ok(!content.includes('### dev'), 'dev should be removed');
    assert.ok(
      content.includes('### content'),
      'content should remain'
    );
  });

  it('preserves sections after the Nightshift Teams section', () => {
    writeFileSync(
      join(tmp, 'CLAUDE.md'),
      `# My Project

## Nightshift Teams

### dev
| Agent | Role | Worktree |
|-------|------|----------|
| @ns-dev-producer | Triage issues | _(runs from main)_ |

## Other Section

Keep this.
`
    );

    cleanClaudeMd(tmp, 'dev');

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    assert.ok(!content.includes('Nightshift Teams'));
    assert.ok(content.includes('## Other Section'));
    assert.ok(content.includes('Keep this.'));
  });

  it('does nothing when CLAUDE.md does not exist', () => {
    assert.doesNotThrow(() => cleanClaudeMd(tmp, 'dev'));
  });

  it('does nothing when no Nightshift Teams section exists', () => {
    const original = '# My Project\n\nNo nightshift here.\n';
    writeFileSync(join(tmp, 'CLAUDE.md'), original);

    cleanClaudeMd(tmp, 'dev');

    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    assert.equal(content, original);
  });
});
