/**
 * Append-only JSONL persistence for the event log sidebar.
 * Stores significant agent activity to ~/.agentville/events.log so
 * the feed survives server restarts.
 */

import { appendFileSync, readFileSync, existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

export interface LogEntry {
  id: number;
  timestamp: number;
  agentKey: string;
  type: string;
  summary: string;
  data?: Record<string, unknown>;
}

export class EventLogPersistence {
  private logPath: string;
  private nextId: number;

  constructor(dir: string) {
    this.logPath = join(dir, 'events.log');
    this.nextId = this.initNextId();
  }

  private initNextId(): number {
    if (!existsSync(this.logPath)) return 1;
    try {
      const content = readFileSync(this.logPath, 'utf-8').trim();
      if (!content) return 1;
      const lines = content.split('\n');
      // Walk backwards to find last valid entry
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          if (typeof entry.id === 'number') return entry.id + 1;
        } catch {
          // skip corrupt line
        }
      }
      return 1;
    } catch {
      return 1;
    }
  }

  append(entry: Omit<LogEntry, 'id'>): LogEntry {
    const logEntry: LogEntry = { id: this.nextId++, ...entry };
    appendFileSync(this.logPath, JSON.stringify(logEntry) + '\n');
    this.maybeRotate();
    return logEntry;
  }

  private maybeRotate(): void {
    try {
      if (!existsSync(this.logPath)) return;
      const stat = statSync(this.logPath);
      if (stat.size > MAX_LOG_SIZE) {
        const rotatedPath = this.logPath + '.1';
        renameSync(this.logPath, rotatedPath);
        // nextId continues from where it left off — no reset
      }
    } catch {
      // ignore rotation errors
    }
  }

  loadRecent(count = 200): LogEntry[] {
    const entries = this.readAll();
    return entries.slice(-count);
  }

  loadBefore(beforeId: number, limit = 50): LogEntry[] {
    const entries = this.readAll();
    const filtered = entries.filter(e => e.id < beforeId);
    return filtered.slice(-limit);
  }

  lastId(): number {
    return this.nextId - 1;
  }

  private readAll(): LogEntry[] {
    if (!existsSync(this.logPath)) return [];
    try {
      const content = readFileSync(this.logPath, 'utf-8').trim();
      if (!content) return [];
      const entries: LogEntry[] = [];
      for (const line of content.split('\n')) {
        try {
          const entry = JSON.parse(line);
          if (typeof entry.id === 'number') entries.push(entry);
        } catch {
          // skip corrupt lines
        }
      }
      return entries;
    } catch {
      return [];
    }
  }
}

const SIGNIFICANT_TYPES = new Set([
  'work:completed',
  'agent:spawned',
  'agent:spawn-ended',
  'agent:error',
]);

export function isSignificant(type: string): boolean {
  return SIGNIFICANT_TYPES.has(type);
}

export function formatSummary(type: string, agentKey: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'work:completed':
      return (data.description as string) ?? (data.workType as string) ?? 'work completed';
    case 'agent:spawned':
      return `spawned sub-agent ${data.child ?? 'unknown'}`;
    case 'agent:spawn-ended':
      return `sub-agent ${data.child ?? 'unknown'} finished`;
    case 'agent:error':
      return `error: ${data.error ?? 'unknown error'}`;
    default:
      return type;
  }
}
