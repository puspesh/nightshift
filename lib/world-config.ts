import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentEntry, WorldConfig, WorkstationAnchor, CitizenConfig } from './types.js';

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 384;
const TILE_SIZE = 32;
const SCALE = 2;

const ROLE_COLORS: Record<string, string> = {
  producer: '#00cccc',
  planner:  '#cccc00',
  reviewer: '#cc00cc',
  tester:   '#00cc00',
};
const CODER_COLOR = '#0066cc';

/**
 * Generate a miniverse world configuration from a list of agents.
 * Workstations are placed in a grid layout that adapts to agent count.
 */
export function generateWorldConfig(agents: AgentEntry[], team: string): WorldConfig {
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

    const color = agent.role.startsWith('coder-')
      ? CODER_COLOR
      : (ROLE_COLORS[agent.role] ?? CODER_COLOR);

    citizens.push({
      id: `ns-${team}-${agent.role}`,
      displayName: agent.role,
      role: agent.role,
      workstationId: stationId,
      color,
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
 */
export function writeWorldConfig(config: WorldConfig, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'world.json'), JSON.stringify(config, null, 2) + '\n');
}
