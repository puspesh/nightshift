# Plan: Agentville — Persistent Event Log Sidebar

> Issue: #54
> Date: 2026-04-17
> Status: draft

## Overview

Add an always-visible, collapsible right-side sidebar that displays a real-time feed of
significant agent activity (work completed, sub-agent spawns, rare drops, errors). Events
persist to an append-only log file at `~/.agentville/events.log` so the feed survives
server restarts. The sidebar live-updates via the existing WebSocket connection and
preserves scroll position when new events arrive.

## Requirements

- Right-side sidebar, collapsible via toggle button; shows most recent ~200 entries
- Each entry formatted as `[HH:MM] <agent>: <work done>`
- Sources: `work:completed`, `agent:spawned`, `agent:spawn-ended`, `agent:error`, `coins:earned` (for drop rewards). Excludes `agent:heartbeat`, `agent:idle`, routine `state:update`
- Live-updates via existing WebSocket broadcast
- Persists to disk (append-only JSONL) at `~/.agentville/events.log`; loads last N on page open
- Scrollable; preserves scroll position when new events arrive (no auto-jump if user scrolled up)
- Click entry to jump camera to agent (stretch goal — Phase 3)

## Architecture Changes

- **New file: `lib/agentville/server/event-log-persistence.ts`** — Append-only JSONL writer/reader for `events.log`
- **Modified: `lib/agentville/server/server.ts`** — Initialize persistence, hook into event dispatch, add `/api/event-log` endpoint, broadcast `log:entry` messages
- **Modified: `lib/agentville/server/frontend.ts`** — Add sidebar HTML/CSS/JS, WebSocket handler for log entries, scroll management, collapse toggle
- **New test: `tests/agentville-event-log.test.ts`** — Unit tests for persistence module
- **Modified: `tests/e2e/game-world.spec.ts`** — E2E tests for sidebar rendering and live updates

## Implementation Steps

### Phase 1: Server-Side Event Persistence

The smallest useful slice: events written to disk and retrievable via API. No UI yet — this phase makes the log durable and queryable.

#### Tests First

- **Test file**: `tests/agentville-event-log.test.ts`
- **Test cases**:
  - `append() writes a JSONL line to the log file`: Create a temp dir, append an entry, read the file, assert valid JSON with expected fields (id, timestamp, agentKey, type, summary)
  - `append() creates the file if it does not exist`: Call append on a fresh dir, assert file exists after
  - `append() appends (does not overwrite) on subsequent calls`: Append 3 entries, assert file has 3 lines
  - `loadRecent(n) returns the last N entries in chronological order`: Append 10 entries, call `loadRecent(5)`, assert returns entries 6-10 in order
  - `loadRecent() with fewer entries than N returns all`: Append 2 entries, call `loadRecent(50)`, assert returns 2
  - `loadRecent() from empty/missing file returns []`: Call on fresh dir, assert empty array
  - `loadBefore(id, limit) returns entries older than id`: Append 20, call `loadBefore(15, 5)`, assert returns entries 10-14
  - `corrupt lines are skipped gracefully`: Write a mix of valid JSON and garbage, assert only valid entries returned
  - `isSignificant() filters correctly`: Assert `work:completed` → true, `agent:heartbeat` → false, `agent:spawned` → true, `agent:error` → true, `agent:idle` → false, `state:update` → false
  - `formatSummary() produces human-readable text`: Assert `work:completed` with description → uses description; `agent:spawned` → "spawned sub-agent X"; `agent:error` → "error: <msg>"

#### Implementation Steps

1. **Create `lib/agentville/server/event-log-persistence.ts`**
   - Export interface `LogEntry { id: number; timestamp: number; agentKey: string; type: string; summary: string; data?: Record<string, unknown> }`
   - Export class `EventLogPersistence`:
     - Constructor takes `dir: string` (the `~/.agentville/` directory)
     - `private logPath`: `join(dir, 'events.log')`
     - `private nextId`: Initialized from last line of existing file + 1, or 1
     - `append(entry: Omit<LogEntry, 'id'>): LogEntry` — assigns `id`, appends as JSON line + `\n`, returns entry
     - `loadRecent(count = 200): LogEntry[]` — reads file, returns last `count` entries (parse from end for efficiency; initially can read entire file since log grows slowly)
     - `loadBefore(beforeId: number, limit = 50): LogEntry[]` — returns `limit` entries with `id < beforeId`, ordered chronologically
     - `lastId(): number` — returns highest id or 0
   - Export function `isSignificant(type: string): boolean` — returns true for `work:completed`, `agent:spawned`, `agent:spawn-ended`, `agent:error`; false for everything else
   - Export function `formatSummary(type: string, agentKey: string, data: Record<string, unknown>): string` — produces the human-readable summary text:
     - `work:completed` → `data.description ?? data.workType` (e.g. "merged PR #42")
     - `agent:spawned` → `"spawned sub-agent ${data.child}"`
     - `agent:spawn-ended` → `"sub-agent ${data.child} finished"`
     - `agent:error` → `"error: ${data.error}"`
   - Dependencies: `node:fs` (appendFileSync, readFileSync, existsSync), `node:path`
   - Why a separate module: follows existing pattern where `persistence.ts` handles `world.json`; this handles `events.log` with different semantics (append-only vs atomic overwrite)

2. **Hook persistence into `server.ts`**
   - In `AgentvilleServer` constructor: instantiate `EventLogPersistence` using the same `publicDir` (or a configurable `dataDir`) that `world.json` lives in
   - In `handleEvent()`: after the existing switch cases, check `isSignificant(event.type)`. If true:
     - Call `formatSummary()` to produce the summary
     - Call `persistence.append({ timestamp: Date.now(), agentKey, type: event.type, summary, data: event.data })`
     - Broadcast to WS: `{ type: 'log:entry', entry: logEntry }` (this is the sidebar's live-update signal)
   - Also hook `coins:earned` drops: when `result.drop` is truthy (a rare drop), append a log entry like `"drop — ${drop.name}"`. This goes after the existing `coins:earned` broadcast in the `work:completed` handler.
   - Why here and not in EventLog: The EventLog ring buffer is for the interactive agent protocol (observe/act). The persistent log is for human-facing activity history — different concern, different lifecycle.

3. **Add `/api/event-log` endpoint**
   - `GET /api/event-log` — returns `{ entries: LogEntry[] }`
     - Query params: `?before=<id>&limit=<n>` (defaults: no before = most recent, limit = 200)
     - If `before` is provided: call `loadBefore(before, limit)`
     - Otherwise: call `loadRecent(limit)`
   - Why a new endpoint vs extending `/api/events`: The existing `/api/events` serves the interactive agent protocol (WorldEvent ring buffer). The event log is a separate persistence layer with different semantics (human-readable summaries, filtered, disk-backed).

### Phase 2: Frontend Sidebar

The core UI experience. Renders the sidebar with live updates and scroll management.

#### Tests First

- **Test file**: `tests/e2e/game-world.spec.ts` (add new describe block)
- **Test cases**:
  - `event log sidebar is visible on page load`: Navigate to page, assert `#event-log-sidebar` is visible
  - `sidebar shows entries from /api/event-log on load`: Post 3 work:completed events before page load, navigate, assert sidebar contains 3 entries with correct format `[HH:MM] agent: description`
  - `sidebar updates live when work:completed fires`: Load page, post a work:completed event, assert new entry appears in sidebar within 2s
  - `sidebar does not show heartbeat events`: Post heartbeat, assert sidebar entry count unchanged
  - `collapse toggle hides sidebar content`: Click collapse button, assert sidebar content area hidden, toggle button still visible
  - `expand toggle restores sidebar`: Click collapse again, assert content visible
  - `scroll position preserved on new event when scrolled up`: Scroll sidebar up, post new event, assert scrollTop unchanged (user is reading history)
  - `auto-scrolls to bottom when already at bottom`: Don't scroll up, post new event, assert latest entry is visible

#### Implementation Steps

1. **Add sidebar HTML/CSS to `frontend.ts`**
   - Add to the body layout (after canvas-container, before status-panel):
     ```
     <div id="event-log-sidebar">
       <div id="event-log-header">
         <span>Activity</span>
         <button id="event-log-toggle">◀</button>
       </div>
       <div id="event-log-entries"></div>
     </div>
     ```
   - CSS:
     - `#event-log-sidebar`: `position: fixed; right: 0; top: 0; height: 100vh; width: 280px; background: #0d1117; border-left: 1px solid #30363d; display: flex; flex-direction: column; z-index: 15; transition: transform 0.2s ease;`
     - Collapsed state (`.collapsed`): `transform: translateX(calc(100% - 32px));` — only the toggle button visible
     - `#event-log-header`: flex row, justify between, padding, border-bottom
     - `#event-log-entries`: `flex: 1; overflow-y: auto; padding: 8px;` — scrollable area
     - Entry styling: `.log-entry { font-size: 12px; font-family: monospace; padding: 4px 0; border-bottom: 1px solid #21262d; color: #8b949e; }` with `.log-entry-time { color: #484f58; }` and `.log-entry-agent { color: #58a6ff; }`
     - Adjust `#canvas-container` to accommodate sidebar: `margin-right: 280px` (removed when collapsed)
   - Why fixed positioning: The sidebar should remain visible while scrolling the page. The canvas and status panel shift left to make room.

2. **Add sidebar JavaScript to `frontend.ts`**
   - **On page load**: `fetch('/api/event-log?limit=200')` → populate `#event-log-entries` with formatted entries
   - **Entry rendering**: `renderLogEntry(entry)` → creates a div with:
     ```
     <div class="log-entry" data-id="${entry.id}" data-agent="${entry.agentKey}">
       <span class="log-entry-time">[${formatTime(entry.timestamp)}]</span>
       <span class="log-entry-agent">${shortName(entry.agentKey)}</span>: ${entry.summary}
     </div>
     ```
     - `formatTime()`: converts timestamp to `HH:MM` format
     - `shortName()`: extracts the agent name from `source/agent` key (takes part after last `/`)
   - **WebSocket handler**: Add case for `msg.type === 'log:entry'`:
     - Check if user has scrolled up: `const isAtBottom = entries.scrollTop + entries.clientHeight >= entries.scrollHeight - 20`
     - Append new entry div
     - If `isAtBottom`: scroll to bottom. Otherwise: leave scroll position unchanged
     - Cap DOM entries at 500 (remove oldest from DOM when exceeded — not from disk)
   - **Collapse toggle**: Click handler on `#event-log-toggle`:
     - Toggle `.collapsed` class on `#event-log-sidebar`
     - Toggle `margin-right` on `#canvas-container`
     - Update button text: `◀` when expanded, `▶` when collapsed
     - Persist state in `localStorage.setItem('event-log-collapsed', '1'|'0')`
     - On load: restore from localStorage
   - **Infinite scroll (load older)**: When user scrolls to top of `#event-log-entries`:
     - Get oldest visible entry's `data-id`
     - `fetch('/api/event-log?before=${oldestId}&limit=50')`
     - Prepend entries to container
     - Preserve scroll position (save scrollHeight before, restore after)
     - If response returns fewer than `limit`, stop requesting (reached beginning of log)

### Phase 3: Polish & Stretch Goals

Edge cases, visual refinements, and the click-to-camera stretch goal.

#### Tests First

- **Test file**: `tests/e2e/game-world.spec.ts`
- **Test cases**:
  - `sidebar loads older entries on scroll to top`: Post 60 events, load page (gets 50), scroll to top, assert more entries load
  - `error entries have distinct styling`: Post agent:error event, assert entry has `.log-entry-error` class
  - `drop entries have distinct styling`: Post work:completed with drop, assert entry has `.log-entry-drop` class
  - `clicking an entry with an agent highlights that citizen` (stretch): Click entry, assert citizen has visual indicator

- **Test file**: `tests/agentville-event-log.test.ts`
- **Test cases**:
  - `log rotation: files over 10MB are rotated`: Simulate large file, assert rotation happens
  - `concurrent appends don't corrupt the file`: Rapid sequential appends, assert all lines valid JSON

#### Implementation Steps

1. **Entry type styling** (`frontend.ts`)
   - Add CSS classes: `.log-entry-error { color: #f85149; }`, `.log-entry-drop { color: #f0c040; }`
   - Apply based on entry type in `renderLogEntry()`

2. **Log rotation** (`event-log-persistence.ts`)
   - On `append()`: check file size. If > 10MB, rename to `events.log.1` (overwrite any existing `.1`), start fresh
   - Keep at most 1 rotated file (simple, avoids complexity)
   - Why 10MB: at ~200 bytes per entry, that's ~50K entries — months of activity. Keeps disk usage bounded without losing recent history.

3. **Click-to-camera** (`frontend.ts`) — stretch goal
   - Add click handler on `.log-entry`
   - Extract `data-agent` attribute
   - Call engine's camera focus method if available (check if `agentvilleEngine.focusCitizen(agentKey)` exists)
   - If engine doesn't expose this, defer to a follow-up issue
   - Why stretch: requires coordination with the game engine's camera system which may need its own API addition

## Testing Strategy

- **Approach**: Test-Driven Development (TDD) — tests are written BEFORE implementation in each phase
- **Unit tests**: `tests/agentville-event-log.test.ts` — covers persistence module (append, load, filter, format, rotation)
  - Framework: `node:test` + `node:assert/strict` (matches existing pattern)
  - Uses temp directories via `mkdtempSync` for file isolation
- **E2E tests**: `tests/e2e/game-world.spec.ts` — covers sidebar rendering, live updates, scroll behavior, collapse
  - Framework: Playwright (matches existing pattern)
  - Uses existing test helpers: `postEvent()`, `heartbeat()`, `earnCoins()`
- **Test infrastructure to reuse**:
  - Temp dir pattern from `agentville-persistence.test.ts`
  - Server bootstrap pattern from `game-world.spec.ts`
  - `postEvent()` helper for sending events to the server

## Assumptions

- **Log location**: Uses the same directory as `world.json` (the `publicDir` / data directory passed to the server). The issue says `~/.agentville/events.log` — this is where the server already stores `world.json`, so we'll use the same dir resolution logic.
- **JSONL format**: One JSON object per line. Chosen over a database because it's simple, appendable, human-readable, and matches the project's lightweight persistence philosophy (no external dependencies).
- **No filtering UI**: Issue explicitly marks filtering/search as out of scope. The sidebar shows all significant events in chronological order.
- **`log:entry` WebSocket message type**: New message type for the sidebar. Distinct from `event` (which is for the interactive protocol's WorldEvent ring buffer) to avoid breaking existing consumers.
- **500 DOM element cap**: The sidebar keeps at most 500 entries in the DOM for performance. Older entries are loaded on-demand via scroll. The disk log retains everything.
- **Agent short name**: Display the portion after the last `/` in the agentKey (e.g., `nightshift/planner` → `planner`). This is the most readable format for the sidebar.

## Risks & Mitigations

- **Risk**: Large log files slow down `loadRecent()` since it reads the entire file
  - Mitigation: Phase 3 adds log rotation at 10MB. For Phase 1, full-file read is acceptable — the log grows at ~200 bytes/event, and even 10K events is only ~2MB. If needed later, we can add a reverse-read optimization or index file.

- **Risk**: High-frequency events (e.g., rapid sub-agent spawns) could flood the sidebar
  - Mitigation: The `isSignificant()` filter already excludes heartbeats and routine state updates. The remaining event types (work:completed, spawned, error) fire infrequently — typically a few per minute at most. No throttling needed.

- **Risk**: Sidebar layout conflicts with existing UI on small screens
  - Mitigation: The sidebar is collapsible with state persisted in localStorage. Collapsed by default on viewports under 1024px wide (add a media query check on load). The main canvas adjusts its margin dynamically.
