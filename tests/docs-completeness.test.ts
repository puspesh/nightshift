import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Tests run from dist/tests/, so go up two levels to reach project root
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readFile(relPath: string): string {
  return readFileSync(join(root, relPath), 'utf-8');
}

describe('docs completeness', () => {
  it('docs/faq.md exists and has >= 8 Q&A entries', () => {
    const path = join(root, 'docs/faq.md');
    assert.ok(existsSync(path), 'docs/faq.md should exist');
    const content = readFileSync(path, 'utf-8');
    const headings = content.match(/^## /gm) || [];
    assert.ok(
      headings.length >= 8,
      `docs/faq.md should have >= 8 Q&A entries (## headings), found ${headings.length}`,
    );
  });

  it('docs/quickstart.md exists and references all prerequisites', () => {
    const path = join(root, 'docs/quickstart.md');
    assert.ok(existsSync(path), 'docs/quickstart.md should exist');
    const content = readFileSync(path, 'utf-8');
    assert.ok(content.includes('gh auth login'), 'quickstart should reference gh auth login');
    assert.ok(
      content.includes('claude') || content.includes('Claude Code'),
      'quickstart should reference Claude Code',
    );
    assert.ok(content.includes('tmux'), 'quickstart should reference tmux');
  });

  it('docs/compatibility.md exists and lists Node versions', () => {
    const path = join(root, 'docs/compatibility.md');
    assert.ok(existsSync(path), 'docs/compatibility.md should exist');
    const content = readFileSync(path, 'utf-8');
    assert.ok(content.includes('18'), 'compatibility should list Node 18');
    assert.ok(content.includes('20'), 'compatibility should list Node 20');
    assert.ok(content.includes('22'), 'compatibility should list Node 22');
  });

  describe('docs/troubleshooting.md covers CLI error patterns', () => {
    const errorPatterns = [
      'Missing prerequisites',
      'team.yaml',
      'tmux',
      'worktree',
      'label',
    ];

    let content: string;
    try {
      content = readFile('docs/troubleshooting.md');
    } catch {
      content = '';
    }

    for (const pattern of errorPatterns) {
      it(`covers "${pattern}"`, () => {
        assert.ok(
          content.toLowerCase().includes(pattern.toLowerCase()),
          `troubleshooting.md should cover "${pattern}"`,
        );
      });
    }
  });

  it('docs/architecture.md references team.yaml', () => {
    const content = readFile('docs/architecture.md');
    assert.ok(
      content.includes('team.yaml'),
      'architecture.md should reference team.yaml',
    );
  });

  it('no docs contain "manual testing" or "bunx"', () => {
    const files = [
      'README.md',
      'CONTRIBUTING.md',
      'docs/customization.md',
      'docs/architecture.md',
      'docs/adding-agents.md',
      'docs/troubleshooting.md',
      'docs/headless.md',
    ];

    for (const file of files) {
      const path = join(root, file);
      if (!existsSync(path)) continue;
      const content = readFileSync(path, 'utf-8');
      assert.ok(
        !content.includes('bunx'),
        `${file} should not contain "bunx"`,
      );
      assert.ok(
        !content.toLowerCase().includes('testing is primarily manual'),
        `${file} should not contain "testing is primarily manual"`,
      );
    }
  });
});
