import { readFileSync, writeFileSync, copyFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateWorldState } from './schema.js';
import type { AgentvilleWorld } from './schema.js';

export function loadWorld(dir: string): AgentvilleWorld | null {
  const primary = join(dir, 'world.json');
  const backup = join(dir, 'world.json.bak');

  const fromPrimary = tryLoad(primary);
  if (fromPrimary) return fromPrimary;

  const fromBackup = tryLoad(backup);
  return fromBackup;
}

function tryLoad(path: string): AgentvilleWorld | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const data = JSON.parse(raw);
    return validateWorldState(data);
  } catch {
    return null;
  }
}

export function saveWorld(dir: string, state: AgentvilleWorld): void {
  const primary = join(dir, 'world.json');
  const backup = join(dir, 'world.json.bak');
  const tmp = join(dir, 'world.json.tmp');

  // Write to temp file first
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');

  // Copy existing to backup (if it exists)
  if (existsSync(primary)) {
    copyFileSync(primary, backup);
  }

  // Atomic rename
  renameSync(tmp, primary);
}

export function bootstrapWorld(timezone: string): AgentvilleWorld {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone });

  return {
    schemaVersion: 1,
    coins: 0,
    inventory: [
      {
        id: 'starter_desk_1',
        catalogId: 'desk_basic',
        type: 'desk',
        placed: true,
        placedAt: { roomId: 'room_0', x: 7, y: 4 },
      },
      {
        id: 'starter_desk_2',
        catalogId: 'desk_basic',
        type: 'desk',
        placed: true,
        placedAt: { roomId: 'room_0', x: 13, y: 4 },
      },
      {
        id: 'starter_clock_1',
        catalogId: 'wall_clock_basic',
        type: 'decoration',
        placed: true,
        placedAt: { roomId: 'room_0', x: 10, y: 1 },
      },
    ],
    world: {
      floors: [
        {
          id: 'floor_0',
          name: 'Ground Floor',
          rooms: [
            {
              id: 'room_0',
              name: 'Main Office',
              width: 20,
              height: 11,
              style: 'basic',
            },
          ],
        },
      ],
    },
    agents: {},
    stats: {
      totalCoinsEarned: 0,
      totalCoinsSpent: 0,
      totalWorkCompleted: 0,
      streakDays: 0,
      lastActiveDate: today,
      timezone,
    },
    cloudSync: {
      lastSyncedAt: null,
      syncSequence: 0,
    },
  };
}
