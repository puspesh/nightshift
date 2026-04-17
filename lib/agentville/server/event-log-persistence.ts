/**
 * Append-only JSONL persistence for the event log sidebar.
 * Stores significant agent activity to ~/.agentville/events.log so
 * the feed survives server restarts.
 */

import { appendFileSync, readFileSync, existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const LOG_FILENAME = 'events.log';
const MEMORY_BUFFER_SIZE = 500; // Keep last 500 entries in memory to avoid re-reading disk

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
  /** Bounded in-memory buffer of recent entries — avoids re-reading the file for loadRecent(). */
  private recentBuffer: LogEntry[] = [];

  constructor(dir: string) {
    this.logPath = join(dir, LOG_FILENAME);
    this.nextId = this.initNextId();
  }

  /** Read existing log on startup to seed nextId and the in-memory buffer. */
  private initNextId(): number {
    if (!existsSync(this.logPath)) return 1;
    try {
      const content = readFileSync(this.logPath, 'utf-8').trim();
      if (!content) return 1;
      const lines = content.split('\n');
      // Parse all valid entries to seed the in-memory buffer
      const allEntries: LogEntry[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (typeof entry.id === 'number') allEntries.push(entry);
        } catch {
          // skip corrupt line
        }
      }
      // Seed buffer with last MEMORY_BUFFER_SIZE entries
      this.recentBuffer = allEntries.slice(-MEMORY_BUFFER_SIZE);
      if (allEntries.length > 0) {
        return allEntries[allEntries.length - 1].id + 1;
      }
      return 1;
    } catch {
      return 1;
    }
  }

  append(entry: Omit<LogEntry, 'id'>): LogEntry {
    const logEntry: LogEntry = { id: this.nextId++, ...entry };
    appendFileSync(this.logPath, JSON.stringify(logEntry) + '\n');
    // Keep in-memory buffer bounded
    this.recentBuffer.push(logEntry);
    if (this.recentBuffer.length > MEMORY_BUFFER_SIZE) {
      this.recentBuffer = this.recentBuffer.slice(-MEMORY_BUFFER_SIZE);
    }
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
        // nextId and in-memory buffer continue — no reset needed
      }
    } catch {
      // ignore rotation errors
    }
  }

  loadRecent(count = 200): LogEntry[] {
    // Serve from in-memory buffer when it has enough entries
    if (count <= this.recentBuffer.length) {
      return this.recentBuffer.slice(-count);
    }
    // Fall back to disk for requests larger than the buffer
    // TODO: For very large files, consider reverse-read optimization
    const entries = this.readAll();
    return entries.slice(-count);
  }

  loadBefore(beforeId: number, limit = 50): LogEntry[] {
    // Check if the buffer covers the requested range
    const bufferedFiltered = this.recentBuffer.filter(e => e.id < beforeId);
    if (bufferedFiltered.length >= limit) {
      return bufferedFiltered.slice(-limit);
    }
    // Fall back to full disk read for older entries beyond the buffer
    // TODO: Consider async I/O or reverse-read for large files
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
