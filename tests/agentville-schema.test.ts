import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorldState } from '../lib/agentville/schema.js';
import type { AgentvilleWorld } from '../lib/agentville/schema.js';

function validWorld(): AgentvilleWorld {
  return {
    schemaVersion: 1,
    coins: 100,
    inventory: [],
    world: {
      floors: [
        {
          id: 'floor_0',
          name: 'Ground Floor',
          rooms: [
            { id: 'room_0', name: 'Main Office', width: 12, height: 8, style: 'basic' },
          ],
        },
      ],
    },
    agents: {},
    stats: {
      totalCoinsEarned: 100,
      totalCoinsSpent: 0,
      totalWorkCompleted: 5,
      streakDays: 3,
      lastActiveDate: '2026-04-14',
      timezone: 'America/New_York',
    },
    cloudSync: {
      lastSyncedAt: null,
      syncSequence: 0,
    },
  };
}

describe('validateWorldState', () => {
  it('validates a correct world', () => {
    const world = validWorld();
    const result = validateWorldState(world);
    assert.deepEqual(result, world);
  });

  it('rejects null', () => {
    assert.equal(validateWorldState(null), null);
  });

  it('rejects non-object', () => {
    assert.equal(validateWorldState('string'), null);
    assert.equal(validateWorldState(42), null);
    assert.equal(validateWorldState(undefined), null);
  });

  it('rejects wrong schema version', () => {
    const world = validWorld();
    (world as any).schemaVersion = 2;
    assert.equal(validateWorldState(world), null);
  });

  it('rejects missing fields', () => {
    const world = validWorld();
    delete (world as any).coins;
    assert.equal(validateWorldState(world), null);
  });

  it('rejects missing stats', () => {
    const world = validWorld();
    delete (world as any).stats;
    assert.equal(validateWorldState(world), null);
  });

  it('rejects missing cloudSync', () => {
    const world = validWorld();
    delete (world as any).cloudSync;
    assert.equal(validateWorldState(world), null);
  });

  it('rejects missing world layout', () => {
    const world = validWorld();
    delete (world as any).world;
    assert.equal(validateWorldState(world), null);
  });

  it('accepts world with inventory items', () => {
    const world = validWorld();
    world.inventory = [
      {
        id: 'item_1',
        catalogId: 'desk_basic',
        type: 'desk',
        placed: true,
        placedAt: { roomId: 'room_0', x: 2, y: 3 },
      },
      {
        id: 'item_2',
        catalogId: 'plant_fern',
        type: 'decoration',
        placed: false,
        placedAt: null,
      },
    ];
    const result = validateWorldState(world);
    assert.ok(result);
    assert.equal(result!.inventory.length, 2);
  });

  it('accepts world with agents', () => {
    const world = validWorld();
    world.agents = {
      'claude/coder-1': {
        source: 'claude',
        name: 'coder-1',
        cosmetic: 'default',
        accessories: ['hat_cowboy'],
        desk: 'item_1',
      },
    };
    const result = validateWorldState(world);
    assert.ok(result);
    assert.equal(Object.keys(result!.agents).length, 1);
  });

  it('rejects invalid inventory item type', () => {
    const world = validWorld();
    world.inventory = [
      {
        id: 'item_1',
        catalogId: 'desk_basic',
        type: 'invalid' as any,
        placed: false,
        placedAt: null,
      },
    ];
    assert.equal(validateWorldState(world), null);
  });

  it('rejects invalid agent record', () => {
    const world = validWorld();
    (world as any).agents = {
      'claude/coder-1': { source: 'claude', name: 123 },
    };
    assert.equal(validateWorldState(world), null);
  });

  it('rejects array as input', () => {
    assert.equal(validateWorldState([]), null);
  });
});
