import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapWorld } from './persistence.js';
import type { AgentvilleWorld } from './schema.js';

interface OldWorldFormat {
  gridCols?: number;
  gridRows?: number;
  floor?: string[][];
  tiles?: Record<string, string>;
  props?: unknown[];
  propImages?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Migrate from the old miniverse multi-world directory layout to the new
 * AgentvilleWorld schema. The miniverse directory is structured as:
 *   {miniverseDir}/{repo}/{team}/world.json
 *
 * We pick the most recently modified world.json and convert it.
 */
export function migrateFromMiniverse(miniverseDir: string): AgentvilleWorld | null {
  if (!existsSync(miniverseDir)) return null;

  const worldFiles = findWorldFiles(miniverseDir);
  if (worldFiles.length === 0) return null;

  // Pick most recently modified
  worldFiles.sort((a, b) => b.mtime - a.mtime);
  const chosen = worldFiles[0];

  const oldWorld = parseOldWorld(chosen.path);
  if (!oldWorld) return null;

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const world = bootstrapWorld(timezone);

  // Override room dimensions from old format
  if (typeof oldWorld.gridCols === 'number' && typeof oldWorld.gridRows === 'number') {
    world.world.floors[0].rooms[0].width = oldWorld.gridCols;
    world.world.floors[0].rooms[0].height = oldWorld.gridRows;
  }

  console.log(`Migrated world from ${chosen.path}`);
  return world;
}

interface WorldFileEntry {
  path: string;
  mtime: number;
}

function findWorldFiles(dir: string): WorldFileEntry[] {
  const results: WorldFileEntry[] = [];

  let repos: string[];
  try {
    repos = readdirSync(dir);
  } catch {
    return results;
  }

  for (const repo of repos) {
    const repoPath = join(dir, repo);
    let stat;
    try {
      stat = statSync(repoPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    let teams: string[];
    try {
      teams = readdirSync(repoPath);
    } catch {
      continue;
    }

    for (const team of teams) {
      const worldPath = join(repoPath, team, 'world.json');
      try {
        const worldStat = statSync(worldPath);
        if (worldStat.isFile()) {
          results.push({ path: worldPath, mtime: worldStat.mtimeMs });
        }
      } catch {
        // world.json doesn't exist in this team dir, skip
      }
    }
  }

  return results;
}

function parseOldWorld(path: string): OldWorldFormat | null {
  try {
    const raw = readFileSync(path, 'utf-8');
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    // Check for at least one old-format marker
    if (!('gridCols' in data) && !('gridRows' in data) && !('floor' in data) && !('tiles' in data) && !('props' in data) && !('propImages' in data)) {
      return null;
    }
    return data as OldWorldFormat;
  } catch {
    return null;
  }
}
