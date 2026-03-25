export interface AgentEntry {
  role: string;
  agent: string;
  cwd: string;
}

export interface WorldConfig {
  canvas: { width: number; height: number };
  tileSize: number;
  scale: number;
  theme: string;
  workstations: WorkstationAnchor[];
  citizens: CitizenConfig[];
  props: WorldProp[];
}

export interface WorldProp {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: 'below' | 'above';
  anchors?: { name: string; ox: number; oy: number; type: string }[];
}

export interface WorkstationAnchor {
  id: string;
  x: number;
  y: number;
}

export interface CitizenConfig {
  id: string;
  name: string;
  sprite: string;
  role: string;
  workstationId: string;
  color: string;
  position: { x: number; y: number };
}

export interface CitizenOverride {
  displayName?: string | null;
  color?: string;
}

export type CitizenOverrides = Record<string, CitizenOverride>;

export interface AgentModelConfig {
  model?: string;
  thinkingBudget?: string;
  reasoningEffort?: string;
}

export type AgentConfigs = Record<string, AgentModelConfig>;

export interface HookConfig {
  hooks: Record<string, HookEntry[]>;
}

export interface HookEntry {
  matcher: string;
  hooks: { type: 'command'; command: string }[];
}
