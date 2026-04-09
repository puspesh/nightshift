import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Tests run from dist/tests/, so go up two levels to reach project root
const root = join(import.meta.dirname, '..', '..');

function readFile(relPath: string): string {
  return readFileSync(join(root, relPath), 'utf-8');
}

describe('docs integrity', () => {
  describe('README.md', () => {
    const readme = readFile('README.md');

    it('contains "Why nightshift" section', () => {
      assert.match(readme, /#+\s+Why nightshift/i);
    });

    it('contains "What it is NOT" section', () => {
      assert.match(readme, /#+\s+What it is NOT/i);
    });

    it('contains "Who is this for" section', () => {
      assert.match(readme, /#+\s+Who is this for/i);
    });

    it('contains CI badge', () => {
      assert.ok(
        readme.includes('workflows/ci') || readme.includes('actions/workflows'),
        'README should contain CI badge link',
      );
    });
  });

  describe('SECURITY.md', () => {
    it('exists and is non-empty', () => {
      const path = join(root, 'SECURITY.md');
      assert.ok(existsSync(path), 'SECURITY.md should exist');
      const content = readFileSync(path, 'utf-8');
      assert.ok(content.trim().length > 100, 'SECURITY.md should be non-empty');
    });
  });

  describe('CONTRIBUTING.md', () => {
    const contrib = readFile('CONTRIBUTING.md');

    it('references automated tests', () => {
      assert.ok(
        contrib.includes('npm run test') || contrib.includes('npm test'),
        'CONTRIBUTING.md should reference npm run test',
      );
    });

    it('does not mention manual testing as primary', () => {
      assert.ok(
        !contrib.includes('Testing is primarily manual'),
        'CONTRIBUTING.md should not say testing is primarily manual',
      );
    });

    it('contains dev setup section', () => {
      assert.ok(
        contrib.includes('npm install') || contrib.includes('npm ci'),
        'CONTRIBUTING.md should reference npm install',
      );
      assert.ok(
        contrib.includes('npm run build'),
        'CONTRIBUTING.md should reference npm run build',
      );
    });

    it('contains verification command', () => {
      assert.ok(
        contrib.includes('npm run typecheck') && contrib.includes('npm run test'),
        'CONTRIBUTING.md should reference typecheck and test commands',
      );
    });
  });

  describe('doc links in README resolve', () => {
    const readme = readFile('README.md');
    const linkRegex = /\]\((docs\/[^)]+\.md)\)/g;
    const links: string[] = [];
    let match;
    while ((match = linkRegex.exec(readme)) !== null) {
      links.push(match[1]);
    }

    for (const link of links) {
      it(`link to ${link} resolves`, () => {
        assert.ok(
          existsSync(join(root, link)),
          `${link} referenced in README should exist`,
        );
      });
    }
  });
});
