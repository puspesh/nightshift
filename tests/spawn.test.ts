import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWalkableSet, assignSpawnPositions } from '../lib/spawn.js';

// Helper: create a floor grid with given dimensions, all tiles filled
function makeFloor(rows: number, cols: number, fill = 'tile'): string[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}

describe('buildWalkableSet', () => {
  it('excludes empty floor tiles', () => {
    const floor = [
      ['tile', 'tile', 'tile'],
      ['tile', '',     'tile'],
      ['tile', 'tile', 'tile'],
    ];
    const walkable = buildWalkableSet(floor, []);
    assert.ok(!walkable.has('1,1'), 'empty tile should be excluded');
  });

  it('excludes edge tiles', () => {
    const floor = makeFloor(4, 4);
    const walkable = buildWalkableSet(floor, []);
    // Only interior tiles (1,1), (2,1), (1,2), (2,2) should remain
    assert.ok(!walkable.has('0,0'), 'top-left edge excluded');
    assert.ok(!walkable.has('3,0'), 'top-right edge excluded');
    assert.ok(!walkable.has('0,3'), 'bottom-left edge excluded');
    assert.ok(walkable.has('1,1'), 'interior tile included');
    assert.ok(walkable.has('2,2'), 'interior tile included');
  });

  it('excludes prop-covered tiles', () => {
    const floor = makeFloor(6, 6);
    const props = [{ x: 2, y: 2, w: 2, h: 2 }];
    const walkable = buildWalkableSet(floor, props);
    assert.ok(!walkable.has('2,2'), 'prop tile excluded');
    assert.ok(!walkable.has('3,2'), 'prop tile excluded');
    assert.ok(!walkable.has('2,3'), 'prop tile excluded');
    assert.ok(!walkable.has('3,3'), 'prop tile excluded');
    assert.ok(walkable.has('1,1'), 'non-prop interior tile included');
  });

  it('handles fractional prop positions', () => {
    const floor = makeFloor(6, 6);
    const props = [{ x: 1.5, y: 1.5, w: 1, h: 1 }];
    const walkable = buildWalkableSet(floor, props);
    // floor(1.5)=1, ceil(1.5+1)=3 → blocks cols 1,2 rows 1,2
    assert.ok(!walkable.has('1,1'), 'fractional prop tile excluded');
    assert.ok(!walkable.has('2,2'), 'fractional prop tile excluded');
  });

  it('returns empty set for empty floor', () => {
    const walkable = buildWalkableSet([], []);
    assert.equal(walkable.size, 0);
  });
});

describe('assignSpawnPositions', () => {
  it('returns positions within the walkable set', () => {
    const walkable = new Set(['2,2', '3,3', '4,4', '5,5']);
    const positions = assignSpawnPositions(3, walkable, 8, 8);
    assert.equal(positions.length, 3);
    for (const [x, y] of positions) {
      assert.ok(walkable.has(`${x},${y}`), `position ${x},${y} should be in walkable set`);
    }
  });

  it('never returns duplicate positions', () => {
    const walkable = new Set(['1,1', '2,2', '3,3', '4,4', '5,5']);
    const positions = assignSpawnPositions(5, walkable, 8, 8);
    const unique = new Set(positions.map(([x, y]) => `${x},${y}`));
    assert.equal(unique.size, 5, 'all positions must be unique');
  });

  it('returns edge positions when more citizens than walkable tiles', () => {
    const walkable = new Set(['2,2']);
    const positions = assignSpawnPositions(3, walkable, 8, 8);
    assert.equal(positions.length, 3);
    // First position from walkable, next two from edge (row 0)
    const edgePositions = positions.filter(([_, y]) => y === 0);
    assert.equal(edgePositions.length, 2, 'overflow citizens should get edge positions');
  });

  it('returns all edge positions when walkable set is empty', () => {
    const positions = assignSpawnPositions(3, new Set(), 8, 8);
    assert.equal(positions.length, 3);
    for (const [_, y] of positions) {
      assert.equal(y, 0, 'all positions should be on row 0 (edge)');
    }
    // Verify spread across columns
    const cols = positions.map(([x]) => x);
    assert.deepEqual(cols, [0, 1, 2]);
  });

  it('returns empty array for zero citizens', () => {
    const positions = assignSpawnPositions(0, new Set(['1,1']), 8, 8);
    assert.equal(positions.length, 0);
  });
});
