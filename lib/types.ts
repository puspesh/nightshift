export interface AgentEntry {
  role: string;
  agent: string;
  cwd: string;
}

export interface CitizenOverride {
  displayName?: string | null;
  color?: string;
}

export type CitizenOverrides = Record<string, CitizenOverride>;

export interface StartOptions {
  port?: number;
  headless?: boolean;
}

export interface HookConfig {
  hooks: Record<string, HookEntry[]>;
}

export interface HookEntry {
  matcher: string;
  hooks: { type: 'command'; command: string }[];
}
