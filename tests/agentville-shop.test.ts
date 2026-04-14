import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  purchaseItem,
  placeItem,
  unplaceItem,
  setAgentCosmetic,
} from '../lib/agentville/shop.js';
import { bootstrapWorld } from '../lib/agentville/persistence.js';
import type { AgentvilleWorld } from '../lib/agentville/schema.js';

function freshWorld(coins = 0): AgentvilleWorld {
  const world = bootstrapWorld('UTC');
  world.coins = coins;
  return world;
}

function addAgent(world: AgentvilleWorld, key: string, desk: string | null = null): void {
  world.agents[key] = {
    source: 'test',
    name: key,
    cosmetic: 'cosmetic_cat',
    accessories: [],
    desk,
  };
}

// --- purchaseItem ---

describe('purchaseItem', () => {
  it('succeeds with enough coins', () => {
    const world = freshWorld(500);
    const result = purchaseItem(world, 'desk_basic');
    assert.equal(result.success, true);
    assert.ok(result.item);
    assert.equal(result.item!.catalogId, 'desk_basic');
    assert.equal(result.item!.type, 'desk');
    assert.equal(result.item!.placed, false);
    assert.equal(world.coins, 300); // 500 - 200
    assert.equal(world.stats.totalCoinsSpent, 200);
  });

  it('fails with insufficient coins', () => {
    const world = freshWorld(100);
    const result = purchaseItem(world, 'desk_basic'); // costs 200
    assert.equal(result.success, false);
    assert.equal(result.error, 'Insufficient coins');
    assert.equal(world.coins, 100); // unchanged
  });

  it('fails for unknown catalog item', () => {
    const world = freshWorld(10000);
    const result = purchaseItem(world, 'nonexistent_item');
    assert.equal(result.success, false);
    assert.equal(result.error, 'Item not found in catalog');
  });

  it('generates unique inventory IDs', () => {
    const world = freshWorld(1000);
    const r1 = purchaseItem(world, 'deco_plant');
    const r2 = purchaseItem(world, 'deco_plant');
    assert.ok(r1.item);
    assert.ok(r2.item);
    assert.notEqual(r1.item!.id, r2.item!.id);
  });

  it('adds item to world.inventory', () => {
    const world = freshWorld(500);
    const initialLen = world.inventory.length;
    purchaseItem(world, 'desk_basic');
    assert.equal(world.inventory.length, initialLen + 1);
  });

  it('handles expansion: new room', () => {
    const world = freshWorld(10000);
    const initialRooms = world.world.floors[0].rooms.length;
    purchaseItem(world, 'expand_room');
    assert.equal(world.world.floors[0].rooms.length, initialRooms + 1);
  });

  it('handles expansion: new floor', () => {
    const world = freshWorld(15000);
    const initialFloors = world.world.floors.length;
    purchaseItem(world, 'expand_floor');
    assert.equal(world.world.floors.length, initialFloors + 1);
    const newFloor = world.world.floors[world.world.floors.length - 1];
    assert.equal(newFloor.rooms.length, 1);
  });
});

// --- placeItem ---

describe('placeItem', () => {
  it('places item at valid position', () => {
    const world = freshWorld(500);
    const { item } = purchaseItem(world, 'deco_plant');
    assert.ok(item);
    const result = placeItem(world, item!.id, 'room_0', 5, 5);
    assert.equal(result.success, true);
    assert.equal(result.item!.placed, true);
    assert.deepEqual(result.item!.placedAt, { roomId: 'room_0', x: 5, y: 5 });
  });

  it('fails for item not in inventory', () => {
    const world = freshWorld();
    const result = placeItem(world, 'fake_id', 'room_0', 0, 0);
    assert.equal(result.success, false);
    assert.equal(result.error, 'Item not in inventory');
  });

  it('fails for nonexistent room', () => {
    const world = freshWorld(500);
    const { item } = purchaseItem(world, 'deco_plant');
    const result = placeItem(world, item!.id, 'nonexistent_room', 0, 0);
    assert.equal(result.success, false);
    assert.equal(result.error, 'Room not found');
  });

  it('fails for out-of-bounds position', () => {
    const world = freshWorld(500);
    const { item } = purchaseItem(world, 'deco_plant');
    // room_0 is 12x8
    const result = placeItem(world, item!.id, 'room_0', 15, 3);
    assert.equal(result.success, false);
    assert.equal(result.error, 'Position out of bounds');
  });

  it('fails for negative coordinates', () => {
    const world = freshWorld(500);
    const { item } = purchaseItem(world, 'deco_plant');
    const result = placeItem(world, item!.id, 'room_0', -1, 3);
    assert.equal(result.success, false);
    assert.equal(result.error, 'Position out of bounds');
  });

  it('fails when position is occupied', () => {
    const world = freshWorld(1000);
    const r1 = purchaseItem(world, 'deco_plant');
    const r2 = purchaseItem(world, 'deco_poster');
    placeItem(world, r1.item!.id, 'room_0', 5, 5);
    const result = placeItem(world, r2.item!.id, 'room_0', 5, 5);
    assert.equal(result.success, false);
    assert.equal(result.error, 'Position already occupied');
  });

  it('allows re-placing an already placed item', () => {
    const world = freshWorld(500);
    const { item } = purchaseItem(world, 'deco_plant');
    placeItem(world, item!.id, 'room_0', 1, 1);
    const result = placeItem(world, item!.id, 'room_0', 3, 3);
    assert.equal(result.success, true);
    assert.deepEqual(result.item!.placedAt, { roomId: 'room_0', x: 3, y: 3 });
  });
});

// --- unplaceItem ---

describe('unplaceItem', () => {
  it('unplaces a placed item', () => {
    const world = freshWorld(500);
    const { item } = purchaseItem(world, 'deco_plant');
    placeItem(world, item!.id, 'room_0', 1, 1);
    const result = unplaceItem(world, item!.id);
    assert.equal(result.success, true);
    assert.equal(result.item!.placed, false);
    assert.equal(result.item!.placedAt, null);
  });

  it('fails for item not in inventory', () => {
    const world = freshWorld();
    const result = unplaceItem(world, 'fake_id');
    assert.equal(result.success, false);
    assert.equal(result.error, 'Item not in inventory');
  });

  it('fails for item that is not placed', () => {
    const world = freshWorld(500);
    const { item } = purchaseItem(world, 'deco_plant');
    const result = unplaceItem(world, item!.id);
    assert.equal(result.success, false);
    assert.equal(result.error, 'Item is not placed');
  });

  it('unassigns agent desk when desk is unplaced', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1', 'starter_desk_1');
    const result = unplaceItem(world, 'starter_desk_1');
    assert.equal(result.success, true);
    assert.equal(world.agents['test/agent1'].desk, null);
  });
});

// --- setAgentCosmetic ---

describe('setAgentCosmetic', () => {
  it('sets cosmetic when owned', () => {
    const world = freshWorld(500);
    addAgent(world, 'test/agent1');
    purchaseItem(world, 'cosmetic_robot');
    const result = setAgentCosmetic(world, 'test/agent1', 'cosmetic_robot');
    assert.equal(result.success, true);
    assert.equal(world.agents['test/agent1'].cosmetic, 'cosmetic_robot');
  });

  it('fails for unknown agent', () => {
    const world = freshWorld(500);
    purchaseItem(world, 'cosmetic_robot');
    const result = setAgentCosmetic(world, 'nonexistent', 'cosmetic_robot');
    assert.equal(result.success, false);
    assert.equal(result.error, 'Agent not found');
  });

  it('fails when cosmetic is not owned', () => {
    const world = freshWorld();
    addAgent(world, 'test/agent1');
    const result = setAgentCosmetic(world, 'test/agent1', 'cosmetic_dragon');
    assert.equal(result.success, false);
    assert.equal(result.error, 'Cosmetic not owned');
  });
});
