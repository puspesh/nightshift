import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseTeamConfig,
  parseTeamConfigFromString,
  validateTeamConfig,
  getLabelsFromConfig,
  getAgentRoles,
  getScalableAgents,
  expandAgentInstances,
} from '../lib/team-config.js';
import type { TeamConfig } from '../lib/team-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Tests run from dist/tests/ — presets are at repo root, two levels up
const PRESETS_DIR = join(__dirname, '..', '..', 'presets');

const VALID_YAML = `
name: dev
description: Software development team

stages:
  - name: planning
    color: "1d76db"
  - name: plan-review
    color: "5319e7"
  - name: approved
    color: "0e8a16"
  - name: code-review
    color: "5319e7"
  - name: testing
    color: "1d76db"
  - name: ready-to-merge
    color: "0e8a16"
  - name: wip
    color: "ededed"
    meta: true
  - name: blocked
    color: "d93f0b"
    meta: true

agents:
  producer:
    description: Triages new issues
    watches: [unlabeled, ready-to-merge]
    transitions:
      triage-feature: planning
      triage-bug: approved
    tools: [Read, Grep, Glob, Bash]
    model: sonnet
    worktree: false

  planner:
    description: Writes implementation plans
    watches: [planning]
    transitions:
      success: plan-review
      error: blocked
    tools: [Read, Grep, Glob, Bash, Write, Edit, Agent]
    model: opus
    worktree: true

  coder:
    description: Implements from approved plans
    watches: [approved]
    transitions:
      success: code-review
      error: blocked
    tools: [Read, Grep, Glob, Bash, Write, Edit, Agent, Skill]
    model: opus
    scalable: true
    instances: 2
    max_instances: 4
`;

describe('parseTeamConfigFromString', () => {
  it('parses valid YAML into TeamConfig', () => {
    const config = parseTeamConfigFromString(VALID_YAML);
    assert.equal(config.name, 'dev');
    assert.equal(config.description, 'Software development team');
    assert.equal(config.stages.length, 8);
    assert.equal(Object.keys(config.agents).length, 3);
  });

  it('throws on empty input', () => {
    assert.throws(() => parseTeamConfigFromString(''), /Invalid team.yaml/);
  });

  it('throws on non-object YAML', () => {
    assert.throws(() => parseTeamConfigFromString('just a string'), /Invalid team.yaml/);
  });
});

describe('validateTeamConfig', () => {
  it('passes for valid config', () => {
    const config = parseTeamConfigFromString(VALID_YAML);
    const result = validateTeamConfig(config);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('fails when wip meta stage is missing', () => {
    const yaml = VALID_YAML.replace(
      '  - name: wip\n    color: "ededed"\n    meta: true',
      ''
    );
    const config = parseTeamConfigFromString(yaml);
    const result = validateTeamConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.message.includes('wip')));
  });

  it('fails when wip exists but without meta: true', () => {
    const yaml = VALID_YAML.replace('    meta: true\n  - name: blocked', '    meta: false\n  - name: blocked');
    const config = parseTeamConfigFromString(yaml);
    const result = validateTeamConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.message.includes('wip')));
  });

  it('fails when transition targets undefined stage', () => {
    const yaml = VALID_YAML.replace('triage-feature: planning', 'triage-feature: nonexistent');
    const config = parseTeamConfigFromString(yaml);
    const result = validateTeamConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.message.includes('nonexistent')));
  });

  it('fails when watches references undefined stage', () => {
    const yaml = VALID_YAML.replace('watches: [planning]', 'watches: [nonexistent]');
    const config = parseTeamConfigFromString(yaml);
    const result = validateTeamConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.message.includes('nonexistent')));
  });

  it('allows "unlabeled" in watches', () => {
    const config = parseTeamConfigFromString(VALID_YAML);
    const result = validateTeamConfig(config);
    assert.equal(result.valid, true);
    // producer watches "unlabeled" — should not error
  });

  it('fails when instances exceeds max_instances', () => {
    const yaml = VALID_YAML.replace('instances: 2', 'instances: 5');
    const config = parseTeamConfigFromString(yaml);
    const result = validateTeamConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.message.includes('instances') && e.message.includes('max_instances')));
  });

  it('fails on duplicate stage names', () => {
    const yaml = VALID_YAML.replace(
      '  - name: plan-review\n    color: "5319e7"',
      '  - name: planning\n    color: "5319e7"'
    );
    const config = parseTeamConfigFromString(yaml);
    const result = validateTeamConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.message.includes('Duplicate')));
  });

  it('rejects invalid team names', () => {
    const yaml = VALID_YAML.replace('name: dev', 'name: Dev-Team!');
    const config = parseTeamConfigFromString(yaml);
    const result = validateTeamConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.field === 'name'));
  });

  it('rejects team name starting with digit', () => {
    const yaml = VALID_YAML.replace('name: dev', 'name: 1team');
    const config = parseTeamConfigFromString(yaml);
    const result = validateTeamConfig(config);
    assert.equal(result.valid, false);
  });

  it('rejects team name ending with hyphen', () => {
    const yaml = VALID_YAML.replace('name: dev', 'name: team-');
    const config = parseTeamConfigFromString(yaml);
    const result = validateTeamConfig(config);
    assert.equal(result.valid, false);
  });
});

describe('getLabelsFromConfig', () => {
  it('extracts labels from stages', () => {
    const config = parseTeamConfigFromString(VALID_YAML);
    const labels = getLabelsFromConfig(config);
    assert.equal(labels.length, 8);
    assert.equal(labels[0].status, 'planning');
    assert.equal(labels[0].color, '1d76db');
  });

  it('marks meta stages in description', () => {
    const config = parseTeamConfigFromString(VALID_YAML);
    const labels = getLabelsFromConfig(config);
    const wipLabel = labels.find(l => l.status === 'wip');
    assert.ok(wipLabel);
    assert.ok(wipLabel.description.includes('meta'));
  });
});

describe('getAgentRoles', () => {
  it('returns ordered role names', () => {
    const config = parseTeamConfigFromString(VALID_YAML);
    const roles = getAgentRoles(config);
    assert.deepEqual(roles, ['producer', 'planner', 'coder']);
  });
});

describe('getScalableAgents', () => {
  it('returns only scalable agents', () => {
    const config = parseTeamConfigFromString(VALID_YAML);
    const scalable = getScalableAgents(config);
    assert.deepEqual(scalable, ['coder']);
  });
});

describe('expandAgentInstances', () => {
  it('expands scalable agents to N instances', () => {
    const config = parseTeamConfigFromString(VALID_YAML);
    const expanded = expandAgentInstances(config);

    // producer + planner + coder-1 + coder-2 = 4
    assert.equal(expanded.length, 4);
    assert.equal(expanded[0].role, 'producer');
    assert.equal(expanded[0].agent, 'ns-dev-producer');
    assert.equal(expanded[1].role, 'planner');
    assert.equal(expanded[1].agent, 'ns-dev-planner');
    assert.equal(expanded[2].role, 'coder-1');
    assert.equal(expanded[2].agent, 'ns-dev-coder-1');
    assert.equal(expanded[2].instanceNumber, 1);
    assert.equal(expanded[3].role, 'coder-2');
    assert.equal(expanded[3].agent, 'ns-dev-coder-2');
    assert.equal(expanded[3].instanceNumber, 2);
  });

  it('respects overrides', () => {
    const config = parseTeamConfigFromString(VALID_YAML);
    const expanded = expandAgentInstances(config, { coder: 3 });
    const coders = expanded.filter(a => a.role.startsWith('coder-'));
    assert.equal(coders.length, 3);
  });

  it('throws when override exceeds max_instances', () => {
    const config = parseTeamConfigFromString(VALID_YAML);
    assert.throws(
      () => expandAgentInstances(config, { coder: 5 }),
      /max_instances/
    );
  });

  it('non-scalable agents are not expanded', () => {
    const config = parseTeamConfigFromString(VALID_YAML);
    const expanded = expandAgentInstances(config);
    const producer = expanded.find(a => a.role === 'producer');
    assert.ok(producer);
    assert.equal(producer.instanceNumber, undefined);
  });
});

// --- Integration tests: presets/content/team.yaml ---

describe('presets/content/team.yaml', () => {
  it('parses without errors', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'content', 'team.yaml'));
    assert.equal(config.name, 'content');
    assert.equal(config.description, 'Content creation pipeline');
  });

  it('validates with zero errors', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'content', 'team.yaml'));
    const result = validateTeamConfig(config);
    assert.equal(result.valid, true, `Validation errors: ${result.errors.map(e => e.message).join(', ')}`);
  });

  it('has required wip stage with meta', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'content', 'team.yaml'));
    const wipStage = config.stages.find(s => s.name === 'wip');
    assert.ok(wipStage, 'wip stage should exist');
    assert.equal(wipStage.meta, true, 'wip stage should have meta: true');
  });

  it('has all 4 agents', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'content', 'team.yaml'));
    const roles = getAgentRoles(config);
    assert.deepEqual(roles, ['producer', 'researcher', 'writer', 'reviewer']);
  });

  it('agent watches reference valid stages', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'content', 'team.yaml'));
    const stageNames = config.stages.map(s => s.name);
    for (const [role, agent] of Object.entries(config.agents)) {
      for (const watch of agent.watches) {
        assert.ok(
          watch === 'unlabeled' || stageNames.includes(watch),
          `Agent "${role}" watches unknown stage "${watch}"`,
        );
      }
    }
  });

  it('agent transitions reference valid stages', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'content', 'team.yaml'));
    const stageNames = config.stages.map(s => s.name);
    for (const [role, agent] of Object.entries(config.agents)) {
      if (agent.transitions) {
        for (const [action, target] of Object.entries(agent.transitions)) {
          assert.ok(
            stageNames.includes(target),
            `Agent "${role}" transition "${action}" targets unknown stage "${target}"`,
          );
        }
      }
    }
  });

  it('has 9 stages', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'content', 'team.yaml'));
    assert.equal(config.stages.length, 9);
  });
});

// --- Integration tests: presets/dev/team.yaml ---

describe('presets/dev/team.yaml', () => {
  it('parses without errors', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    assert.equal(config.name, 'dev');
    assert.equal(config.description, 'Software development team');
  });

  it('validates with zero errors', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    const result = validateTeamConfig(config);
    assert.equal(result.valid, true, `Validation errors: ${result.errors.map(e => e.message).join(', ')}`);
  });

  it('has 11 stages defined in team.yaml', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    assert.equal(config.stages.length, 11);

    const expectedStages = [
      'planning', 'plan-review', 'plan-revising', 'approved',
      'code-review', 'code-revising', 'testing', 'ready-to-merge',
      'wip', 'blocked', 'needs-info',
    ];
    const actual = config.stages.map(s => s.name);
    assert.deepEqual(actual, expectedStages);
  });

  it('stage colors are defined correctly', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    const colorMap: Record<string, string> = {
      'planning': '1d76db', 'plan-review': '5319e7', 'plan-revising': 'fbca04',
      'approved': '0e8a16', 'code-review': '5319e7', 'code-revising': 'fbca04',
      'testing': '1d76db', 'ready-to-merge': '0e8a16',
      'wip': 'ededed', 'blocked': 'd93f0b', 'needs-info': 'd93f0b',
    };
    for (const stage of config.stages) {
      assert.equal(stage.color, colorMap[stage.name], `Color mismatch for stage "${stage.name}"`);
    }
  });

  it('has 5 agents', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    const roles = getAgentRoles(config);
    assert.equal(roles.length, 5);
    assert.deepEqual(roles, ['producer', 'planner', 'reviewer', 'coder', 'tester']);
  });

  it('coder is scalable with instances: 2, max_instances: 4', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    const coder = config.agents['coder'];
    assert.equal(coder.scalable, true);
    assert.equal(coder.instances, 2);
    assert.equal(coder.max_instances, 4);
  });

  it('producer has worktree: false', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    const producer = config.agents['producer'];
    assert.equal(producer.worktree, false);
  });

  it('label extraction produces correct count from team.yaml stages', () => {
    const config = parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
    const labels = getLabelsFromConfig(config);
    assert.equal(labels.length, 11); // one label per stage
  });
});
