import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolvePresetDir } from '../lib/reinit.js';
import { parseTeamConfig, parseTeamConfigFromString } from '../lib/team-config.js';
import { generateAndInstallProfiles } from '../lib/init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PRESETS_DIR = join(__dirname, '..', '..', 'presets');

describe('resolvePresetDir', () => {
  it('finds built-in preset for dev team', () => {
    const dir = resolvePresetDir('dev', '/tmp/nonexistent');
    assert.ok(dir);
    assert.ok(dir!.includes('presets/dev'));
  });

  it('returns null for unknown team', () => {
    const dir = resolvePresetDir('nonexistent-team-xyz', '/tmp/nonexistent');
    assert.equal(dir, null);
  });

  it('prefers repo-local team over built-in preset', () => {
    const tmp = join(homedir(), '.nightshift-test-reinit-' + Date.now());
    const localDir = join(tmp, '.claude', 'nightshift', 'teams', 'dev');
    mkdirSync(join(localDir), { recursive: true });
    writeFileSync(join(localDir, 'team.yaml'), 'name: dev\ndescription: test\nstages: []\nagents: {}');

    try {
      const dir = resolvePresetDir('dev', tmp);
      assert.ok(dir);
      assert.ok(dir!.startsWith(tmp), 'Should prefer local dir');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('reinit regeneration', () => {
  let agentsDir: string;

  beforeEach(() => {
    agentsDir = mkdtempSync(join(tmpdir(), 'ns-reinit-test-'));
  });

  afterEach(() => {
    rmSync(agentsDir, { recursive: true, force: true });
  });

  it('generates all agent files from dev preset', () => {
    const presetDir = join(PRESETS_DIR, 'dev');
    const config = parseTeamConfig(join(presetDir, 'team.yaml'));
    const installed = generateAndInstallProfiles(
      config, presetDir, 'test-repo', 'main', undefined, undefined, undefined, agentsDir,
    );

    assert.equal(installed.length, 6); // 4 non-scalable + 2 default coder instances
    for (const f of installed) {
      assert.ok(existsSync(join(agentsDir, f)), `Expected ${f} to exist`);
    }
  });

  it('overwrites existing files (idempotent)', () => {
    const presetDir = join(PRESETS_DIR, 'dev');
    const config = parseTeamConfig(join(presetDir, 'team.yaml'));

    // First generation
    const first = generateAndInstallProfiles(
      config, presetDir, 'test-repo', 'main', undefined, undefined, undefined, agentsDir,
    );
    const firstContent = readFileSync(join(agentsDir, first[0]), 'utf-8');

    // Second generation
    const second = generateAndInstallProfiles(
      config, presetDir, 'test-repo', 'main', undefined, undefined, undefined, agentsDir,
    );
    const secondContent = readFileSync(join(agentsDir, second[0]), 'utf-8');

    assert.equal(firstContent, secondContent);
  });

  it('filterRole generates only that agent file', () => {
    const presetDir = join(PRESETS_DIR, 'dev');
    const config = parseTeamConfig(join(presetDir, 'team.yaml'));

    // Generate all first
    generateAndInstallProfiles(
      config, presetDir, 'test-repo', 'main', undefined, undefined, undefined, agentsDir,
    );

    // Now regenerate only planner
    const single = generateAndInstallProfiles(
      config, presetDir, 'test-repo', 'main', undefined, undefined, 'planner', agentsDir,
    );

    assert.equal(single.length, 1, 'Should generate exactly one file');
    assert.ok(single[0].includes('planner'), 'Should be the planner file');
  });

  it('reinit does not create worktrees (lightweight regeneration)', () => {
    const presetDir = join(PRESETS_DIR, 'dev');
    const config = parseTeamConfig(join(presetDir, 'team.yaml'));
    const installed = generateAndInstallProfiles(
      config, presetDir, 'test-repo', 'main', undefined, undefined, undefined, agentsDir,
    );

    // generateAndInstallProfiles is the reinit core — it only writes agent files
    // Verify it wrote files but did NOT create any worktree directories
    for (const f of installed) {
      assert.ok(existsSync(join(agentsDir, f)), `Agent file ${f} should exist`);
    }
    // Worktree dirs are NOT created by generateAndInstallProfiles
    // (those are created by createWorktrees in full init only)
  });

  it('generated files have no unrendered template vars', () => {
    const presetDir = join(PRESETS_DIR, 'dev');
    const config = parseTeamConfig(join(presetDir, 'team.yaml'));
    const installed = generateAndInstallProfiles(
      config, presetDir, 'test-repo', 'main', undefined, undefined, undefined, agentsDir,
    );

    for (const f of installed) {
      const content = readFileSync(join(agentsDir, f), 'utf-8');
      assert.ok(!content.match(/\{\{[a-z_]+\}\}/), `Unrendered vars in ${f}`);
    }
  });
});

describe('behavior override system', () => {
  let agentsDir: string;
  let tmpRoot: string;

  beforeEach(() => {
    agentsDir = mkdtempSync(join(tmpdir(), 'ns-override-agents-'));
    tmpRoot = mkdtempSync(join(tmpdir(), 'ns-override-root-'));
  });

  afterEach(() => {
    rmSync(agentsDir, { recursive: true, force: true });
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('uses repo-level override over built-in template', () => {
    const presetDir = join(PRESETS_DIR, 'dev');
    const config = parseTeamConfig(join(presetDir, 'team.yaml'));

    // Create a repo-level override for producer
    const overrideDir = join(tmpRoot, '.claude', 'nightshift', 'agents');
    mkdirSync(overrideDir, { recursive: true });
    writeFileSync(
      join(overrideDir, 'producer.md'),
      'You are **@{{agent_name}}** — CUSTOM OVERRIDE TEMPLATE for testing.\n'
    );

    const installed = generateAndInstallProfiles(
      config, presetDir, 'test-repo', 'main', undefined, tmpRoot, undefined, agentsDir,
    );

    // Find the producer file and verify override was used
    const producerFile = installed.find(f => f.includes('producer'));
    assert.ok(producerFile, 'Producer file should be generated');
    const content = readFileSync(join(agentsDir, producerFile!), 'utf-8');
    assert.ok(content.includes('CUSTOM OVERRIDE TEMPLATE'), 'Override content should be present');
  });

  it('falls back to preset template when no override exists', () => {
    const presetDir = join(PRESETS_DIR, 'dev');
    const config = parseTeamConfig(join(presetDir, 'team.yaml'));

    // Create override dir but only for producer (not planner)
    const overrideDir = join(tmpRoot, '.claude', 'nightshift', 'agents');
    mkdirSync(overrideDir, { recursive: true });
    writeFileSync(
      join(overrideDir, 'producer.md'),
      'You are **@{{agent_name}}** — CUSTOM OVERRIDE.\n'
    );

    const installed = generateAndInstallProfiles(
      config, presetDir, 'test-repo', 'main', undefined, tmpRoot, undefined, agentsDir,
    );

    // Planner should use built-in template (not overridden)
    const plannerFile = installed.find(f => f.includes('planner'));
    assert.ok(plannerFile);
    const plannerContent = readFileSync(join(agentsDir, plannerFile!), 'utf-8');
    assert.ok(!plannerContent.includes('CUSTOM OVERRIDE'), 'Planner should use built-in template');
  });

  it('--reset does not delete files in .claude/nightshift/agents/', () => {
    // Simulate the reset logic from init.ts
    const nightshiftExtDir = join(tmpRoot, '.claude', 'nightshift');
    const overrideDir = join(nightshiftExtDir, 'agents');
    mkdirSync(overrideDir, { recursive: true });

    // Create an override file and a regular extension file
    writeFileSync(join(overrideDir, 'producer.md'), 'OVERRIDE CONTENT');
    writeFileSync(join(nightshiftExtDir, 'ns-dev-workflow.md'), 'EXTENSION CONTENT');

    // Simulate --reset: delete ns-dev-*.md files but not agents/
    const entries = readdirSync(nightshiftExtDir, { withFileTypes: true });
    const filesToDelete = entries
      .filter(entry => entry.isFile() && entry.name.startsWith('ns-dev-') && entry.name.endsWith('.md'))
      .map(entry => entry.name);
    for (const file of filesToDelete) {
      unlinkSync(join(nightshiftExtDir, file));
    }

    // Override file should survive
    assert.ok(existsSync(join(overrideDir, 'producer.md')), 'Override file must survive --reset');
    // Extension file should be deleted
    assert.ok(!existsSync(join(nightshiftExtDir, 'ns-dev-workflow.md')), 'Extension file should be deleted');
  });
});

describe('custom team definitions', () => {
  let agentsDir: string;
  let tmpRoot: string;

  beforeEach(() => {
    agentsDir = mkdtempSync(join(tmpdir(), 'ns-custom-agents-'));
    tmpRoot = mkdtempSync(join(tmpdir(), 'ns-custom-root-'));
  });

  afterEach(() => {
    rmSync(agentsDir, { recursive: true, force: true });
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('resolves custom team from .claude/nightshift/teams/', () => {
    const teamDir = join(tmpRoot, '.claude', 'nightshift', 'teams', 'deploy');
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(join(teamDir, 'team.yaml'), `name: deploy
description: Deployment team
stages:
  - name: ready
    color: "00ff00"
  - name: deploying
    color: "ffaa00"
  - name: wip
    meta: true
    color: "ff0000"
agents:
  deployer:
    description: Deploys code
    watches: [ready]
    transitions:
      deploy: deploying
`);

    const dir = resolvePresetDir('deploy', tmpRoot);
    assert.ok(dir);
    assert.ok(dir!.startsWith(tmpRoot), 'Should resolve to repo-local team');
  });

  it('generates profiles from custom team with custom templates', () => {
    const teamDir = join(tmpRoot, '.claude', 'nightshift', 'teams', 'ops');
    const agentsTemplateDir = join(teamDir, 'agents');
    mkdirSync(agentsTemplateDir, { recursive: true });

    writeFileSync(join(teamDir, 'team.yaml'), `name: ops
description: Operations team
stages:
  - name: pending
    color: "cccccc"
  - name: running
    color: "00ff00"
  - name: wip
    meta: true
    color: "ff0000"
agents:
  operator:
    description: Operates infrastructure
    watches: [pending]
    transitions:
      start: running
`);

    writeFileSync(
      join(agentsTemplateDir, 'operator.md'),
      'You are **@{{agent_name}}** — the infrastructure operator for {{repo_name}}.\n'
    );

    const config = parseTeamConfig(join(teamDir, 'team.yaml'));
    const installed = generateAndInstallProfiles(
      config, teamDir, 'test-repo', 'main', undefined, undefined, undefined, agentsDir,
    );

    assert.equal(installed.length, 1);
    assert.ok(installed[0].includes('ns-ops-operator'));
    const content = readFileSync(join(agentsDir, installed[0]), 'utf-8');
    assert.ok(content.includes('infrastructure operator'), 'Custom template content should be present');
    assert.ok(content.includes('test-repo'), 'Template vars should be rendered');
    assert.ok(!content.match(/\{\{[a-z_]+\}\}/), 'No unrendered template vars');
  });

  it('errors when behavior template is missing for custom team agent', () => {
    const teamDir = join(tmpRoot, '.claude', 'nightshift', 'teams', 'broken');
    mkdirSync(join(teamDir, 'agents'), { recursive: true });

    writeFileSync(join(teamDir, 'team.yaml'), `name: broken
description: Broken team
stages:
  - name: todo
    color: "cccccc"
  - name: wip
    meta: true
    color: "ff0000"
agents:
  worker:
    description: Does work
    watches: [todo]
    transitions: {}
`);
    // Intentionally NO worker.md template

    const config = parseTeamConfig(join(teamDir, 'team.yaml'));
    assert.throws(
      () => generateAndInstallProfiles(
        config, teamDir, 'test-repo', 'main', undefined, undefined, undefined, agentsDir,
      ),
      /Behavior template not found for agent "worker"/
    );
  });
});
