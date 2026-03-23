import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentEntry, CitizenOverrides, WorldConfig, WorkstationAnchor, CitizenConfig } from './types.js';
import { resolveCitizenProps } from './citizen-config.js';

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 384;
const TILE_SIZE = 32;
const SCALE = 2;

/**
 * Generate a miniverse world configuration from a list of agents.
 * Workstations are placed in a grid layout that adapts to agent count.
 */
export function generateWorldConfig(agents: AgentEntry[], team: string, overrides?: CitizenOverrides): WorldConfig {
  const cols = Math.min(agents.length, 4);
  const rows = Math.ceil(agents.length / cols);

  const xSpacing = Math.floor(CANVAS_WIDTH / (cols + 1));
  const ySpacing = Math.floor(CANVAS_HEIGHT / (rows + 1));

  const workstations: WorkstationAnchor[] = [];
  const citizens: CitizenConfig[] = [];

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = xSpacing * (col + 1);
    const y = ySpacing * (row + 1);

    const stationId = `ws-${team}-${agent.role}`;

    workstations.push({ id: stationId, x, y });

    const resolved = resolveCitizenProps(agent.role, overrides ?? {});

    citizens.push({
      id: `ns-${team}-${agent.role}`,
      displayName: resolved.displayName,
      role: agent.role,
      workstationId: stationId,
      color: resolved.color,
    });
  }

  return {
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    tileSize: TILE_SIZE,
    scale: SCALE,
    theme: 'gear-supply',
    workstations,
    citizens,
  };
}

/**
 * Write the world configuration files to a directory.
 * @deprecated Replaced by `mergeWorldConfig` + direct `writeFileSync` in `start.ts`.
 */
export function writeWorldConfig(config: WorldConfig, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'world.json'), JSON.stringify(config, null, 2) + '\n');
}

/**
 * Merge base world data (floor, props, tiles) with dynamic config (citizens, workstations).
 * Key sets are disjoint — base provides gridCols/gridRows/floor/tiles/propImages/props/wanderPoints,
 * dynamic provides canvas/tileSize/scale/theme/workstations/citizens.
 */
export function mergeWorldConfig(baseWorldPath: string, dynamicConfig: WorldConfig): Record<string, unknown> {
  if (!existsSync(baseWorldPath)) {
    return dynamicConfig as unknown as Record<string, unknown>;
  }
  try {
    const baseWorld = JSON.parse(readFileSync(baseWorldPath, 'utf-8'));
    return { ...baseWorld, ...dynamicConfig };
  } catch {
    return dynamicConfig as unknown as Record<string, unknown>;
  }
}
