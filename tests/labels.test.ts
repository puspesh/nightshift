import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTeamConfig, getLabelsFromConfig } from '../lib/team-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const presetDir = join(__dirname, '..', '..', 'presets', 'dev');

const config = parseTeamConfig(join(presetDir, 'team.yaml'));
const labels = getLabelsFromConfig(config);

describe('getLabelsFromConfig (dev team.yaml)', () => {
  it('label count matches stages count', () => {
    assert.equal(labels.length, config.stages.length, `Expected ${config.stages.length} labels, got ${labels.length}`);
  });

  it('all labels have status, color, and description', () => {
    for (const label of labels) {
      assert.ok(label.status, 'label should have a status');
      assert.ok(label.color, `${label.status} should have a color`);
      assert.ok(
        label.description,
        `${label.status} should have a description`
      );
    }
  });

  it('all colors are valid 6-char hex (no # prefix)', () => {
    for (const label of labels) {
      assert.match(
        label.color,
        /^[0-9a-fA-F]{6}$/,
        `${label.status} color "${label.color}" should be valid hex`
      );
    }
  });

  it('has the required pipeline statuses', () => {
    const statuses = labels.map((l) => l.status);
    const required = [
      'planning',
      'plan-review',
      'approved',
      'code-review',
      'testing',
      'ready-to-merge',
      'blocked',
      'needs-info',
      'wip',
    ];
    for (const status of required) {
      assert.ok(
        statuses.includes(status),
        `missing required status: ${status}`
      );
    }
  });

  it('has no duplicate statuses', () => {
    const statuses = labels.map((l) => l.status);
    assert.equal(
      statuses.length,
      new Set(statuses).size,
      'duplicate statuses found'
    );
  });
});
