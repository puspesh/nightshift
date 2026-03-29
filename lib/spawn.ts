/**
 * Spawn position computation for miniverse citizens.
 * Analyzes floor grid and prop layout to find valid walkable tiles.
 */

export interface PropBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Build a set of valid walkable tile coordinates from a floor grid and prop layout.
 * Excludes: empty floor tiles, edge tiles, and prop-covered tiles.
 */
export function buildWalkableSet(
  floor: string[][],
  props: PropBounds[],
): Set<string> {
  const rows = floor.length;
  if (rows === 0) return new Set();
  const cols = floor[0].length;

  const walkable = new Set<string>();

  // Start with all non-empty floor tiles, excluding edges
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if ((floor[r]?.[c] ?? '') !== '') {
        walkable.add(`${c},${r}`);
      }
    }
  }

  // Subtract tiles covered by props
  for (const prop of props) {
    const startCol = Math.floor(prop.x);
    const endCol = Math.ceil(prop.x + prop.w);
    const startRow = Math.floor(prop.y);
    const endRow = Math.ceil(prop.y + prop.h);
    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        walkable.delete(`${c},${r}`);
      }
    }
  }

  return walkable;
}

/**
 * Assign spawn positions to citizens from the walkable set.
 * Uses Fisher-Yates shuffle for randomization.
 * Falls back to edge positions when walkable tiles are exhausted.
 */
export function assignSpawnPositions(
  citizenCount: number,
  walkableSet: Set<string>,
  gridCols: number,
  gridRows: number,
): [number, number][] {
  // Convert to array and shuffle (Fisher-Yates)
  const tiles = Array.from(walkableSet);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  const positions: [number, number][] = [];
  let edgeCol = 0;

  for (let i = 0; i < citizenCount; i++) {
    if (tiles.length > 0) {
      const tile = tiles.pop()!;
      const [x, y] = tile.split(',').map(Number);
      positions.push([x, y]);
    } else {
      // Edge spawn: spread along row 0
      positions.push([edgeCol % gridCols, 0]);
      edgeCol++;
    }
  }

  return positions;
}
