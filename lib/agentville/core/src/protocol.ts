/**
 * Miniverse Agent Protocol — shared types for passive and interactive modes.
 *
 * Passive:      agent → status → world renders
 * Interactive:  agent → status + actions → world renders + broadcasts state
 *               agent ← world state + events
 */

import type { AgentState } from './citizens/Citizen';

// --- Actions (agent → world) ---

export type AgentAction =
  | { type: 'move'; to: string }
  | { type: 'speak'; message: string; to?: string }
  | { type: 'emote'; emote: string }
  | { type: 'status'; state: AgentState; task?: string | null; energy?: number }
  | { type: 'message'; to: string | string[]; message: string }
  | { type: 'join_channel'; channel: string }
  | { type: 'leave_channel'; channel: string };

// --- Events (world → agent) ---

export interface WorldEvent {
  id: number;
  timestamp: number;
  agentId: string;
  action: AgentAction;
}

// --- World snapshot (observe response) ---

export interface WorldSnapshot {
  /** World identifier */
  worldId: string;
  /** Grid dimensions */
  gridCols: number;
  gridRows: number;
  /** All citizens and their current state */
  citizens: CitizenSnapshot[];
  /** Named locations / anchors */
  locations: LocationSnapshot[];
  /** Props in the world */
  props: PropSnapshot[];
  /** Recent events since lastEventId (or last 50) */
  events: WorldEvent[];
  /** ID of the latest event (for polling) */
  lastEventId: number;
}

export interface CitizenSnapshot {
  agentId: string;
  name: string;
  state: AgentState;
  task: string | null;
  energy: number;
  position: string | null;
  tileX: number;
  tileY: number;
  isNpc: boolean;
  moving: boolean;
}

export interface LocationSnapshot {
  name: string;
  x: number;
  y: number;
  type: string;
}

export interface PropSnapshot {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// --- WebSocket message types ---

/** Messages from server to agent/client */
export type ServerMessage =
  | { type: 'agents'; agents: unknown[] }
  | { type: 'world'; snapshot: WorldSnapshot }
  | { type: 'event'; event: WorldEvent }
  | { type: 'message'; from: string; message: string; channel?: string };

/** Messages from agent to server */
export type ClientMessage =
  | { type: 'action'; agent: string; action: AgentAction }
  | { type: 'observe'; agent: string; since?: number };
