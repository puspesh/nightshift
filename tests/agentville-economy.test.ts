import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCatalogItem,
  getCatalogByType,
  getBaseRate,
  rollDrop,
  DEFAULT_COSMETICS,
} from '../lib/agentville/catalog.js';
import {
  calculateMultiplier,
  awardCoins,
} from '../lib/agentville/economy.js';
import { bootstrapWorld } from '../lib/agentville/persistence.js';
import type { AgentvilleWorld } from '../lib/agentville/schema.js';

// Helper: create a fresh world for testing
function freshWorld(): AgentvilleWorld {
  return bootstrapWorld('UTC');
}

// Helper: add an agent to world
function addAgent(world: AgentvilleWorld, key: string, desk: string | null = null): void {
  world.agents[key] = {
    source: 'test',
    name: key,
    cosmetic: DEFAULT_COSMETICS[0],
    accessories: [],
    desk,
  };
}

// --- Catalog ---

describe('getCatalogItem', () => {
  it('returns item for valid catalogId', () => {
    const item = getCatalogItem('desk_basic');
    assert.ok(item);
    assert.equal(item.catalogId, 'desk_basic');
    assert.equal(item.type, 'desk');
    assert.equal(item.price, 200);
  });

  it('returns undefined for unknown catalogId', () => {
    assert.equal(getCatalogItem('nonexistent_item'), undefined);
  });
});

describe('getCatalogByType', () => {
  it('returns all desks', () => {
    const desks = getCatalogByType('desk');
    assert.ok(desks.length >= 4);
    for (const d of desks) assert.equal(d.type, 'desk');
  });

  it('returns all facilities', () => {
    const facilities = getCatalogByType('facility');
    assert.ok(facilities.length >= 10);
    for (const f of facilities) assert.equal(f.type, 'facility');
  });

  it('returns empty for unknown type', () => {
    assert.deepEqual(getCatalogByType('unknown_type'), []);
  });
});

describe('getBaseRate', () => {
  it('returns correct rates for each work type', () => {
    assert.equal(getBaseRate('issue_triaged'), 10);
    assert.equal(getBaseRate('plan_written'), 50);
    assert.equal(getBaseRate('review_completed'), 30);
    assert.equal(getBaseRate('test_passed'), 40);
    assert.equal(getBaseRate('pr_merged'), 100);
  });

  it('returns 0 for unknown work type', () => {
    assert.equal(getBaseRate('unknown_work'), 0);
  });
});

describe('rollDrop', () => {
  it('returns null when rng beats drop chance', () => {
    // RNG returns 0.5 (>= 0.10 drop chance) → no drop
    const result = rollDrop(() => 0.5);
    assert.equal(result, null);
  });

  it('returns a coin drop when rng triggers drop', () => {
    let callCount = 0;
    const result = rollDrop(() => {
      callCount++;
      if (callCount === 1) return 0.05; // < 0.10 → drop triggered
      if (callCount === 2) return 0.01; // low roll → first entry (coins 10-50)
      return 0.5; // amount within range
    });
    assert.ok(result);
    assert.equal(result.type, 'coins');
    if (result.type === 'coins') {
      assert.ok(result.amount >= 10 && result.amount <= 50);
    }
  });

  it('returns an item drop with high enough weight roll', () => {
    let callCount = 0;
    const result = rollDrop(() => {
      callCount++;
      if (callCount === 1) return 0.05; // < 0.10 → drop triggered
      // Roll high enough to hit item entries (weight ~85-90 range out of 100)
      return 0.92;
    });
    assert.ok(result);
    assert.equal(result.type, 'item');
  });
});

// --- Multiplier ---

describe('calculateMultiplier', () => {
  it('returns 1.0 base with no bonuses', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    world.stats.streakDays = 0;
    const mult = calculateMultiplier(world, 'test/agent1', 1);
    assert.equal(mult, 1.0);
  });

  it('adds +10% per additional active agent', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    const mult = calculateMultiplier(world, 'test/agent1', 3);
    // 1.0 + 0.20 (2 extra agents)
    assert.ok(Math.abs(mult - 1.20) < 0.001);
  });

  it('adds +10% for desk bonus', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1', 'starter_desk_1');
    const mult = calculateMultiplier(world, 'test/agent1', 1);
    assert.ok(Math.abs(mult - 1.10) < 0.001);
  });

  it('adds +5% per streak day', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    world.stats.streakDays = 4;
    const mult = calculateMultiplier(world, 'test/agent1', 1);
    // 1.0 + 0.20 (4 * 0.05)
    assert.ok(Math.abs(mult - 1.20) < 0.001);
  });

  it('caps streak bonus at +50%', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    world.stats.streakDays = 20;
    const mult = calculateMultiplier(world, 'test/agent1', 1);
    // 1.0 + 0.50 (capped)
    assert.ok(Math.abs(mult - 1.50) < 0.001);
  });

  it('adds +10% per facility category', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    // Add placed facilities for 2 categories
    world.inventory.push(
      { id: 'fac1', catalogId: 'facility_water_cooler', type: 'facility', placed: true, placedAt: { roomId: 'room_0', x: 1, y: 1 } },
      { id: 'fac2', catalogId: 'facility_vending_machine', type: 'facility', placed: true, placedAt: { roomId: 'room_0', x: 2, y: 1 } },
    );
    const mult = calculateMultiplier(world, 'test/agent1', 1);
    // 1.0 + 0.20 (2 categories: hydration + food)
    assert.ok(Math.abs(mult - 1.20) < 0.001);
  });

  it('caps facility bonus at +50%', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    // Add all 5 categories
    world.inventory.push(
      { id: 'f1', catalogId: 'facility_water_cooler', type: 'facility', placed: true, placedAt: { roomId: 'room_0', x: 1, y: 1 } },
      { id: 'f2', catalogId: 'facility_vending_machine', type: 'facility', placed: true, placedAt: { roomId: 'room_0', x: 2, y: 1 } },
      { id: 'f3', catalogId: 'facility_couch', type: 'facility', placed: true, placedAt: { roomId: 'room_0', x: 3, y: 1 } },
      { id: 'f4', catalogId: 'facility_ergo_desk', type: 'facility', placed: true, placedAt: { roomId: 'room_0', x: 4, y: 1 } },
      { id: 'f5', catalogId: 'facility_ping_pong', type: 'facility', placed: true, placedAt: { roomId: 'room_0', x: 5, y: 1 } },
    );
    const mult = calculateMultiplier(world, 'test/agent1', 1);
    // 1.0 + 0.50 (5 categories)
    assert.ok(Math.abs(mult - 1.50) < 0.001);
  });

  it('does not count unplaced facilities', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    world.inventory.push(
      { id: 'fac1', catalogId: 'facility_water_cooler', type: 'facility', placed: false, placedAt: null },
    );
    const mult = calculateMultiplier(world, 'test/agent1', 1);
    assert.equal(mult, 1.0);
  });

  it('adds decoration bonuses by rarity', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    world.inventory.push(
      { id: 'd1', catalogId: 'deco_plant', type: 'decoration', placed: true, placedAt: { roomId: 'room_0', x: 1, y: 1 } },
      { id: 'd2', catalogId: 'deco_aquarium', type: 'decoration', placed: true, placedAt: { roomId: 'room_0', x: 2, y: 1 } },
    );
    const mult = calculateMultiplier(world, 'test/agent1', 1);
    // 1.0 + 0.01 (common) + 0.03 (rare) = 1.04
    assert.ok(Math.abs(mult - 1.04) < 0.001);
  });

  it('caps decoration bonus at +20%', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    // Add many legendaries (5% each) — 5 of them = 25%, capped at 20%
    for (let i = 0; i < 5; i++) {
      world.inventory.push(
        { id: `dl${i}`, catalogId: 'deco_rooftop_garden', type: 'decoration', placed: true, placedAt: { roomId: 'room_0', x: i, y: 5 } },
      );
    }
    const mult = calculateMultiplier(world, 'test/agent1', 1);
    // 1.0 + 0.20 (capped)
    assert.ok(Math.abs(mult - 1.20) < 0.001);
  });

  it('stacks all multiplier types', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1', 'starter_desk_1');
    world.stats.streakDays = 2;
    world.inventory.push(
      { id: 'fac1', catalogId: 'facility_water_cooler', type: 'facility', placed: true, placedAt: { roomId: 'room_0', x: 1, y: 1 } },
      { id: 'd1', catalogId: 'deco_plant', type: 'decoration', placed: true, placedAt: { roomId: 'room_0', x: 2, y: 2 } },
    );
    const mult = calculateMultiplier(world, 'test/agent1', 2);
    // 1.0 + 0.10 (1 extra agent) + 0.10 (desk) + 0.10 (streak 2*0.05) + 0.10 (1 facility) + 0.01 (1 common deco)
    assert.ok(Math.abs(mult - 1.41) < 0.001);
  });
});

// --- Coin awarding ---

describe('awardCoins', () => {
  it('awards base rate at 1.0 multiplier', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    // No-drop RNG (always > 0.10)
    const result = awardCoins(world, 'test/agent1', 'pr_merged', 1, () => 0.5);
    assert.equal(result.coinsAwarded, 100);
    assert.equal(result.multiplier, 1.0);
    assert.equal(world.coins, 100);
    assert.equal(world.stats.totalCoinsEarned, 100);
    assert.equal(world.stats.totalWorkCompleted, 1);
  });

  it('applies multiplier to base rate', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1', 'starter_desk_1');
    world.stats.streakDays = 4; // +20%
    // desk: +10%, streak: +20% → 1.30 total
    const result = awardCoins(world, 'test/agent1', 'pr_merged', 1, () => 0.5);
    assert.equal(result.coinsAwarded, 130); // 100 * 1.30
    assert.ok(Math.abs(result.multiplier - 1.30) < 0.001);
  });

  it('returns 0 for unknown work type', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    const result = awardCoins(world, 'test/agent1', 'unknown', 1, () => 0.5);
    assert.equal(result.coinsAwarded, 0);
    assert.equal(world.coins, 0);
  });

  it('adds drop coins to world total', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    let callCount = 0;
    const result = awardCoins(world, 'test/agent1', 'issue_triaged', 1, () => {
      callCount++;
      if (callCount === 1) return 0.05; // trigger drop
      if (callCount === 2) return 0.01; // first entry: coins 10-50
      return 0.0; // min amount → 10
    });
    assert.equal(result.coinsAwarded, 10); // base rate
    assert.ok(result.drop);
    if (result.drop?.type === 'coins') {
      assert.ok(world.coins >= 20); // 10 base + at least 10 drop
    }
  });

  it('updates stats correctly across multiple awards', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    awardCoins(world, 'test/agent1', 'test_passed', 1, () => 0.5);
    awardCoins(world, 'test/agent1', 'pr_merged', 1, () => 0.5);
    assert.equal(world.coins, 140); // 40 + 100
    assert.equal(world.stats.totalCoinsEarned, 140);
    assert.equal(world.stats.totalWorkCompleted, 2);
  });
});

// --- Desk assignment logic (unit test of the concept) ---

describe('desk assignment', () => {
  it('assigns first free desk to unassigned agent', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    // The starter desks are available
    const assignedDesks = new Set(
      Object.values(world.agents).map(a => a.desk).filter(Boolean),
    );
    const freeDesk = world.inventory.find(
      item => item.type === 'desk' && item.placed && !assignedDesks.has(item.id),
    );
    assert.ok(freeDesk);
    world.agents['test/agent1'].desk = freeDesk.id;
    assert.equal(world.agents['test/agent1'].desk, 'starter_desk_1');
  });

  it('assigns different desks to different agents', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1', 'starter_desk_1');
    addAgent(world, 'test/agent2');
    const assignedDesks = new Set(
      Object.values(world.agents).map(a => a.desk).filter(Boolean),
    );
    const freeDesk = world.inventory.find(
      item => item.type === 'desk' && item.placed && !assignedDesks.has(item.id),
    );
    assert.ok(freeDesk);
    assert.equal(freeDesk.id, 'starter_desk_2');
  });

  it('no-op when all desks are taken', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1', 'starter_desk_1');
    addAgent(world, 'test/agent2', 'starter_desk_2');
    addAgent(world, 'test/agent3');
    const assignedDesks = new Set(
      Object.values(world.agents).map(a => a.desk).filter(Boolean),
    );
    const freeDesk = world.inventory.find(
      item => item.type === 'desk' && item.placed && !assignedDesks.has(item.id),
    );
    assert.equal(freeDesk, undefined);
  });
});
