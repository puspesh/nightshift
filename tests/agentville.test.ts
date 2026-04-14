import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorldConfig } from '../lib/world-config.js';
import { getPidFilePath, getPortFilePath, isAgentvilleRunning } from '../lib/agentville.js';
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

  it('generates desk+chair props per agent', () => {
    const agents = makeAgents(1); // 5 agents
    const config = generateWorldConfig(agents, 'dev');
    // 2 props per agent: desk + chair
    assert.equal(config.props.length, 10);
    const desks = config.props.filter(p => p.id.startsWith('desk_corner'));
    const chairs = config.props.filter(p => p.id === 'desk_chair_dark');
    assert.equal(desks.length, 5);
    assert.equal(chairs.length, 5);
  });

  it('citizen names match agent roles', () => {
    const agents = makeAgents(2);
    const config = generateWorldConfig(agents, 'dev');
    const names = config.citizens.map(c => c.name);
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

  it('desk props do not overlap for various team sizes', () => {
    for (const coderCount of [1, 2, 3, 4]) {
      const agents = makeAgents(coderCount);
      const config = generateWorldConfig(agents, 'dev');
      const desks = config.props.filter(p => p.id.startsWith('desk_corner'));
      for (let i = 0; i < desks.length; i++) {
        for (let j = i + 1; j < desks.length; j++) {
          const a = desks[i], b = desks[j];
          const xOverlap = a.x < b.x + b.w && b.x < a.x + a.w;
          const yOverlap = a.y < b.y + b.h && b.y < a.y + a.h;
          assert.ok(!(xOverlap && yOverlap),
            `Desks ${i} (x=${a.x.toFixed(1)}) and ${j} (x=${b.x.toFixed(1)}) overlap with ${coderCount} coders`);
        }
      }
    }
  });

  it('uses gear-supply theme', () => {
    const agents = makeAgents(1);
    const config = generateWorldConfig(agents, 'dev');
    assert.equal(config.theme, 'gear-supply');
  });

  it('citizens have name and sprite fields', () => {
    const agents = makeAgents(1);
    const config = generateWorldConfig(agents, 'dev');
    for (const c of config.citizens) {
      assert.ok(c.name, `${c.id} should have a name`);
      assert.ok(c.sprite, `${c.id} should have a sprite`);
    }
  });

  it('assigns sprites round-robin from available characters', () => {
    const agents = makeAgents(4); // 8 agents total
    const config = generateWorldConfig(agents, 'dev');
    const sprites = config.citizens.map(c => c.sprite);
    // 4 sprites cycle: dexter, morty, nova, rio, dexter, morty, nova, rio
    assert.equal(sprites[0], sprites[4]);
    assert.equal(sprites[1], sprites[5]);
  });

  it('citizen name uses override when provided', () => {
    const agents = makeAgents(1);
    const overrides = { producer: { displayName: 'Boss' } };
    const config = generateWorldConfig(agents, 'dev', overrides);
    const producer = config.citizens.find(c => c.role === 'producer')!;
    assert.equal(producer.name, 'Boss');
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
    assert.equal(producer.name, 'producer');
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

  it('assigns spawn positions when baseWorld is provided', () => {
    const agents = makeAgents(1);
    const baseWorld = {
      floor: Array.from({ length: 6 }, () => Array(6).fill('tile')),
      gridCols: 6,
      gridRows: 6,
      props: [],
    };
    const config = generateWorldConfig(agents, 'dev', {}, baseWorld);
    for (const citizen of config.citizens) {
      assert.ok(citizen.position, `${citizen.role} should have a position`);
      assert.equal(typeof citizen.position.x, 'number', 'position.x should be a number');
      assert.equal(typeof citizen.position.y, 'number', 'position.y should be a number');
    }
  });

  it('assigns default desk positions when baseWorld is not provided', () => {
    const agents = makeAgents(1);
    const config = generateWorldConfig(agents, 'dev');
    for (const citizen of config.citizens) {
      assert.ok(citizen.position, `${citizen.role} should have a default position`);
      assert.equal(typeof citizen.position.x, 'number', 'position.x should be a number');
      assert.equal(typeof citizen.position.y, 'number', 'position.y should be a number');
    }
  });
});

describe('PID file helpers', () => {
  it('getPidFilePath returns global path', () => {
    const p = getPidFilePath();
    assert.ok(
      p.includes('.agentville/agentville.pid') || p.includes('.nightshift/agentville.pid'),
      'PID file path should be under ~/.agentville/ or ~/.nightshift/',
    );
  });

  it('getPortFilePath returns global path', () => {
    const p = getPortFilePath();
    assert.ok(
      p.includes('.agentville/agentville.port') || p.includes('.nightshift/agentville.port'),
      'Port file path should be under ~/.agentville/ or ~/.nightshift/',
    );
  });

  it('isAgentvilleRunning returns false when no PID file', { skip: isAgentvilleRunning() ? 'server is currently running' : undefined }, () => {
    assert.equal(isAgentvilleRunning(), false);
  });
});
