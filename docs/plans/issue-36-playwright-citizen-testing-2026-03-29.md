# Plan: Playwright browser testing for citizen spawn, movement, and state changes

> Issue: #36
> Date: 2026-03-29
> Status: revised

## Overview

Add Playwright browser testing infrastructure to verify that the miniverse visualization works correctly: citizens spawn on the canvas, move between positions, and change states (working, idle, thinking, sitting, etc.). Since the visualization is canvas-based and not DOM-inspectable, the strategy is to add structured `console.log` events in the frontend JavaScript for citizen lifecycle events, then use Playwright's console message capture to assert behavior in tests. The DOM-based status panel provides a secondary verification path.

## Requirements

- R1: Add structured console logs in the browser frontend for citizen spawn, state change, and movement events
- R2: Install Playwright and configure it as a dev dependency with a proper config file
- R3: Add a `test:e2e` npm script to run Playwright tests independently from unit tests
- R4: Write Playwright tests that verify: (a) citizens spawn when agents register, (b) state changes propagate to the UI, (c) citizens move (position changes over time), (d) the status panel reflects agent state accurately
- R5: Tests must be self-contained — they start their own miniverse server, register test agents via HTTP heartbeat, and shut down cleanly

## Current State Analysis

### Visualization architecture
The miniverse server (`lib/miniverse/server/server.ts`) runs an HTTP + WebSocket server on port 4321. The frontend (`lib/miniverse/server/frontend.ts`) is a single HTML page with embedded JavaScript that:
1. Fetches world config via `GET /api/world`
2. Connects to WebSocket at `ws://host/ws`
3. Creates a `Miniverse` instance (canvas-based renderer from `miniverse-core.js`)
4. Renders citizens as pixel-art sprites on an HTML5 Canvas
5. Shows agent cards in a DOM-based `#status-panel`

### State update flow
Agent states flow through: `POST /api/heartbeat` → `AgentStore.heartbeat()` → WebSocket broadcast → frontend updates both canvas citizens (via miniverse core's internal WS) and status panel cards.

### Testing gap
All 13 existing test files are unit tests using `node:test`. No browser testing, Playwright, or e2e infrastructure exists. The visualization has never been tested programmatically.

### Console logging
Currently zero console logs in the frontend for citizen lifecycle events. Only `console.warn('No world data available')` exists.

## Architecture Changes

### New files

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Playwright configuration (base URL, timeouts, browser settings) |
| `tests/e2e/citizens.test.ts` | First Playwright test suite: spawn, state, movement, sitting |
| `tests/e2e/helpers.ts` | Shared test utilities: server start/stop, heartbeat sender, log collector |

### Modified files

| File | Change |
|------|--------|
| `lib/miniverse/server/frontend.ts` | Add structured console.log events for citizen lifecycle |
| `package.json` | Add `@playwright/test` dev dependency, add `test:e2e` script |
| `.gitignore` | Add Playwright artifacts: `test-results/`, `playwright-report/` |

## Implementation Steps

### Phase 1: Add console log instrumentation to the frontend

**Goal**: Emit structured, parseable console events that Playwright tests can capture. All logs are gated behind a `?debug=true` URL parameter so they don't fire in normal production usage.

**Tests covered by Phase 1 instrumentation**: Tests 1-6 in Phase 3 (step 9) all depend on these console logs. Specifically:
- Step 1 logs → Tests 2, 3 (spawn and state change verification)
- Step 2 logs → Tests 1-6 (all tests use WS connected as sync point)
- Step 3 logs → Test 6 (canvas health check)

#### 1. Add debug flag detection and console logs for agent state updates

- **File**: `lib/miniverse/server/frontend.ts`
- **Location**: Near the top of the `<script type="module">` block (after the constants, around line 155), and inside the `ws.onmessage` handler (around line 412-420)
- **Action**: First, add a debug flag at the top of the script block:
  ```javascript
  const DEBUG = new URLSearchParams(location.search).has('debug');
  ```
  Then, inside the `ws.onmessage` handler, after updating the agents map and rendering cards, emit structured console logs only when debug is enabled:
  ```javascript
  if (msg.type === 'agents' && Array.isArray(msg.agents)) {
    for (const agent of msg.agents) {
      const existing = agents.get(agent.agent);
      const isNew = !existing;
      agents.set(agent.agent, agent);
      renderCard(agent);

      if (DEBUG) {
        if (isNew) {
          console.log('[nightshift:citizen:spawn]', JSON.stringify({
            agentId: agent.agent,
            name: agent.name,
            state: agent.state,
            task: agent.task
          }));
        } else if (existing.state !== agent.state) {
          console.log('[nightshift:citizen:state]', JSON.stringify({
            agentId: agent.agent,
            from: existing.state,
            to: agent.state,
            task: agent.task
          }));
        }
      }
    }
  }
  ```
- **Why**: The WebSocket `agents` broadcast is the single source of truth for all state changes. By comparing with the existing map entry before updating, we can distinguish spawns (new agent) from state transitions (existing agent, different state). JSON.stringify ensures the payload is parseable by tests. Gating behind `?debug=true` prevents console clutter in normal production usage — nightshift is a dev tool, but the visualization is still user-facing.
- **Dependencies**: none

#### 2. Add console log for WebSocket connection status

- **File**: `lib/miniverse/server/frontend.ts`
- **Location**: Inside the `ws.onopen` handler (around line 407-409)
- **Action**: Add a structured log when the WebSocket connects (also gated behind `DEBUG`):
  ```javascript
  ws.onopen = () => {
    connStatus.textContent = 'Connected';
    connStatus.className = 'connected';
    if (DEBUG) console.log('[nightshift:ws:connected]');
  };
  ```
- **Why**: Tests need to know when the WebSocket is ready before sending heartbeats. This log serves as a synchronization point.
- **Dependencies**: step 1 (the `DEBUG` flag must be defined first)

#### 3. Add console log for world load completion

- **File**: `lib/miniverse/server/frontend.ts`
- **Location**: At the end of `startWorld()` function, after `showWorld(worldKey)` (around line 395)
- **Action**: Add a log after the world finishes loading (gated behind `DEBUG`):
  ```javascript
  showWorld(worldKey);
  if (DEBUG) console.log('[nightshift:world:loaded]', JSON.stringify({ worldKey, citizens: citizens.length }));
  ```
- **Why**: Tests need to know when the canvas is ready and how many citizens were loaded from the world config, before asserting spawn behavior.
- **Dependencies**: step 1 (the `DEBUG` flag must be defined first)

### Phase 2: Set up Playwright infrastructure

#### 4. Install Playwright as a dev dependency

- **Action**: Run `bun add -d @playwright/test` (project uses bun per the `bun.lock` file)
- **Then**: Run `bunx playwright install chromium` to install only Chromium (not all browsers — keeps CI fast)
- **Why**: Playwright is the standard for browser testing. Only Chromium is needed since we're testing a canvas visualization, not cross-browser CSS.
- **Dependencies**: none

#### 5. Create Playwright config

- **File**: `playwright.config.ts`
- **Action**: Create with minimal config:
  ```typescript
  import { defineConfig } from '@playwright/test';

  export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    retries: 0,
    use: {
      headless: true,
      viewport: { width: 1280, height: 720 },
    },
    projects: [
      { name: 'chromium', use: { browserName: 'chromium' } },
    ],
  });
  ```
- **Why**: Simple config that points to e2e tests, uses headless Chromium, and sets a reasonable timeout for server startup + canvas rendering.
- **Dependencies**: step 4

#### 6. Add `test:e2e` npm script

- **File**: `package.json`
- **Action**: Add to scripts:
  ```json
  "test:e2e": "playwright test"
  ```
- **Why**: Keeps e2e tests separate from unit tests. `npm test` continues to run only unit tests. `npm run test:e2e` runs Playwright tests.
- **Dependencies**: step 5

#### 7. Update .gitignore

- **File**: `.gitignore`
- **Action**: Add:
  ```
  # Playwright
  test-results/
  playwright-report/
  ```
- **Why**: Playwright generates test result artifacts and HTML reports that should not be committed.
- **Dependencies**: none

### Phase 3: Write test helpers and first test suite

#### 8. Create shared test helpers

- **File**: `tests/e2e/helpers.ts`
- **Action**: Create utilities that tests will use:

  **a. Server lifecycle** — start/stop a MiniverseServer for tests. Must accept `publicDir` so the server can find the test world and the miniverse-core bundle:
  ```typescript
  import { MiniverseServer } from '../../lib/miniverse/server/server.js';

  export async function startTestServer(publicDir: string): Promise<{ server: MiniverseServer; port: number; baseUrl: string }> {
    const server = new MiniverseServer({ port: 14000 + Math.floor(Math.random() * 50000), publicDir });
    const port = await server.start();
    return { server, port, baseUrl: `http://localhost:${port}` };
  }
  ```
  Uses a random high port (14000-64000) instead of port 0. The server's EADDRINUSE handler auto-increments, so collisions resolve naturally. Port 0 would work for `listen(0)` in Node.js but the server's increment logic would go to port 1, which is wasteful — a random high port is more direct.

  **b. Heartbeat sender** — POST to `/api/heartbeat` to register/update agents:
  ```typescript
  export async function sendHeartbeat(baseUrl: string, data: {
    agent: string;
    name?: string;
    state?: string;
    task?: string | null;
    energy?: number;
    color?: string;
  }): Promise<void> {
    await fetch(`${baseUrl}/api/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }
  ```

  **c. Console log collector** — helper for Playwright page to collect structured logs:
  ```typescript
  import type { Page } from '@playwright/test';

  export function collectConsoleLogs(page: Page, prefix: string): string[] {
    const logs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.startsWith(prefix)) {
        logs.push(text);
      }
    });
    return logs;
  }
  ```

  **d. World config setup** — create a minimal test world.json and symlink miniverse-core.js for deterministic testing. The server serves `miniverse-core.js` from `path.join(publicDir, '..', 'core', 'miniverse-core.js')` (see `server.ts:660`), so the directory structure must place a `core/` sibling next to the `publicDir`.

  ```typescript
  import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  export function createTestWorld(repoName: string, teamName: string): { publicDir: string; cleanup: () => void } {
    // Structure:
    //   /tmp/nightshift-e2e-XXXXX/
    //     public/              ← publicDir (passed to MiniverseServer)
    //       <repoName>/
    //         <teamName>/
    //           world.json
    //     core/
    //       miniverse-core.js  ← symlink to lib/miniverse/core/miniverse-core.js
    const rootDir = mkdtempSync(path.join(tmpdir(), 'nightshift-e2e-'));
    const publicDir = path.join(rootDir, 'public');
    const worldDir = path.join(publicDir, repoName, teamName);
    mkdirSync(worldDir, { recursive: true });

    // Create the core/ sibling with symlink to the actual miniverse-core.js
    const coreDir = path.join(rootDir, 'core');
    mkdirSync(coreDir, { recursive: true });
    const thisFile = fileURLToPath(import.meta.url);
    const repoRoot = path.resolve(path.dirname(thisFile), '..', '..');
    const actualCorePath = path.join(repoRoot, 'lib', 'miniverse', 'core', 'miniverse-core.js');
    symlinkSync(actualCorePath, path.join(coreDir, 'miniverse-core.js'));

    // Write minimal test world
    writeFileSync(path.join(worldDir, 'world.json'), JSON.stringify({
      gridCols: 10,
      gridRows: 8,
      floor: Array.from({ length: 8 }, () => Array(10).fill('floor')),
      tiles: {},
      props: [],
      citizens: [
        { agentId: 'ns-test-producer', name: 'Producer', sprite: 'dexter', position: { x: 2, y: 3 }, type: 'agent' },
        { agentId: 'ns-test-planner', name: 'Planner', sprite: 'morty', position: { x: 4, y: 3 }, type: 'agent' },
        { agentId: 'ns-test-coder', name: 'Coder', sprite: 'nova', position: { x: 6, y: 3 }, type: 'agent' },
      ],
    }));

    return {
      publicDir,
      cleanup: () => { rmSync(rootDir, { recursive: true, force: true }); },
    };
  }
  ```

  **Usage in tests**: The `publicDir` is passed to `startTestServer(publicDir)`, and the `cleanup` function is called in `afterAll`. Playwright tests navigate to `baseUrl + '?world=test-repo/test-team&debug=true'` (the `debug=true` enables console log instrumentation from Phase 1).

- **Why**: The miniverse server resolves the core bundle at `publicDir/../core/miniverse-core.js`. Without this directory structure, the frontend's `<script type="module">` import of `/miniverse-core.js` returns 404 and the entire frontend crashes — no WebSocket, no status panel, no tests. The symlink avoids duplicating the 778-line bundle into temp directories.
- **Dependencies**: steps 4, 5

#### 9. Write the citizen test suite

- **File**: `tests/e2e/citizens.test.ts`
- **Action**: Write the following test cases using Playwright's `test` and `expect`:

  **Test 1: "citizens appear in status panel after heartbeat"**
  - Start test server with test world (`startTestServer(publicDir)`)
  - Open page at `baseUrl?world=test-repo/test-team&debug=true`
  - Wait for `[nightshift:ws:connected]` console log
  - Send 3 heartbeats (producer=idle, planner=working, coder=thinking)
  - Assert: `#status-panel` contains 3 `.agent-card` elements
  - Assert: each card shows correct name and state text

  **Test 2: "citizen spawn events are logged to console"**
  - Start test server, set up console log collector for `[nightshift:citizen:spawn]`
  - Open page, wait for WS connected
  - Send heartbeat for `ns-test-producer` with state `idle`
  - Wait for spawn log to appear (with timeout)
  - Parse the JSON payload and assert: `agentId === 'ns-test-producer'`, `state === 'idle'`

  **Test 3: "state change events are logged to console"**
  - Start test server, open page, wait for WS connected
  - Send heartbeat: producer state=`idle`
  - Wait for spawn log
  - Set up console log collector for `[nightshift:citizen:state]`
  - Send heartbeat: producer state=`working`, task=`Using Bash`
  - Wait for state change log
  - Parse payload and assert: `from === 'idle'`, `to === 'working'`, `task === 'Using Bash'`

  **Test 4: "status panel updates on state change"**
  - Start test server, open page
  - Send heartbeat: producer state=`idle`
  - Assert: agent card shows "Idle"
  - Send heartbeat: producer state=`working`, task=`Reading files`
  - Assert: agent card shows "Working" and task text "Reading files"
  - Send heartbeat: producer state=`thinking`
  - Assert: agent card shows "Thinking"

  **Test 5: "multiple agents render independently"**
  - Start test server, open page
  - Send heartbeats for 3 different agents with different states
  - Assert: 3 agent cards exist with correct individual states
  - Change one agent's state
  - Assert: only that agent's card changed, others unchanged

  **Test 6: "canvas renders without errors"**
  - Start test server, open page
  - Collect all `console.error` messages
  - Wait for world loaded log
  - Send heartbeats
  - Wait 2 seconds for rendering
  - Assert: no console errors occurred
  - Assert: canvas element exists inside `#canvas-container`

  Each test should use `test.beforeAll` / `test.afterAll` to start/stop the server (with `createTestWorld` and `cleanup`), and `test.beforeEach` to navigate to a fresh page at `baseUrl + '?world=test-repo/test-team&debug=true'`.

- **Why**: These tests cover all the requirements: spawn verification (tests 1-2), state change verification (tests 3-4), multi-agent independence (test 5), and basic canvas health (test 6). They use both console log capture (for canvas-side events) and DOM queries (for status panel assertions).
- **Dependencies**: steps 1-3, 8

## Testing Strategy

### Running e2e tests
```bash
# Install Playwright browsers (one-time)
bunx playwright install chromium

# Run e2e tests
bun run test:e2e

# Run with headed browser (for debugging)
bunx playwright test --headed

# Run a specific test
bunx playwright test citizens.test.ts
```

### Unit test regression
Run `bun test` to verify no existing unit tests break. The changes to `frontend.ts` (console logs) have no impact on server logic.

### Typecheck
Run `bun run typecheck` to verify TypeScript compilation is clean after all changes.

### Manual verification
1. Run `bunx nightshift start --team dev` in a test repo
2. Open the miniverse URL in browser, appending `?debug=true` to the URL
3. Open browser DevTools console
4. Verify `[nightshift:citizen:spawn]` logs appear for each agent
5. Trigger agent activity and verify `[nightshift:citizen:state]` logs appear
6. Remove `?debug=true` from URL and verify no console logs appear (production behavior)

## Assumptions

1. **Random high ports work reliably** — The test helper uses `14000 + Math.floor(Math.random() * 50000)` for port selection. The server's `start()` method auto-increments on EADDRINUSE, so collisions resolve naturally.

2. **The miniverse-core.js bundled module loads in headless Chromium** — The module uses standard Canvas 2D API which is fully supported in headless Chromium. No WebGL or GPU features are required.

3. **World config via publicDir with correct directory structure** — The server resolves `miniverse-core.js` at `path.join(publicDir, '..', 'core', 'miniverse-core.js')` (server.ts:660). The test helper creates a `rootDir/public/` as `publicDir` and a `rootDir/core/` sibling with a symlink to the actual bundle. The `/api/world` endpoint scans `publicDir` for repo/team directories containing `world.json`.

4. **Console log format stability** — Tests depend on the `[nightshift:...]` log prefix format, gated behind `?debug=true`. This is intentional — these logs are part of the testing contract. The `debug` URL parameter ensures they don't fire in normal usage.

5. **WebSocket message timing** — There's a small delay between sending a heartbeat and the frontend receiving the WebSocket broadcast. Tests should use Playwright's `waitForFunction` or poll-based assertions with timeouts rather than fixed `sleep()` calls.

6. **Sprite image 404s are handled gracefully** — Tests will trigger 404s for sprite sheet images since the test world doesn't include them. Use Playwright's `page.route('**/*.png', route => route.fulfill({ body: Buffer.alloc(0), contentType: 'image/png' }))` in test setup to intercept and stub all PNG requests with empty responses. This prevents uncaught image load errors from breaking the WebSocket connection.

## Risks & Mitigations

- **Risk**: Sprite/asset 404s cause the miniverse-core.js to throw uncaught errors, breaking the WebSocket connection
  - **Mitigation**: Use `page.route('**/*.png', ...)` in Playwright to intercept and stub all PNG requests. Test 6 also explicitly checks for console errors. If stubbing isn't enough, create minimal 1x1 pixel placeholder PNGs in the test world's `world_assets/` directory.

- **Risk**: Tests are flaky due to WebSocket timing — heartbeat sent before frontend's WS connects
  - **Mitigation**: Always wait for the `[nightshift:ws:connected]` console log before sending any heartbeats. This is why step 2 adds that log.

- **Risk**: Playwright installation bloats CI time and disk usage
  - **Mitigation**: Only install Chromium (not Firefox/WebKit). The `playwright install chromium` command downloads ~150MB. This is standard for projects with browser tests.

- **Risk**: Symlink in test helper doesn't work on all platforms (e.g., Windows without developer mode)
  - **Mitigation**: Nightshift currently only supports macOS/Linux (requires tmux). If cross-platform support is added later, replace `symlinkSync` with `copyFileSync` as a fallback.

## Revision Notes

Revised to address reviewer feedback from @ns-dev-reviewer:

1. **CRITICAL — miniverse-core.js loading (fixed)**: Restructured `createTestWorld()` to create a `rootDir/public/` + `rootDir/core/` directory layout. The `core/` directory contains a symlink to the actual `lib/miniverse/core/miniverse-core.js`. This matches the server's resolution path at `server.ts:660`: `path.join(publicDir, '..', 'core', 'miniverse-core.js')`. The function now returns `{ publicDir, cleanup }` instead of a bare string.

2. **WARNING — publicDir wiring (fixed)**: `startTestServer()` now accepts a `publicDir` parameter and passes it to `MiniverseServer({ port, publicDir })`. Tests call `startTestServer(publicDir)` with the value from `createTestWorld()`.

3. **WARNING — console.log in production (fixed)**: All console.log instrumentation is now gated behind a `const DEBUG = new URLSearchParams(location.search).has('debug')` flag. Logs only fire when the URL includes `?debug=true`. Tests navigate to `baseUrl + '?world=...&debug=true'`. Normal users see no console output.

4. **SUGGESTION — port 0 semantics (addressed)**: Replaced `port: 0` with `port: 14000 + Math.floor(Math.random() * 50000)` to avoid the wasteful increment-from-1 behavior.

5. **SUGGESTION — sprite 404 handling (addressed)**: Added Playwright `page.route('**/*.png', ...)` stub approach to Assumption 6, replacing the vague "add placeholder PNGs" mitigation.

6. **SUGGESTION — TDD traceability (addressed)**: Added "Tests covered by Phase 1 instrumentation" section at the top of Phase 1, linking each step to the specific tests in Phase 3 that depend on it.
