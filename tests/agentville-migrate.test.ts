import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateFromMiniverse } from '../lib/agentville/migrate.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'nightshift-migrate-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeOldWorld(dir: string, repo: string, team: string, overrides?: Record<string, unknown>): string {
  const teamDir = join(dir, repo, team);
  mkdirSync(teamDir, { recursive: true });
  const worldPath = join(teamDir, 'world.json');
  const oldWorld = {
    gridCols: 20,
    gridRows: 11,
    floor: [['main_wall'], ['main_floor']],
    tiles: { main_floor: 'tiles/floor.png', main_wall: 'tiles/wall.png' },
    props: [{ id: 'desk_corner_right', x: 5, y: 3, w: 3, h: 3 }],
    propImages: { desk_corner_right: 'props/desk.png' },
    ...overrides,
  };
  writeFileSync(worldPath, JSON.stringify(oldWorld));
  return worldPath;
}

describe('migrateFromMiniverse', () => {
  it('returns null when directory does not exist', () => {
    const result = migrateFromMiniverse(join(tmp, 'nonexistent'));
    assert.equal(result, null);
  });

  it('returns null when no old worlds exist', () => {
    // Empty directory — no repo/team/world.json
    const result = migrateFromMiniverse(tmp);
    assert.equal(result, null);
  });

  it('converts old world format preserving dimensions', () => {
    writeOldWorld(tmp, 'my-repo', 'dev', { gridCols: 24, gridRows: 14 });
    const result = migrateFromMiniverse(tmp);
    assert.ok(result);
    assert.equal(result!.schemaVersion, 1);
    const room = result!.world.floors[0].rooms[0];
    assert.equal(room.width, 24);
    assert.equal(room.height, 14);
  });

  it('picks most recently modified world', () => {
    // Write two worlds, give them different timestamps
    const path1 = writeOldWorld(tmp, 'repo-a', 'dev', { gridCols: 10, gridRows: 10 });
    const path2 = writeOldWorld(tmp, 'repo-b', 'dev', { gridCols: 30, gridRows: 20 });

    // Make path2 newer
    const past = new Date(Date.now() - 60000);
    const now = new Date();
    utimesSync(path1, past, past);
    utimesSync(path2, now, now);

    const result = migrateFromMiniverse(tmp);
    assert.ok(result);
    const room = result!.world.floors[0].rooms[0];
    assert.equal(room.width, 30);
    assert.equal(room.height, 20);
  });

  it('has starter desks in inventory', () => {
    writeOldWorld(tmp, 'my-repo', 'dev');
    const result = migrateFromMiniverse(tmp);
    assert.ok(result);
    assert.equal(result!.inventory.length, 2);
    assert.equal(result!.inventory[0].catalogId, 'desk_basic');
    assert.equal(result!.inventory[1].catalogId, 'desk_basic');
    assert.equal(result!.inventory[0].placed, true);
    assert.equal(result!.inventory[1].placed, true);
  });
});
