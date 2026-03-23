import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateWorldConfig, writeWorldConfig } from '../lib/world-config.js';
import { getPidFilePath, getPortFilePath, isServerRunning } from '../lib/visualize.js';
import type { AgentEntry } from '../lib/types.js';

function makeAgents(coderCount: number): AgentEntry[] {
  const agents: AgentEntry[] = [
    { role: 'producer', agent: 'ns-dev-producer', cwd: '/repo' },
    { role: 'planner', agent: 'ns-dev-planner', cwd: '/wt/planner' },
    { role: 'reviewer', agent: 'ns-dev-reviewer', cwd: '/wt/reviewer' },
  ];
  for (let i = 1; i <= coderCount; i++) {
    agents.push({ role: `coder-${i}`, agent: `ns-dev-coder-${i}`, cwd: `/wt/coder-${i}` });
  }
  agents.push({ role: 'tester', agent: 'ns-dev-tester', cwd: '/wt/tester' });
  return agents;
}

describe('generateWorldConfig', () => {
  it('generates 5 workstations for 1 coder (5 agents)', () => {
    const agents = makeAgents(1);
    const config = generateWorldConfig(agents, 'dev');
    assert.equal(config.workstations.length, 5);
    assert.equal(config.citizens.length, 5);
  });

  it('generates 8 workstations for 4 coders (8 agents)', () => {
    const agents = makeAgents(4);
    const config = generateWorldConfig(agents, 'dev');
    assert.equal(config.workstations.length, 8);
    assert.equal(config.citizens.length, 8);
  });

  it('citizen names match agent roles', () => {
    const agents = makeAgents(2);
    const config = generateWorldConfig(agents, 'dev');
    const names = config.citizens.map(c => c.displayName);
    assert.deepEqual(names, ['producer', 'planner', 'reviewer', 'coder-1', 'coder-2', 'tester']);
  });

  it('citizen IDs follow ns-{team}-{role} pattern', () => {
    const agents = makeAgents(1);
    const config = generateWorldConfig(agents, 'dev');
    assert.equal(config.citizens[0].id, 'ns-dev-producer');
    assert.equal(config.citizens[3].id, 'ns-dev-coder-1');
  });

  it('workstation positions do not overlap', () => {
    const agents = makeAgents(4);
    const config = generateWorldConfig(agents, 'dev');
    const positions = config.workstations.map(w => `${w.x},${w.y}`);
    const unique = new Set(positions);
    assert.equal(unique.size, positions.length, 'Workstations must have unique positions');
  });

  it('uses gear-supply theme', () => {
    const agents = makeAgents(1);
    const config = generateWorldConfig(agents, 'dev');
    assert.equal(config.theme, 'gear-supply');
  });

  it('citizen displayName uses override when provided', () => {
    const agents = makeAgents(1);
    const overrides = { producer: { displayName: 'Boss' } };
    const config = generateWorldConfig(agents, 'dev', overrides);
    const producer = config.citizens.find(c => c.role === 'producer')!;
    assert.equal(producer.displayName, 'Boss');
  });

  it('citizen color uses override when provided', () => {
    const agents = makeAgents(1);
    const overrides = { producer: { color: '#ff0000' } };
    const config = generateWorldConfig(agents, 'dev', overrides);
    const producer = config.citizens.find(c => c.role === 'producer')!;
    assert.equal(producer.color, '#ff0000');
  });

  it('without overrides, behavior matches defaults', () => {
    const agents = makeAgents(1);
    const config = generateWorldConfig(agents, 'dev');
    const producer = config.citizens.find(c => c.role === 'producer')!;
    assert.equal(producer.displayName, 'producer');
    assert.equal(producer.color, '#00cccc');
    const coder = config.citizens.find(c => c.role === 'coder-1')!;
    assert.equal(coder.color, '#0066cc');
  });

  it('sets correct canvas dimensions', () => {
    const agents = makeAgents(1);
    const config = generateWorldConfig(agents, 'dev');
    assert.equal(config.canvas.width, 512);
    assert.equal(config.canvas.height, 384);
    assert.equal(config.tileSize, 32);
    assert.equal(config.scale, 2);
  });
});

describe('writeWorldConfig', () => {
  const tmp = join(tmpdir(), `ns-worldconfig-test-${Date.now()}`);

  afterEach(() => {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('writes world.json to the output directory', () => {
    const agents = makeAgents(1);
    const config = generateWorldConfig(agents, 'dev');
    const outDir = join(tmp, 'world');
    writeWorldConfig(config, outDir);

    const written = JSON.parse(readFileSync(join(outDir, 'world.json'), 'utf-8'));
    assert.equal(written.theme, 'gear-supply');
    assert.equal(written.workstations.length, 5);
  });
});

describe('PID file helpers', () => {
  it('getPidFilePath returns expected path', () => {
    const p = getPidFilePath('myapp', 'dev');
    assert.ok(p.includes('.nightshift/myapp/dev/miniverse.pid'));
  });

  it('getPortFilePath returns expected path', () => {
    const p = getPortFilePath('myapp', 'dev');
    assert.ok(p.includes('.nightshift/myapp/dev/miniverse.port'));
  });

  it('isServerRunning returns false when no PID file', () => {
    assert.equal(isServerRunning('nonexistent-repo-xyz', 'dev'), false);
  });
});
