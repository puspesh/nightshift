import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTeamConfig, expandAgentInstances } from '../lib/team-config.js';
import { generateAgentFile, buildTemplateVars } from '../lib/generate-agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PRESETS_DIR = join(__dirname, '..', '..', 'presets');

describe('init: dynamic agent discovery', () => {
  it('expands dev team to 6 agents (2 coders default)', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    const expanded = expandAgentInstances(config);
    assert.equal(expanded.length, 6);
  });

  it('expands to 7 agents when coder override is 3', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    const expanded = expandAgentInstances(config, { coder: 3 });
    assert.equal(expanded.length, 7);
    const coders = expanded.filter(a => a.role.startsWith('coder-'));
    assert.equal(coders.length, 3);
    assert.equal(coders[2].agent, 'ns-dev-coder-3');
  });

  it('worktree roles exclude non-worktree agents', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    const expanded = expandAgentInstances(config);
    const worktreeRoles = expanded
      .filter(a => a.definition.worktree !== false)
      .map(a => a.role);

    assert.ok(!worktreeRoles.includes('producer'));
    assert.ok(worktreeRoles.includes('planner'));
    assert.ok(worktreeRoles.includes('coder-1'));
    assert.equal(worktreeRoles.length, 5);
  });
});

describe('init: profile generation from templates', () => {
  function generateProfile(role: string, instanceNumber?: number) {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    const presetDir = join(PRESETS_DIR, 'dev');
    const baseRole = instanceNumber ? role.replace(/-\d+$/, '') : role;
    const template = readFileSync(join(presetDir, 'agents', `${baseRole}.md`), 'utf-8');
    const vars = buildTemplateVars(config, baseRole, 'test-repo', 'main', instanceNumber);
    return generateAgentFile({
      teamConfig: config,
      agentName: baseRole,
      behaviorTemplate: template,
      templateVars: vars,
      instanceNumber,
    });
  }

  it('all 5 behavior templates exist', () => {
    for (const role of ['producer', 'planner', 'reviewer', 'coder', 'tester']) {
      const path = join(PRESETS_DIR, 'dev', 'agents', `${role}.md`);
      assert.ok(existsSync(path), `Missing: ${role}.md`);
    }
  });

  it('generates all agents without unrendered vars', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    const expanded = expandAgentInstances(config);
    for (const entry of expanded) {
      const result = generateProfile(entry.role, entry.instanceNumber);
      assert.ok(!result.match(/\{\{[a-z_]+\}\}/), `Unrendered vars in ${entry.agent}`);
      assert.ok(result.includes(`name: ${entry.agent}`));
    }
  });

  it('producer has gh issue list in PIPELINE-AGENT, no lock check', () => {
    const result = generateProfile('producer');
    const block = result.split('<PIPELINE-AGENT>')[1].split('</PIPELINE-AGENT>')[0];
    assert.ok(block.includes('gh issue list'));
    assert.ok(block.includes('Skills are NEVER needed'));
  });

  it('planner has lock check in PIPELINE-AGENT', () => {
    const result = generateProfile('planner');
    const block = result.split('<PIPELINE-AGENT>')[1].split('</PIPELINE-AGENT>')[0];
    assert.ok(block.includes('.lock'));
    assert.ok(block.includes('Only invoke skills AFTER'));
  });

  it('coder-1 has correct identity throughout', () => {
    const result = generateProfile('coder-1', 1);
    assert.ok(result.includes('name: ns-dev-coder-1'));
    assert.ok(result.includes('@ns-dev-coder-1'));
    assert.ok(result.includes('status/coder-1'));
    assert.ok(result.includes('_ns/dev/coder-1'));
    assert.ok(result.includes('ns-dev-coder-1.lock'));
  });

  it('generated profiles have Team Protocol section', () => {
    const result = generateProfile('reviewer');
    assert.ok(result.includes('## Team Protocol (Generated)'));
    assert.ok(result.includes('### Finding Work'));
    assert.ok(result.includes('### Transitions'));
    assert.ok(result.includes('### Status Reporting'));
  });

  it('generated producer has no Claiming/Locking/Branch sections', () => {
    const result = generateProfile('producer');
    assert.ok(result.includes('## Team Protocol (Generated)'));
    assert.ok(!result.includes('### Claiming Work'));
    assert.ok(!result.includes('### Locking'));
    assert.ok(!result.includes('### Branch Protocol'));
  });
});
