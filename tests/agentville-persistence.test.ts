import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorld, saveWorld, bootstrapWorld } from '../lib/agentville/persistence.js';
import type { AgentvilleWorld } from '../lib/agentville/schema.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'nightshift-persist-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeWorld(overrides?: Partial<AgentvilleWorld>): AgentvilleWorld {
  return {
    schemaVersion: 1,
    coins: 50,
    inventory: [],
    world: {
      floors: [
        {
          id: 'floor_0',
          name: 'Ground Floor',
          rooms: [{ id: 'room_0', name: 'Main Office', width: 12, height: 8, style: 'basic' }],
        },
      ],
    },
    agents: {},
    stats: {
      totalCoinsEarned: 50,
      totalCoinsSpent: 0,
      totalWorkCompleted: 3,
      streakDays: 1,
      lastActiveDate: '2026-04-14',
      timezone: 'America/New_York',
    },
    cloudSync: { lastSyncedAt: null, syncSequence: 0 },
    ...overrides,
  };
}

describe('persistence', () => {
  describe('save and load round-trip', () => {
    it('saves and loads a world state correctly', () => {
      const world = makeWorld({ coins: 999 });
      saveWorld(tmp, world);
      const loaded = loadWorld(tmp);
      assert.deepEqual(loaded, world);
    });
  });

  describe('backup file', () => {
    it('creates .bak on save', () => {
      const world = makeWorld();
      saveWorld(tmp, world);
      // First save — no .bak yet (no pre-existing primary)
      assert.equal(existsSync(join(tmp, 'world.json.bak')), false);

      // Second save — .bak should exist
      const world2 = makeWorld({ coins: 200 });
      saveWorld(tmp, world2);
      assert.equal(existsSync(join(tmp, 'world.json.bak')), true);

      // .bak should contain the first world's data
      const bakData = JSON.parse(readFileSync(join(tmp, 'world.json.bak'), 'utf-8'));
      assert.equal(bakData.coins, 50);
    });
  });

  describe('fallback to .bak', () => {
    it('falls back to .bak when primary is corrupt', () => {
      const world = makeWorld({ coins: 777 });
      saveWorld(tmp, world);

      // Corrupt the primary file
      writeFileSync(join(tmp, 'world.json'), '{corrupt!!!');

      // Write a valid backup
      writeFileSync(join(tmp, 'world.json.bak'), JSON.stringify(world));

      const loaded = loadWorld(tmp);
      assert.ok(loaded);
      assert.equal(loaded!.coins, 777);
    });
  });

  describe('missing files', () => {
    it('returns null when both files are missing', () => {
      const loaded = loadWorld(tmp);
      assert.equal(loaded, null);
    });
  });

  describe('both corrupt', () => {
    it('returns null when both files are corrupt', () => {
      writeFileSync(join(tmp, 'world.json'), '{bad');
      writeFileSync(join(tmp, 'world.json.bak'), '{also bad');
      const loaded = loadWorld(tmp);
      assert.equal(loaded, null);
    });
  });

  describe('bootstrapWorld', () => {
    it('creates correct structure with 2 desks', () => {
      const world = bootstrapWorld('America/Chicago');
      assert.equal(world.schemaVersion, 1);
      assert.equal(world.coins, 0);
      assert.equal(world.inventory.length, 2);
      assert.equal(world.inventory[0].catalogId, 'desk_basic');
      assert.equal(world.inventory[1].catalogId, 'desk_basic');
      assert.equal(world.inventory[0].placed, true);
      assert.equal(world.inventory[1].placed, true);
      assert.deepEqual(world.inventory[0].placedAt, { roomId: 'room_0', x: 7, y: 4 });
      assert.deepEqual(world.inventory[1].placedAt, { roomId: 'room_0', x: 13, y: 4 });
    });

    it('creates 1 floor and 1 room (20x11)', () => {
      const world = bootstrapWorld('America/Chicago');
      assert.equal(world.world.floors.length, 1);
      assert.equal(world.world.floors[0].name, 'Ground Floor');
      assert.equal(world.world.floors[0].rooms.length, 1);
      const room = world.world.floors[0].rooms[0];
      assert.equal(room.width, 20);
      assert.equal(room.height, 11);
      assert.equal(room.style, 'basic');
    });

    it("sets today's date and correct timezone", () => {
      const tz = 'Asia/Tokyo';
      const world = bootstrapWorld(tz);
      const expectedDate = new Date().toLocaleDateString('en-CA', { timeZone: tz });
      assert.equal(world.stats.lastActiveDate, expectedDate);
      assert.equal(world.stats.timezone, tz);
    });

    it('starts with zeroed stats', () => {
      const world = bootstrapWorld('UTC');
      assert.equal(world.stats.totalCoinsEarned, 0);
      assert.equal(world.stats.totalCoinsSpent, 0);
      assert.equal(world.stats.totalWorkCompleted, 0);
      assert.equal(world.stats.streakDays, 0);
    });
  });
});
