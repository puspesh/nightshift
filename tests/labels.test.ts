import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLabels } from '../lib/labels.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const presetDir = join(__dirname, '..', 'presets', 'dev');

const labels = loadLabels(presetDir);

describe('loadLabels from labels.json', () => {
  it('has exactly 11 labels', () => {
    assert.equal(labels.length, 11);
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
      'plan-revising',
      'approved',
      'code-review',
      'code-revising',
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
