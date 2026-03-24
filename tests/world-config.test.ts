import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeWorldConfig, generateWorldConfig } from '../lib/world-config.js';
import type { AgentEntry } from '../lib/types.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'nightshift-merge-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeAgents(): AgentEntry[] {
  return [
    { role: 'producer', agent: 'ns-dev-producer', cwd: '/repo' },
    { role: 'coder-1', agent: 'ns-dev-coder-1', cwd: '/wt/coder-1' },
  ];
}

describe('mergeWorldConfig', () => {
  it('merged output contains base world and dynamic config properties', () => {
    const baseWorld = {
      gridCols: 16,
      gridRows: 12,
      floor: [['tile_a']],
      tiles: { tile_a: 'path/to/tile.png' },
      propImages: { chair: 'path/to/chair.png' },
      props: [{ id: 'chair', x: 1, y: 1 }],
      wanderPoints: [{ x: 5, y: 5 }],
    };
    const basePath = join(tmp, 'base-world.json');
    writeFileSync(basePath, JSON.stringify(baseWorld));

    const dynamicConfig = generateWorldConfig(makeAgents(), 'dev');
    const merged = mergeWorldConfig(basePath, dynamicConfig);

    // Base world properties preserved
    assert.equal(merged.gridCols, 16);
    assert.equal(merged.gridRows, 12);
    assert.deepEqual(merged.floor, [['tile_a']]);
    assert.deepEqual(merged.tiles, { tile_a: 'path/to/tile.png' });
    assert.deepEqual(merged.propImages, { chair: 'path/to/chair.png' });
    assert.ok(Array.isArray(merged.props));
    assert.ok(Array.isArray(merged.wanderPoints));

    // Dynamic config properties present
    assert.ok(merged.canvas);
    assert.equal(merged.tileSize, 32);
    assert.equal(merged.scale, 2);
    assert.equal(merged.theme, 'gear-supply');
    assert.ok(Array.isArray(merged.workstations));
    assert.ok(Array.isArray(merged.citizens));
    assert.equal((merged.citizens as any[]).length, 2);
  });

  it('filters work-type base props and keeps decorative + dynamic props', () => {
    const baseWorld = {
      props: [
        { id: 'rug', x: 1, y: 1, w: 2, h: 2, layer: 'below' },
        { id: 'desk', x: 5, y: 5, w: 3, h: 3, layer: 'below', anchors: [{ name: 'ws', ox: 1, oy: 2, type: 'work' }] },
      ],
    };
    const basePath = join(tmp, 'base-world.json');
    writeFileSync(basePath, JSON.stringify(baseWorld));

    const dynamicConfig = generateWorldConfig(makeAgents(), 'dev');
    const merged = mergeWorldConfig(basePath, dynamicConfig);

    const props = merged.props as any[];
    // Base rug kept, base desk removed, dynamic desk+chair props added
    assert.ok(props.some((p: any) => p.id === 'rug'), 'decorative rug should be kept');
    assert.ok(!props.some((p: any) => p.id === 'desk' && p.x === 5), 'base work desk should be removed');
    // 2 agents × 2 props + 1 decorative = 5
    assert.equal(props.length, 1 + dynamicConfig.props.length);
  });

  it('returns dynamic config when base world file does not exist', () => {
    const dynamicConfig = generateWorldConfig(makeAgents(), 'dev');
    const merged = mergeWorldConfig(join(tmp, 'nonexistent.json'), dynamicConfig);

    assert.equal(merged.theme, 'gear-supply');
    assert.ok(Array.isArray(merged.citizens));
  });

  it('returns dynamic config when base world file is invalid JSON', () => {
    const basePath = join(tmp, 'bad.json');
    writeFileSync(basePath, '{invalid!!!');

    const dynamicConfig = generateWorldConfig(makeAgents(), 'dev');
    const merged = mergeWorldConfig(basePath, dynamicConfig);

    assert.equal(merged.theme, 'gear-supply');
    assert.ok(Array.isArray(merged.citizens));
  });

  it('dynamic config overrides base world on key collision', () => {
    const baseWorld = { theme: 'old-theme', gridCols: 16 };
    const basePath = join(tmp, 'base-world.json');
    writeFileSync(basePath, JSON.stringify(baseWorld));

    const dynamicConfig = generateWorldConfig(makeAgents(), 'dev');
    const merged = mergeWorldConfig(basePath, dynamicConfig);

    // Dynamic config's theme wins
    assert.equal(merged.theme, 'gear-supply');
    // Base world's gridCols preserved (no collision)
    assert.equal(merged.gridCols, 16);
  });
});
