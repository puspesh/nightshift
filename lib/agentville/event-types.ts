// Event type constants
export type AgentvilleEventType =
  | 'agent:heartbeat'
  | 'work:completed'
  | 'agent:spawned'
  | 'agent:spawn-ended'
  | 'agent:idle'
  | 'agent:error';

// Common envelope
export interface AgentvilleEvent {
  type: AgentvilleEventType;
  source: string;        // opaque — "nightshift", "claude-code", anything
  agent: string;         // agent identifier
  timestamp?: number;    // optional, server fills if missing
  data?: Record<string, unknown>;
}

// Type-specific data payloads
export interface HeartbeatData {
  state?: string;        // 'idle' | 'working' | 'thinking' | 'speaking'
  task?: string | null;
  name?: string;
  color?: string;
  energy?: number;
}

export interface WorkCompletedData {
  workType: string;      // 'issue_triaged' | 'plan_written' | 'review_completed' | 'test_passed' | 'pr_merged'
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentSpawnedData {
  parent: string;
  child: string;
  task?: string;
}

export interface AgentSpawnEndedData {
  parent: string;
  child: string;
}

export interface AgentIdleData {
  reason?: string;       // 'session_ended' | 'timeout' | undefined
}

export interface AgentErrorData {
  error: string;
  tool?: string;
}

// Validation
export function validateEvent(body: unknown): AgentvilleEvent | null {
  if (typeof body !== 'object' || body === null) return null;
  const obj = body as Record<string, unknown>;

  if (typeof obj.type !== 'string') return null;
  if (typeof obj.source !== 'string') return null;
  if (typeof obj.agent !== 'string') return null;

  const validTypes: AgentvilleEventType[] = [
    'agent:heartbeat', 'work:completed', 'agent:spawned',
    'agent:spawn-ended', 'agent:idle', 'agent:error',
  ];
  if (!validTypes.includes(obj.type as AgentvilleEventType)) return null;

  return {
    type: obj.type as AgentvilleEventType,
    source: obj.source as string,
    agent: obj.agent as string,
    timestamp: typeof obj.timestamp === 'number' ? obj.timestamp : Date.now(),
    data: typeof obj.data === 'object' && obj.data !== null ? obj.data as Record<string, unknown> : undefined,
  };
}
