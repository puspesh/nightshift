import type { AgentState } from '../citizens/Citizen';

export interface AgentStatus {
  id: string;
  name: string;
  state: AgentState;
  task: string | null;
  energy: number;
  metadata?: Record<string, unknown>;
}

export interface SignalConfig {
  type: 'rest' | 'websocket' | 'mock';
  url?: string;
  interval?: number;
  mockData?: () => AgentStatus[];
}

export type SignalCallback = (agents: AgentStatus[]) => void;

/** Normalize server agent format ({ agent }) to core format ({ id }) */
function normalizeAgents(agents: any[]): AgentStatus[] {
  return agents.map(a => ({
    id: a.id ?? a.agent,
    name: a.name ?? a.id ?? a.agent,
    state: a.state ?? 'idle',
    task: a.task ?? null,
    energy: a.energy ?? 1,
    metadata: a.metadata,
  }));
}
export type EventCallback = (event: { id: number; timestamp: number; agentId: string; action: Record<string, unknown> }) => void;
export type MessageCallback = (msg: { from: string; message: string; channel?: string }) => void;

export class Signal {
  private config: SignalConfig;
  private callbacks: SignalCallback[] = [];
  private eventCallbacks: EventCallback[] = [];
  private messageCallbacks: MessageCallback[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private ws: WebSocket | null = null;

  constructor(config: SignalConfig) {
    this.config = config;
  }

  onUpdate(cb: SignalCallback) {
    this.callbacks.push(cb);
  }

  /** Register callback for world events (interactive mode) */
  onEvent(cb: EventCallback) {
    this.eventCallbacks.push(cb);
  }

  /** Register callback for direct/channel messages */
  onMessage(cb: MessageCallback) {
    this.messageCallbacks.push(cb);
  }

  /** Send an action to the server (interactive mode, WebSocket only) */
  sendAction(agentId: string, action: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'action', agent: agentId, action }));
    }
  }

  /** Request a world snapshot (interactive mode, WebSocket only) */
  requestObserve(agentId: string, sinceEventId?: number) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'observe', agent: agentId, since: sinceEventId }));
    }
  }

  private emit(agents: AgentStatus[]) {
    for (const cb of this.callbacks) {
      cb(agents);
    }
  }

  private emitEvent(event: { id: number; timestamp: number; agentId: string; action: Record<string, unknown> }) {
    for (const cb of this.eventCallbacks) {
      cb(event);
    }
  }

  private emitMessage(msg: { from: string; message: string; channel?: string }) {
    for (const cb of this.messageCallbacks) {
      cb(msg);
    }
  }

  start() {
    switch (this.config.type) {
      case 'rest':
        this.startPolling();
        break;
      case 'websocket':
        this.startWebSocket();
        break;
      case 'mock':
        this.startMock();
        break;
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private async startPolling() {
    const url = this.config.url!;
    const interval = this.config.interval ?? 3000;

    const poll = async () => {
      try {
        const res = await fetch(url);
        const data = await res.json();
        this.emit(data.agents ?? []);
      } catch {
        // Silent fail on network errors
      }
    };

    await poll();
    this.intervalId = setInterval(poll, interval);
  }

  private startWebSocket() {
    const url = this.config.url!;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'agents') {
          this.emit(normalizeAgents(data.agents ?? []));
        } else if (data.type === 'event' && data.event) {
          this.emitEvent(data.event);
        } else if (data.type === 'message' && data.from && data.message) {
          this.emitMessage({ from: data.from, message: data.message, channel: data.channel });
        } else if (data.type === 'world' && data.snapshot) {
          if (data.snapshot.agents) this.emit(normalizeAgents(data.snapshot.agents));
          if (data.snapshot.events) {
            for (const ev of data.snapshot.events) this.emitEvent(ev);
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      // Reconnect after delay
      setTimeout(() => {
        if (this.ws) this.startWebSocket();
      }, 5000);
    };
  }

  private startMock() {
    if (!this.config.mockData) return;
    const interval = this.config.interval ?? 3000;

    this.emit(this.config.mockData());
    this.intervalId = setInterval(() => {
      this.emit(this.config.mockData!());
    }, interval);
  }
}
