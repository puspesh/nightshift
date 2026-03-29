import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const agentsDir = join(__dirname, '..', '..', 'presets', 'dev', 'agents');

interface Profile {
  name: string;
  content: string;
}

// Behavior templates (new format: <role>.md)
const templates: Profile[] = readdirSync(agentsDir)
  .filter((f) => f.endsWith('.md') && !f.startsWith('ns-'))
  .map((f) => ({
    name: f,
    content: readFileSync(join(agentsDir, f), 'utf-8'),
  }));

describe('agent behavior templates', () => {
  it('has exactly 5 behavior templates', () => {
    assert.equal(templates.length, 5);
  });

  const expectedNames = [
    'producer.md',
    'planner.md',
    'reviewer.md',
    'coder.md',
    'tester.md',
  ];

  it('has all expected behavior templates', () => {
    const names = templates.map((p) => p.name).sort();
    assert.deepEqual(names, expectedNames.sort());
  });

  it('templates use {{mustache}} variables', () => {
    for (const t of templates) {
      assert.ok(
        t.content.includes('{{agent_name}}'),
        `${t.name} should use {{agent_name}} template variable`
      );
    }
  });
});

describe('no Hodor-specific content', () => {
  const hodorTerms = [
    'hodor',
    '@hodor',
    'tRPC',
    'Drizzle',
    'NativeWind',
    'Expo',
    'pnpm',
    'Vitest',
    'Playwright',
    'impeccable',
    'superset',
  ];

  for (const term of hodorTerms) {
    it(`no template contains "${term}"`, () => {
      for (const p of templates) {
        assert.ok(
          !p.content.toLowerCase().includes(term.toLowerCase()),
          `${p.name} contains "${term}"`
        );
      }
    });
  }
});

describe('no banned terms (old naming conventions)', () => {
  const bannedTerms = [
    { term: 'nightshift-', label: 'old agent name prefix' },
    { term: '.claude/pipeline/', label: 'old config path' },
    { term: '_nightshift/', label: 'old branch prefix' },
  ];

  for (const { term, label } of bannedTerms) {
    it(`no template contains "${term}" (${label})`, () => {
      for (const p of templates) {
        assert.ok(
          !p.content.includes(term),
          `${p.name} contains banned term "${term}" (${label})`
        );
      }
    });
  }
});

describe('required patterns (new naming conventions)', () => {
  it('templates reference {{agent_name}} (agent names)', () => {
    const hasAgentName = templates.some((p) => p.content.includes('{{agent_name}}'));
    assert.ok(hasAgentName, 'at least one template should reference {{agent_name}}');
  });

  it('at least one template references .claude/nightshift/ (config path)', () => {
    const hasNightshiftConfig = templates.some((p) =>
      p.content.includes('.claude/nightshift/')
    );
    assert.ok(
      hasNightshiftConfig,
      'at least one template should reference .claude/nightshift/'
    );
  });
});

describe('lock file paths', () => {
  const agentsWithLocks = templates.filter(
    (p) => !p.name.includes('producer')
  );

  for (const p of agentsWithLocks) {
    it(`${p.name} uses {{team_dir}} lock path`, () => {
      if (p.content.includes('.lock')) {
        assert.ok(
          p.content.includes('{{team_dir}}') || p.content.includes('.nightshift/'),
          `${p.name} lock path should reference {{team_dir}} or .nightshift/`
        );
        const lockLines = p.content
          .split('\n')
          .filter((line) => line.includes('.lock'));
        for (const line of lockLines) {
          assert.ok(
            !line.includes('/tmp/'),
            `${p.name} should not use /tmp/ for locks: ${line.trim()}`
          );
        }
      }
    });
  }
});

describe('branch naming', () => {
  const agentsWithWorktrees = templates.filter(
    (p) => !p.name.includes('producer')
  );

  for (const p of agentsWithWorktrees) {
    it(`${p.name} uses _ns/ branch prefix (not _nightshift/ or _agent/)`, () => {
      if (p.content.includes('_ns/') || p.content.includes('_agent/')) {
        assert.ok(
          p.content.includes('_ns/'),
          `${p.name} should use _ns/ branch prefix`
        );
        assert.ok(
          !p.content.includes('_agent/'),
          `${p.name} should not use old _agent/ branch prefix`
        );
      }
    });
  }
});
