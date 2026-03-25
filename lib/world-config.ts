import { existsSync, readFileSync } from 'node:fs';
import type { AgentEntry, CitizenOverrides, WorldConfig, WorkstationAnchor, CitizenConfig, WorldProp } from './types.js';
import { resolveCitizenProps } from './citizen-config.js';

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 384;
const TILE_SIZE = 32;
const SCALE = 2;
const GRID_COLS = 20;
const GRID_ROWS = 11;

/** Available citizen sprite characters — assigned round-robin to agents */
const CITIZEN_SPRITES = ['dexter', 'morty', 'nova', 'rio'];

/** Desk+chair layout: desk is 3x3 tiles, chair is 1.1x1.9 tiles placed at desk+1,+1 */
const DESK_W = 3;
const DESK_H = 3;
const CHAIR_W = 1.1;
const CHAIR_H = 1.9;

/**
 * Generate a miniverse world configuration from a list of agents.
 * Workstations are placed in a grid layout that adapts to agent count.
 * Each agent gets a desk + chair prop pair.
 */
export function generateWorldConfig(agents: AgentEntry[], team: string, overrides?: CitizenOverrides): WorldConfig {
  // Layout desks in the office zone (after kitchen area)
  // Kitchen occupies cols 0-4, so desks start at col 5
  const deskXStart = 5;
  const deskAvailWidth = GRID_COLS - deskXStart;
  const deskSlot = DESK_W + 1;
  const maxCols = Math.floor(deskAvailWidth / deskSlot);
  const cols = Math.min(agents.length, maxCols);
  const rows = Math.ceil(agents.length / cols);

  const xSpacing = deskAvailWidth / cols;
  const yStart = 3;
  const ySpacing = Math.max(DESK_H + 1, (GRID_ROWS - yStart - DESK_H) / Math.max(rows - 1, 1));

  const workstations: WorkstationAnchor[] = [];
  const citizens: CitizenConfig[] = [];
  const props: WorldProp[] = [];

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const col = i % cols;
    const row = Math.floor(i / cols);

    // Tile position for this desk (centered within each column slot, offset past kitchen)
    const deskX = deskXStart + col * xSpacing + (xSpacing - DESK_W) / 2;
    const deskY = yStart + row * ySpacing;

    // Pixel position for workstation anchor (center of desk area)
    const pixelX = (deskX + DESK_W / 2) * TILE_SIZE;
    const pixelY = (deskY + DESK_H / 2) * TILE_SIZE;

    const stationId = `ws-${team}-${agent.role}`;
    const deskId = `desk-${team}-${agent.role}`;
    const chairId = `chair-${team}-${agent.role}`;

    workstations.push({ id: stationId, x: pixelX, y: pixelY });

    // Desk prop (alternate between left and right corner desks)
    const deskSprite = col % 2 === 0 ? 'desk_corner_right' : 'desk_corner_left';
    props.push({
      id: deskSprite,
      x: deskX,
      y: deskY,
      w: DESK_W,
      h: DESK_H,
      layer: 'below',
      anchors: [{ name: deskId, ox: 1, oy: 2, type: 'work' }],
    });

    // Chair prop (placed at desk + 1 tile offset)
    props.push({
      id: 'desk_chair_dark',
      x: deskX + 1,
      y: deskY + 1,
      w: CHAIR_W,
      h: CHAIR_H,
      layer: 'above',
      anchors: [{ name: chairId, ox: 0, oy: 0.8, type: 'work' }],
    });

    const resolved = resolveCitizenProps(agent.role, overrides ?? {});
    const sprite = CITIZEN_SPRITES[i % CITIZEN_SPRITES.length];

    citizens.push({
      id: `ns-${team}-${agent.role}`,
      name: resolved.displayName,
      sprite,
      role: agent.role,
      workstationId: stationId,
      color: resolved.color,
      position: { x: deskX + 1.5, y: deskY + 2 },
    });
  }

  return {
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    tileSize: TILE_SIZE,
    scale: SCALE,
    theme: 'gear-supply',
    workstations,
    citizens,
    props,
  };
}

/**
 * Merge base world data (floor, props, tiles) with dynamic config (citizens, workstations).
 * Base world provides gridCols/gridRows/floor/tiles/propImages/props/wanderPoints.
 * Dynamic provides canvas/tileSize/scale/theme/workstations/citizens/props.
 * Work-anchored props from the base world are replaced by dynamic workstation props.
 */
export function mergeWorldConfig(baseWorldPath: string, dynamicConfig: WorldConfig): Record<string, unknown> {
  if (!existsSync(baseWorldPath)) {
    return dynamicConfig as unknown as Record<string, unknown>;
  }
  try {
    const baseWorld = JSON.parse(readFileSync(baseWorldPath, 'utf-8'));

    // Filter out work-type props from base world (desks/chairs) — dynamic config provides these
    const baseProps = (baseWorld.props ?? []).filter((p: any) =>
      !p.anchors?.some((a: any) => a.type === 'work')
    );

    // Merge: base world + dynamic config, with concatenated props
    const merged = { ...baseWorld, ...dynamicConfig };
    merged.props = [...baseProps, ...dynamicConfig.props];
    return merged;
  } catch {
    return dynamicConfig as unknown as Record<string, unknown>;
  }
}
