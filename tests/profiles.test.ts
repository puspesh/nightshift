import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const agentsDir = join(__dirname, '..', 'presets', 'dev', 'agents');

interface Profile {
  name: string;
  content: string;
}

const profiles: Profile[] = readdirSync(agentsDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({
    name: f,
    content: readFileSync(join(agentsDir, f), 'utf-8'),
  }));

describe('agent profiles', () => {
  it('has exactly 5 profiles', () => {
    assert.equal(profiles.length, 5);
  });

  it('all use ns-dev- prefix', () => {
    for (const p of profiles) {
      assert.ok(
        p.name.startsWith('ns-dev-'),
        `${p.name} should start with ns-dev-`
      );
    }
  });

  const expectedNames = [
    'ns-dev-producer.md',
    'ns-dev-planner.md',
    'ns-dev-reviewer.md',
    'ns-dev-coder.md',
    'ns-dev-tester.md',
  ];

  it('has all expected agent profiles', () => {
    const names = profiles.map((p) => p.name).sort();
    assert.deepEqual(names, expectedNames.sort());
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
    it(`no profile contains "${term}"`, () => {
      for (const p of profiles) {
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
    { term: '"wip"', label: '"wip" as bare label' },
    { term: '"status:', label: 'old label prefix (double-quoted)' },
    { term: "'status:", label: 'old label prefix (single-quoted)' },
  ];

  for (const { term, label } of bannedTerms) {
    it(`no profile contains "${term}" (${label})`, () => {
      for (const p of profiles) {
        assert.ok(
          !p.content.includes(term),
          `${p.name} contains banned term "${term}" (${label})`
        );
      }
    });
  }
});

describe('required patterns (new naming conventions)', () => {
  it('profiles reference ns-dev- (agent names)', () => {
    const hasNsDev = profiles.some((p) => p.content.includes('ns-dev-'));
    assert.ok(hasNsDev, 'at least one profile should reference ns-dev-');
  });

  it('at least one profile references .claude/nightshift/ (config path)', () => {
    const hasNightshiftConfig = profiles.some((p) =>
      p.content.includes('.claude/nightshift/')
    );
    assert.ok(
      hasNightshiftConfig,
      'at least one profile should reference .claude/nightshift/'
    );
  });

  it('at least one profile references _ns/dev/ (branch prefix)', () => {
    const hasNsBranch = profiles.some((p) =>
      p.content.includes('_ns/dev/')
    );
    assert.ok(
      hasNsBranch,
      'at least one profile should reference _ns/dev/'
    );
  });

  it('at least one profile references dev: (label prefix)', () => {
    const hasDevLabel = profiles.some((p) => p.content.includes('dev:'));
    assert.ok(
      hasDevLabel,
      'at least one profile should reference dev: labels'
    );
  });
});

describe('lock file paths', () => {
  const agentsWithLocks = profiles.filter(
    (p) => !p.name.includes('producer')
  );

  for (const p of agentsWithLocks) {
    it(`${p.name} uses ~/.nightshift/ lock path`, () => {
      if (p.content.includes('.lock')) {
        assert.ok(
          p.content.includes('.nightshift/'),
          `${p.name} lock path should reference .nightshift/`
        );
        assert.ok(
          !p.content.includes('/tmp/'),
          `${p.name} should not use /tmp/ for locks`
        );
      }
    });
  }
});

describe('branch naming', () => {
  const agentsWithWorktrees = profiles.filter(
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
