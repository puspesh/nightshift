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
}

export interface WorkstationAnchor {
  id: string;
  x: number;
  y: number;
}

export interface CitizenConfig {
  id: string;
  name: string;
  displayName: string;
  sprite: string;
  role: string;
  workstationId: string;
  color: string;
}

export interface CitizenOverride {
  displayName?: string | null;
  color?: string;
}

export type CitizenOverrides = Record<string, CitizenOverride>;

export interface HookConfig {
  hooks: Record<string, HookEntry[]>;
}

export interface HookEntry {
  matcher: string;
  hooks: { type: 'command'; command: string }[];
}
