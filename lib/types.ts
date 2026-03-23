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
  displayName: string;
  role: string;
  workstationId: string;
  color: string;
  position?: [number, number];
}

export interface HookConfig {
  hooks: Record<string, HookEntry[]>;
}

export interface HookEntry {
  matcher: string;
  hooks: { type: 'command'; command: string }[];
}
