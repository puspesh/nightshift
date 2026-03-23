export interface AgentState {
  agent: string;
  name?: string;
  state: string;
  task: string | null;
  energy: number;
  metadata: Record<string, unknown>;
  lastSeen: number;
  color?: string;
}

export class AgentStore {
  private agents: Map<string, AgentState> = new Map();
  private offlineTimeout: number;
  private listeners: Set<(agents: AgentState[]) => void> = new Set();
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(offlineTimeout = 120000) {
    this.offlineTimeout = offlineTimeout;
  }

  start() {
    this.sweepInterval = setInterval(() => this.sweep(), 5000);
  }

  stop() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  heartbeat(data: {
    agent: string;
    name?: string;
    state?: string;
    task?: string | null;
    energy?: number;
    metadata?: Record<string, unknown>;
    color?: string;
  }): AgentState {
    const existing = this.agents.get(data.agent);

    const agent: AgentState = {
      agent: data.agent,
      name: data.name ?? existing?.name ?? data.agent,
      state: data.state ?? existing?.state ?? 'idle',
      task: data.task !== undefined ? data.task : (existing?.task ?? null),
      energy: data.energy ?? existing?.energy ?? 1,
      metadata: data.metadata ?? existing?.metadata ?? {},
      lastSeen: Date.now(),
      color: data.color ?? existing?.color,
    };

    this.agents.set(data.agent, agent);
    this.notify();
    return agent;
  }

  remove(agentId: string) {
    this.agents.delete(agentId);
    this.notify();
  }

  getAll(): AgentState[] {
    return Array.from(this.agents.values());
  }

  getPublicList() {
    return this.getAll().map(({ lastSeen: _, ...rest }) => rest);
  }

  onUpdate(listener: (agents: AgentState[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const agents = this.getAll();
    for (const listener of this.listeners) {
      listener(agents);
    }
  }

  private sweep() {
    const now = Date.now();
    let changed = false;

    for (const [id, agent] of this.agents) {
      const elapsed = now - agent.lastSeen;
      if (agent.state !== 'offline' && agent.state !== 'sleeping' && elapsed > this.offlineTimeout) {
        // Graceful: sleep first, then offline
        agent.state = 'sleeping';
        agent.task = null;
        changed = true;
      } else if (agent.state === 'sleeping' && elapsed > this.offlineTimeout + 3_600_000) {
        // After sleeping for another timeout period, go offline
        agent.state = 'offline';
        agent.task = null;
        changed = true;
      }
    }

    if (changed) this.notify();
  }
}
