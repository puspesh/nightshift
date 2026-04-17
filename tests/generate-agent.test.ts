import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateAgentFile,
  generateFrontmatter,
  generateTeamProtocol,
  buildTemplateVars,
} from '../lib/generate-agent.js';
import { parseTeamConfig, parseTeamConfigFromString } from '../lib/team-config.js';
import type { TeamConfig, AgentDefinition } from '../lib/team-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PRESETS_DIR = join(__dirname, '..', '..', 'presets');

const TEAM_YAML = `
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

function getConfig(): TeamConfig {
  return parseTeamConfigFromString(TEAM_YAML);
}

// --- generateFrontmatter ---

describe('generateFrontmatter', () => {
  it('generates correct YAML frontmatter', () => {
    const config = getConfig();
    const result = generateFrontmatter(config.agents['planner'], 'ns-dev-planner');
    assert.ok(result.startsWith('---\n'));
    assert.ok(result.includes('name: ns-dev-planner'));
    assert.ok(result.includes('description: >'));
    assert.ok(result.includes('Writes implementation plans'));
    assert.ok(result.includes('tools: Read, Grep, Glob, Bash, Write, Edit, Agent'));
    assert.ok(result.includes('model: opus'));
    assert.ok(result.includes('memory: project'));
    assert.ok(result.endsWith('---\n'));
  });

  it('joins tools with comma-space', () => {
    const config = getConfig();
    const result = generateFrontmatter(config.agents['producer'], 'ns-dev-producer');
    assert.ok(result.includes('tools: Read, Grep, Glob, Bash'));
  });

  it('uses model from agent definition', () => {
    const config = getConfig();
    const result = generateFrontmatter(config.agents['producer'], 'ns-dev-producer');
    assert.ok(result.includes('model: sonnet'));
  });
});

// --- generateTeamProtocol ---

describe('generateTeamProtocol', () => {
  it('includes Finding Work section with watch labels', () => {
    const config = getConfig();
    const result = generateTeamProtocol(config, 'planner', 'ns-dev-planner', 'planner');
    assert.ok(result.includes('### Finding Work'));
    assert.ok(result.includes('`dev:planning`'));
    assert.ok(result.includes('gh issue list'));
  });

  it('handles unlabeled watches for producer', () => {
    const config = getConfig();
    const result = generateTeamProtocol(config, 'producer', 'ns-dev-producer', 'producer');
    assert.ok(result.includes('no `dev:*` label'));
    assert.ok(result.includes('`dev:ready-to-merge`'));
  });

  it('includes Claiming section for worktree agents', () => {
    const config = getConfig();
    const result = generateTeamProtocol(config, 'planner', 'ns-dev-planner', 'planner');
    assert.ok(result.includes('### Claiming Work'));
    assert.ok(result.includes('gh issue edit'));
    assert.ok(result.includes('dev:wip'));
  });

  it('excludes Claiming section for non-worktree agents', () => {
    const config = getConfig();
    const result = generateTeamProtocol(config, 'producer', 'ns-dev-producer', 'producer');
    assert.ok(!result.includes('### Claiming Work'));
  });

  it('includes Transitions table', () => {
    const config = getConfig();
    const result = generateTeamProtocol(config, 'planner', 'ns-dev-planner', 'planner');
    assert.ok(result.includes('### Transitions'));
    assert.ok(result.includes('success'));
    assert.ok(result.includes('dev:plan-review'));
    assert.ok(result.includes('error'));
    assert.ok(result.includes('dev:blocked'));
  });

  it('transition commands remove source watch labels and wip', () => {
    const config = getConfig();
    const result = generateTeamProtocol(config, 'planner', 'ns-dev-planner', 'planner');
    assert.ok(result.includes('--remove-label "dev:planning"'));
    assert.ok(result.includes('--remove-label "dev:wip"'), 'wip label must be removed on transition');
  });

  it('includes Locking section with full team_dir-prefixed path', () => {
    const config = getConfig();
    const result = generateTeamProtocol(config, 'planner', 'ns-dev-planner', 'planner');
    assert.ok(result.includes('### Locking'));
    assert.ok(result.includes('dev/locks/ns-dev-planner.lock'), 'Lock path should include team dir segment');
  });

  it('excludes Locking section for non-worktree agents', () => {
    const config = getConfig();
    const result = generateTeamProtocol(config, 'producer', 'ns-dev-producer', 'producer');
    assert.ok(!result.includes('### Locking'));
  });

  it('includes Branch Protocol for worktree agents', () => {
    const config = getConfig();
    const result = generateTeamProtocol(config, 'planner', 'ns-dev-planner', 'planner');
    assert.ok(result.includes('### Branch Protocol'));
    assert.ok(result.includes('_ns/dev/planner'));
  });

  it('excludes Branch Protocol for non-worktree agents', () => {
    const config = getConfig();
    const result = generateTeamProtocol(config, 'producer', 'ns-dev-producer', 'producer');
    assert.ok(!result.includes('### Branch Protocol'));
  });

  it('includes Status Reporting section', () => {
    const config = getConfig();
    const result = generateTeamProtocol(config, 'planner', 'ns-dev-planner', 'planner');
    assert.ok(result.includes('### Status Reporting'));
    assert.ok(result.includes('status/planner'));
  });

  it('uses correct role in status path for scalable agents', () => {
    const config = getConfig();
    const result = generateTeamProtocol(config, 'coder', 'ns-dev-coder-1', 'coder-1');
    assert.ok(result.includes('status/coder-1'));
    assert.ok(result.includes('ns-dev-coder-1.lock'));
    assert.ok(result.includes('_ns/dev/coder-1'));
  });
});

// --- buildTemplateVars ---

describe('buildTemplateVars', () => {
  it('builds standard vars for non-scalable agent', () => {
    const config = getConfig();
    const vars = buildTemplateVars(config, 'planner', 'my-repo', 'main');
    assert.equal(vars.agent_name, 'ns-dev-planner');
    assert.equal(vars.agent_role, 'planner');
    assert.equal(vars.agent_base_role, 'planner');
    assert.equal(vars.team_name, 'dev');
    assert.equal(vars.repo_name, 'my-repo');
    assert.equal(vars.main_branch, 'main');
    assert.equal(vars.team_dir, '~/.nightshift/my-repo/dev');
    assert.equal(vars.home_branch, '_ns/dev/planner');
    assert.equal(vars.instance_number, '');
  });

  it('builds vars for scalable agent instance', () => {
    const config = getConfig();
    const vars = buildTemplateVars(config, 'coder', 'my-repo', 'main', 2);
    assert.equal(vars.agent_name, 'ns-dev-coder-2');
    assert.equal(vars.agent_role, 'coder-2');
    assert.equal(vars.agent_base_role, 'coder');
    assert.equal(vars.home_branch, '_ns/dev/coder-2');
    assert.equal(vars.instance_number, '2');
  });

  it('includes all expected keys', () => {
    const config = getConfig();
    const vars = buildTemplateVars(config, 'producer', 'repo', 'main');
    const expectedKeys = [
      'agent_name', 'agent_role', 'agent_base_role',
      'team_name', 'repo_name', 'main_branch',
      'team_dir', 'home_branch', 'instance_number',
    ];
    for (const key of expectedKeys) {
      assert.ok(key in vars, `Missing key: ${key}`);
    }
  });
});

// --- generateAgentFile (full round-trip) ---

describe('generateAgentFile', () => {
  it('generates a complete agent file for non-worktree agent', () => {
    const config = getConfig();
    const behaviorTemplate = '## Workflow\n\nYou are {{agent_name}} on team {{team_name}}.';
    const vars = buildTemplateVars(config, 'producer', 'my-repo', 'main');

    const result = generateAgentFile({
      teamConfig: config,
      agentName: 'producer',
      behaviorTemplate,
      templateVars: vars,
    });

    // Header
    assert.ok(result.includes('managed by nightshift'));
    // Frontmatter
    assert.ok(result.includes('name: ns-dev-producer'));
    assert.ok(result.includes('model: sonnet'));
    // PIPELINE-AGENT block
    assert.ok(result.includes('<PIPELINE-AGENT>'));
    assert.ok(result.includes('gh issue list'));
    assert.ok(result.includes('Skills are NEVER needed'));
    // Rendered behavior
    assert.ok(result.includes('You are ns-dev-producer on team dev.'));
    // Team Protocol
    assert.ok(result.includes('## Team Protocol (Generated)'));
    assert.ok(result.includes('### Finding Work'));
    assert.ok(result.includes('### Status Reporting'));
    // Non-worktree: no claiming, locking, branch protocol
    assert.ok(!result.includes('### Claiming Work'));
    assert.ok(!result.includes('### Locking'));
    assert.ok(!result.includes('### Branch Protocol'));
  });

  it('generates a complete agent file for worktree agent', () => {
    const config = getConfig();
    const behaviorTemplate = '## Workflow\n\nPlan issues as {{agent_role}}.';
    const vars = buildTemplateVars(config, 'planner', 'my-repo', 'main');

    const result = generateAgentFile({
      teamConfig: config,
      agentName: 'planner',
      behaviorTemplate,
      templateVars: vars,
    });

    // Frontmatter
    assert.ok(result.includes('name: ns-dev-planner'));
    assert.ok(result.includes('model: opus'));
    // PIPELINE-AGENT: lock check for initial command
    assert.ok(result.includes('<PIPELINE-AGENT>'));
    assert.ok(result.includes('.lock'));
    assert.ok(result.includes('Only invoke skills AFTER'));
    // Rendered behavior
    assert.ok(result.includes('Plan issues as planner.'));
    // Team Protocol: has claiming, locking, branch
    assert.ok(result.includes('### Claiming Work'));
    assert.ok(result.includes('### Locking'));
    assert.ok(result.includes('### Branch Protocol'));
  });

  it('generates correct output for scalable agent instance', () => {
    const config = getConfig();
    const behaviorTemplate = '## Workflow\n\nCoder instance {{instance_number}} ({{agent_name}}).';
    const vars = buildTemplateVars(config, 'coder', 'my-repo', 'main', 2);

    const result = generateAgentFile({
      teamConfig: config,
      agentName: 'coder',
      behaviorTemplate,
      templateVars: vars,
      instanceNumber: 2,
    });

    assert.ok(result.includes('name: ns-dev-coder-2'));
    assert.ok(result.includes('Coder instance 2 (ns-dev-coder-2).'));
    assert.ok(result.includes('status/coder-2'));
    assert.ok(result.includes('ns-dev-coder-2.lock'));
    assert.ok(result.includes('_ns/dev/coder-2'));
  });

  it('throws for unknown agent name', () => {
    const config = getConfig();
    assert.throws(
      () => generateAgentFile({
        teamConfig: config,
        agentName: 'nonexistent',
        behaviorTemplate: '',
        templateVars: {},
      }),
      /not found in team config/,
    );
  });

  it('throws when template has undefined variables', () => {
    const config = getConfig();
    const behaviorTemplate = '{{undefined_var}} should fail';
    const vars = buildTemplateVars(config, 'producer', 'repo', 'main');

    assert.throws(
      () => generateAgentFile({
        teamConfig: config,
        agentName: 'producer',
        behaviorTemplate,
        templateVars: vars,
      }),
      /Undefined template variables/,
    );
  });
});

// --- Integration: dev preset round-trip ---

describe('dev preset round-trip', () => {
  function loadDevTemplate(role: string): string {
    return readFileSync(join(PRESETS_DIR, 'dev', 'agents', `${role}.md`), 'utf-8');
  }

  function devConfig(): TeamConfig {
    return parseTeamConfig(join(PRESETS_DIR, 'dev', 'team.yaml'));
  }

  it('renders producer template without undefined vars', () => {
    const config = devConfig();
    const template = loadDevTemplate('producer');
    const vars = buildTemplateVars(config, 'producer', 'test-repo', 'main');
    const result = generateAgentFile({
      teamConfig: config,
      agentName: 'producer',
      behaviorTemplate: template,
      templateVars: vars,
    });
    // Should contain rendered agent name
    assert.ok(result.includes('@ns-dev-producer'));
    // Should NOT contain any unrendered mustache vars
    assert.ok(!result.match(/\{\{[a-z_]+\}\}/), 'Found unrendered template vars');
    // Non-worktree agent: initial command has gh issue list
    assert.ok(result.includes('gh issue list --state open'));
  });

  it('renders planner template without undefined vars', () => {
    const config = devConfig();
    const template = loadDevTemplate('planner');
    const vars = buildTemplateVars(config, 'planner', 'test-repo', 'main');
    const result = generateAgentFile({
      teamConfig: config,
      agentName: 'planner',
      behaviorTemplate: template,
      templateVars: vars,
    });
    assert.ok(result.includes('@ns-dev-planner'));
    assert.ok(!result.match(/\{\{[a-z_]+\}\}/), 'Found unrendered template vars');
    assert.ok(result.includes('_ns/dev/planner'));
  });

  it('renders reviewer template without undefined vars', () => {
    const config = devConfig();
    const template = loadDevTemplate('reviewer');
    const vars = buildTemplateVars(config, 'reviewer', 'test-repo', 'main');
    const result = generateAgentFile({
      teamConfig: config,
      agentName: 'reviewer',
      behaviorTemplate: template,
      templateVars: vars,
    });
    assert.ok(result.includes('@ns-dev-reviewer'));
    assert.ok(!result.match(/\{\{[a-z_]+\}\}/), 'Found unrendered template vars');
  });

  it('renders coder template for instance 1', () => {
    const config = devConfig();
    const template = loadDevTemplate('coder');
    const vars = buildTemplateVars(config, 'coder', 'test-repo', 'main', 1);
    const result = generateAgentFile({
      teamConfig: config,
      agentName: 'coder',
      behaviorTemplate: template,
      templateVars: vars,
      instanceNumber: 1,
    });
    assert.ok(result.includes('name: ns-dev-coder-1'));
    assert.ok(result.includes('@ns-dev-coder-1'));
    assert.ok(result.includes('_ns/dev/coder-1'));
    assert.ok(!result.match(/\{\{[a-z_]+\}\}/), 'Found unrendered template vars');
  });

  it('renders coder template for instance 2', () => {
    const config = devConfig();
    const template = loadDevTemplate('coder');
    const vars = buildTemplateVars(config, 'coder', 'test-repo', 'main', 2);
    const result = generateAgentFile({
      teamConfig: config,
      agentName: 'coder',
      behaviorTemplate: template,
      templateVars: vars,
      instanceNumber: 2,
    });
    assert.ok(result.includes('name: ns-dev-coder-2'));
    assert.ok(result.includes('status/coder-2'));
    assert.ok(!result.match(/\{\{[a-z_]+\}\}/), 'Found unrendered template vars');
  });

  it('renders tester template without undefined vars', () => {
    const config = devConfig();
    const template = loadDevTemplate('tester');
    const vars = buildTemplateVars(config, 'tester', 'test-repo', 'main');
    const result = generateAgentFile({
      teamConfig: config,
      agentName: 'tester',
      behaviorTemplate: template,
      templateVars: vars,
    });
    assert.ok(result.includes('@ns-dev-tester'));
    assert.ok(!result.match(/\{\{[a-z_]+\}\}/), 'Found unrendered template vars');
  });

  it('rendered producer contains dev: labels (not template vars)', () => {
    const config = devConfig();
    const template = loadDevTemplate('producer');
    const vars = buildTemplateVars(config, 'producer', 'test-repo', 'main');
    const result = generateAgentFile({
      teamConfig: config,
      agentName: 'producer',
      behaviorTemplate: template,
      templateVars: vars,
    });
    assert.ok(result.includes('dev:planning'));
    assert.ok(result.includes('dev:approved'));
    assert.ok(result.includes('dev:wip'));
  });
});
