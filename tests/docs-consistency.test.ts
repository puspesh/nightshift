import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Tests run from dist/tests/, so go up two levels to reach project root
const root = join(import.meta.dirname, '..', '..');

function getAllMdFiles(): string[] {
  const files: string[] = [];
  // Top-level md files
  for (const f of readdirSync(root)) {
    if (f.endsWith('.md')) files.push(f);
  }
  // docs/*.md
  const docsDir = join(root, 'docs');
  if (existsSync(docsDir)) {
    for (const f of readdirSync(docsDir)) {
      if (f.endsWith('.md')) files.push(join('docs', f));
    }
  }
  return files;
}

describe('docs consistency', () => {
  it('no doc uses "bunx"', () => {
    for (const file of getAllMdFiles()) {
      const content = readFileSync(join(root, file), 'utf-8');
      assert.ok(
        !content.includes('bunx'),
        `${file} should not contain "bunx"`,
      );
    }
  });

  it('no doc contains TODO placeholders (excluding visual demo)', () => {
    // Allowlist: the README visual demo placeholder is intentional
    const allowlist = new Set(['README.md']);

    for (const file of getAllMdFiles()) {
      if (allowlist.has(file)) continue;
      const content = readFileSync(join(root, file), 'utf-8');
      assert.ok(
        !content.includes('TODO'),
        `${file} should not contain TODO placeholders`,
      );
    }
  });

  it('all internal doc links resolve', () => {
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;

    for (const file of getAllMdFiles()) {
      const content = readFileSync(join(root, file), 'utf-8');
      let match;
      while ((match = linkRegex.exec(content)) !== null) {
        const target = match[2];
        // Skip URLs, anchors, and image badges
        if (target.startsWith('http') || target.startsWith('#') || target.startsWith('mailto:')) {
          continue;
        }
        // Resolve relative to the file's directory
        const fileDir = join(root, file, '..');
        const resolved = join(fileDir, target);
        assert.ok(
          existsSync(resolved),
          `${file}: link to "${target}" does not resolve (checked ${resolved})`,
        );
      }
    }
  });

  it('README headings follow expected order', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf-8');
    const headings = (readme.match(/^## .+$/gm) || []).map((h) =>
      h.replace(/^## /, ''),
    );

    // These sections should appear in this order (not necessarily adjacent)
    const expectedOrder = [
      'Why nightshift',
      'What it is NOT',
      'Who is this for',
      'Quick Start',
      'How It Works',
      'Commands',
      'Prerequisites',
      'Documentation',
      'Contributing',
      'License',
    ];

    let lastIndex = -1;
    for (const section of expectedOrder) {
      const idx = headings.findIndex((h) =>
        h.toLowerCase().includes(section.toLowerCase()),
      );
      assert.ok(
        idx !== -1,
        `README should contain section "${section}"`,
      );
      assert.ok(
        idx > lastIndex,
        `README section "${section}" should come after previous expected sections (found at ${idx}, last was ${lastIndex})`,
      );
      lastIndex = idx;
    }
  });
});
