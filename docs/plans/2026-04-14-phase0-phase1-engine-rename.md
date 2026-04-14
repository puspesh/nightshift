# Phase 0 + Phase 1: Engine Source & Rename Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the vendored `miniverse-core.js` bundle with upstream source + build pipeline, then sweep-rename Miniverse → Agentville across the entire codebase.

**Architecture:** Copy upstream `packages/core/src/` into `lib/agentville/core/src/`, add a Vite build step to compile it into `agentville-core.js`, rename all server/integration code from Miniverse to Agentville. No behavior changes — purely build + naming.

**Tech Stack:** Vite (build engine source), TypeScript, Node built-in test runner

---

## Baseline

- **Build:** `bun run build` passes (tsc + asset copy)
- **Tests:** 177/182 pass (5 worktree tests fail due to environment, unrelated)
- **Existing vendored bundle:** `lib/miniverse/core/miniverse-core.js` (2,399 lines minified)
- **Upstream source:** `github.com/ianscott313/miniverse` → `packages/core/src/` (TypeScript, Vite build)

---

### Task 1: Copy upstream engine source into repo

**Files:**
- Create: `lib/agentville/core/src/` (entire directory tree from upstream)
- Create: `lib/agentville/core/vite.config.ts`
- Create: `lib/agentville/core/tsconfig.json`

**Step 1: Copy upstream core source files**

Copy the following from `/tmp/miniverse-check/packages/core/` into `lib/agentville/core/`:
- `src/` directory (all subdirs: citizens, editor, effects, objects, props, renderer, scene, signal, sprites, plus index.ts, protocol.ts)
- `vite.config.ts`
- `tsconfig.json`

Do NOT copy: `package.json`, `README.md`, `dist/`, `node_modules/`

```bash
cp -R /tmp/miniverse-check/packages/core/src lib/agentville/core/
cp /tmp/miniverse-check/packages/core/vite.config.ts lib/agentville/core/
cp /tmp/miniverse-check/packages/core/tsconfig.json lib/agentville/core/
```

**Step 2: Update vite.config.ts for our repo layout**

The upstream config uses `vite-plugin-dts` for type declarations. Update it to:
- Output to `lib/agentville/core/dist/`
- Use `fileName: 'agentville-core'` (not 'index')
- Use library name `'Agentville'` (not `'Miniverse'`)
- Remove `dts` plugin (we'll maintain our own `.d.ts` file)
- Add `emptyOutDir: false`

Target vite.config.ts:
```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Agentville',
      formats: ['es'],
      fileName: 'agentville-core',
    },
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
  },
});
```

**Step 3: Update core tsconfig.json**

The upstream tsconfig should work, but verify it doesn't conflict with root tsconfig. The core source is a standalone Vite build — it should NOT be included in the root `tsc` compilation. Verify that `lib/agentville/core/src/**` is not matched by root tsconfig.json's `include: ["lib/**/*.ts"]`.

Since root tsconfig includes `lib/**/*.ts`, the engine source WILL be picked up by tsc which will fail (it's browser code, no DOM types in root tsconfig). Fix: add an exclude to root `tsconfig.json` and `tsconfig.build.json`:

```json
"exclude": ["lib/agentville/core/src/**"]
```

**Step 4: Commit**

```bash
git add lib/agentville/core/src/ lib/agentville/core/vite.config.ts lib/agentville/core/tsconfig.json
git commit -m "chore: copy upstream miniverse core engine source into lib/agentville/core"
```

---

### Task 2: Rename Miniverse → Agentville in engine source

**Files:**
- Modify: `lib/agentville/core/src/index.ts` — rename class `Miniverse` → `Agentville`, `MiniverseConfig` → `AgentvilleConfig`, `MiniverseEvent` → `AgentvilleEvent`

**Step 1: Rename in source**

In `lib/agentville/core/src/index.ts`:
- `export class Miniverse` → `export class Agentville`
- `interface MiniverseConfig` → `interface AgentvilleConfig`
- `type MiniverseEvent` → `type AgentvilleEvent`
- All internal references to `MiniverseConfig` → `AgentvilleConfig`
- All internal references to `MiniverseEvent` → `AgentvilleEvent`

Also add backward-compat re-export at the bottom:
```typescript
/** @deprecated Use Agentville */
export { Agentville as Miniverse };
/** @deprecated Use AgentvilleConfig */
export type { AgentvilleConfig as MiniverseConfig };
```

**Step 2: Verify no other files in core/src reference "Miniverse"**

Search all files in `lib/agentville/core/src/` for "Miniverse" — only `index.ts` should have it.

**Step 3: Commit**

```bash
git add lib/agentville/core/src/
git commit -m "refactor: rename Miniverse → Agentville in engine source"
```

---

### Task 3: Add Vite build pipeline for engine

**Files:**
- Modify: `package.json` — add `build:core` script, add vite dev dependency, update `build` script
- Modify: `.gitignore` — add `lib/agentville/core/dist/`

**Step 1: Install Vite as dev dependency**

```bash
bun add -d vite
```

**Step 2: Add build:core script to package.json**

Add to `scripts`:
```json
"build:core": "vite build --config lib/agentville/core/vite.config.ts"
```

Update `build` script to run core build first, then tsc, then copy:
```json
"build": "vite build --config lib/agentville/core/vite.config.ts && tsc -p tsconfig.build.json && cp -r lib/agentville/core/dist/agentville-core.js dist/lib/agentville/core/ && cp -r lib/miniverse/core/miniverse-core.d.ts dist/lib/miniverse/core/ && cp -r presets dist/ && cp -r worlds dist/ && cp -r defaults dist/ && cp -r bin dist/"
```

Note: We keep copying the old vendored `.d.ts` for now — it will be updated in Task 5.

**Step 3: Add engine dist to .gitignore**

Append to `.gitignore`:
```
lib/agentville/core/dist/
```

**Step 4: Build the engine and verify output**

Run: `bun run build:core`

Expected: Creates `lib/agentville/core/dist/agentville-core.js` — an ES module bundle exporting `Agentville`, `PropSystem`, `createStandardSpriteConfig`, etc.

Verify exports match the old vendored bundle:
```bash
grep "export {" lib/agentville/core/dist/agentville-core.js
```

Should include: `Agentville` (new name), `PropSystem`, `createStandardSpriteConfig`, `Citizen`, `CitizenLayer`, `Signal`, etc.

**Step 5: Commit**

```bash
git add package.json .gitignore lib/agentville/core/vite.config.ts
git commit -m "build: add Vite pipeline for agentville core engine"
```

---

### Task 4: Verify full build passes with engine source

**Files:**
- Modify: `tsconfig.json` — add exclude for engine source
- Modify: `tsconfig.build.json` — add exclude for engine source

**Step 1: Add excludes to tsconfig files**

Both `tsconfig.json` and `tsconfig.build.json` need:
```json
"exclude": ["lib/agentville/core/**"]
```

For `tsconfig.build.json` which extends base, add:
```json
"exclude": ["tests/**/*.ts", "lib/agentville/core/**"]
```

**Step 2: Run full build**

Run: `bun run build`
Expected: SUCCESS — vite builds core, tsc compiles server/integration, assets copied

**Step 3: Run tests**

Run: `bun run test`
Expected: Same 177/182 pass rate as baseline (no regressions)

**Step 4: Commit**

```bash
git add tsconfig.json tsconfig.build.json
git commit -m "build: exclude agentville core source from tsc compilation"
```

---

### Task 5: Update type definitions

**Files:**
- Create: `lib/agentville/core/agentville-core.d.ts` — copy of old `.d.ts` with renames
- Modify: build script in `package.json` — copy new `.d.ts`

**Step 1: Create renamed type definitions**

Copy `lib/miniverse/core/miniverse-core.d.ts` → `lib/agentville/core/agentville-core.d.ts`

Then rename in the new file:
- `class Miniverse` → `class Agentville`
- `interface MiniverseConfig` → `interface AgentvilleConfig`
- `type MiniverseEvent` → `type AgentvilleEvent`
- Add deprecated aliases at the bottom:
```typescript
/** @deprecated Use Agentville */
export { Agentville as Miniverse };
/** @deprecated Use AgentvilleConfig */
export type { AgentvilleConfig as MiniverseConfig };
```

**Step 2: Update build script to copy new .d.ts**

In `package.json` build script, ensure the new `.d.ts` gets copied to dist alongside the built JS.

Update build copy step: instead of `cp -r lib/miniverse/core/miniverse-core.d.ts dist/lib/miniverse/core/`, add:
```
mkdir -p dist/lib/agentville/core && cp lib/agentville/core/agentville-core.d.ts dist/lib/agentville/core/
```

**Step 3: Run full build**

Run: `bun run build`
Expected: SUCCESS — dist now has both old miniverse files and new agentville files

**Step 4: Commit**

```bash
git add lib/agentville/core/agentville-core.d.ts package.json
git commit -m "chore: add renamed agentville-core.d.ts type definitions"
```

---

### Task 6: Rename server — files and directories

**Files:**
- Move: `lib/miniverse/server/` → `lib/agentville/server/`
- Keep: `lib/miniverse/core/` (old vendored files stay until Task 12)
- Modify: All files that import from `lib/miniverse/server/`

**Step 1: Move server directory**

```bash
mkdir -p lib/agentville/server
git mv lib/miniverse/server/server.ts lib/agentville/server/server.ts
git mv lib/miniverse/server/store.ts lib/agentville/server/store.ts
git mv lib/miniverse/server/events.ts lib/agentville/server/events.ts
git mv lib/miniverse/server/frontend.ts lib/agentville/server/frontend.ts
git mv lib/miniverse/server/cli.ts lib/agentville/server/cli.ts
git mv lib/miniverse/server/index.ts lib/agentville/server/index.ts
```

**Step 2: Update internal imports within moved server files**

These files import from each other using relative paths (`./store.js`, `./events.js`, etc.) — these should NOT need changes since they moved together.

Verify: grep for any imports referencing `miniverse` within the moved files:
```bash
grep -rn "miniverse" lib/agentville/server/
```

Expected references to fix:
- `server.ts` line 658-660: references to `/miniverse-core.js` URL path → keep for now (frontend serves this)
- `server.ts` line 762: `miniverse: true` in API response → change to `agentville: true`
- `frontend.ts` line 3: comment `@miniverse/core` → `@agentville/core`
- `frontend.ts` line 200: import from `/miniverse-core.js` → keep for now (will update in Task 9)
- `cli.ts` lines 44, 51: "Miniverse server" → "Agentville server", banner text
- `cli.ts` line 68, 74: "Miniverse" → "Agentville"
- `server.ts` lines 360, 361, 392, 393, 953, 955: `@miniverse/generate` → keep (external package name)

**Step 3: Fix imports in integration layer**

- `lib/visualize.ts` line 49: path `join(__dirname, 'miniverse', 'server', 'cli.js')` → `join(__dirname, 'agentville', 'server', 'cli.js')`
- `lib/start.ts` line 132: `join(__dirname, 'miniverse', 'core')` → `join(__dirname, 'agentville', 'core')`

**Step 4: Run build and tests**

Run: `bun run build && bun run test`
Expected: Build passes, tests pass (177/182)

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: move server files from lib/miniverse/server to lib/agentville/server"
```

---

### Task 7: Rename server classes and types

**Files:**
- Modify: `lib/agentville/server/server.ts` — `MiniverseServer` → `AgentvilleServer`, `MiniverseServerConfig` → `AgentvilleServerConfig`
- Modify: `lib/agentville/server/index.ts` — update exports
- Modify: `lib/agentville/server/cli.ts` — update imports + console output
- Modify: `lib/visualize.ts` — this file imports from `./miniverse/server/index.js`, update import path

**Step 1: Rename in server.ts**

- Line 10: `MiniverseServerConfig` → `AgentvilleServerConfig`
- Line 17: `class MiniverseServer` → `class AgentvilleServer`
- Line 34: `config: MiniverseServerConfig` → `config: AgentvilleServerConfig`
- Line 762: `miniverse: true` → `agentville: true`

**Step 2: Rename in index.ts**

```typescript
export { AgentvilleServer } from './server.js';
export type { AgentvilleServerConfig } from './server.js';
export { AgentStore } from './store.js';
export type { AgentState } from './store.js';
export { EventLog } from './events.js';
export type { WorldEvent } from './events.js';
```

**Step 3: Rename in cli.ts**

- Line 2: `import { MiniverseServer }` → `import { AgentvilleServer }`
- Line 36: `new MiniverseServer(...)` → `new AgentvilleServer(...)`
- Line 44: `Miniverse server ready` → `Agentville server ready`
- Line 51: `M I N I V E R S E` → `A G E N T V I L L E` (adjust padding — 11 chars vs 11 chars, same width)
- Line 68: `Failed to start Miniverse server` → `Failed to start Agentville server`
- Line 74: `Shutting down Miniverse` → `Shutting down Agentville`

**Step 4: Rename in frontend.ts**

- Line 3: comment `@miniverse/core` → `@agentville/core` (or just "agentville core engine")
- Line 292: comment `start miniverse` → `start agentville`

**Step 5: Update visualize.ts import path**

The file currently imports from `./miniverse/server/index.js` (implicitly through the file layout). After moving files, the import in `lib/visualize.ts` needs updating.

Actually — check: `lib/visualize.ts` doesn't directly import from the server index. It spawns the CLI as a child process via path: `join(__dirname, 'miniverse', 'server', 'cli.js')`. This was already updated in Task 6. No additional import changes needed here.

**Step 6: Run build and tests**

Run: `bun run build && bun run test`
Expected: Build passes, tests pass

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename MiniverseServer → AgentvilleServer"
```

---

### Task 8: Rename integration layer (visualize.ts)

**Files:**
- Rename: `lib/visualize.ts` → `lib/agentville.ts`
- Modify: all files that import from `lib/visualize.ts`
- Rename: `tests/visualize.test.ts` → `tests/agentville.test.ts`

**Step 1: Identify all importers of visualize.ts**

Search for imports of `visualize`:
```bash
grep -rn "visualize" lib/ tests/ bin/
```

Expected importers:
- `lib/start.ts` — imports `startServer`, `waitForServer`, `registerAgents`, `stopServer`, `isServerRunning` etc.
- `tests/visualize.test.ts` — imports `getPidFilePath`, `getPortFilePath`, `isServerRunning`

**Step 2: Rename exports in visualize.ts → agentville.ts**

Rename the file:
```bash
git mv lib/visualize.ts lib/agentville.ts
```

In the new `lib/agentville.ts`:
- Rename functions for clarity:
  - `startServer` → `startAgentville`
  - `stopServer` → `stopAgentville`
  - `waitForServer` → `waitForAgentville`
  - `registerAgents` → `registerAgentvilleAgents`
  - `isServerRunning` → `isAgentvilleRunning`
- Update PID/port/log file paths:
  - `miniverse.pid` → `agentville.pid`
  - `miniverse.port` → `agentville.port`
  - `miniverse.log` → `agentville.log`
- Update comments: "miniverse" → "agentville"
- Update CLI path: `join(__dirname, 'agentville', 'server', 'cli.js')` (already done in Task 6)
- Update console.warn message: `miniverse server` → `agentville server`

**Step 3: Update lib/start.ts imports**

Change import path and function names:
```typescript
import { startAgentville, waitForAgentville, registerAgentvilleAgents, stopAgentville } from './agentville.js';
```

Update all call sites in `setupVisualization()`:
- `stopServer()` → `stopAgentville()`
- `startServer(vizPort, miniverseDir)` → `startAgentville(vizPort, agentvilleDir)`
- `waitForServer(result.url)` → `waitForAgentville(result.url)`
- `registerAgents(result.url, ...)` → `registerAgentvilleAgents(result.url, ...)`

Also rename the local variable:
- `miniverseDir` → `agentvilleDir` (line 105)
- Update path: `join(homedir(), '.nightshift', 'miniverse')` → keep as-is for now (runtime path change deferred to Agentville Phase 2 with migration tooling)

Actually, **do NOT change runtime paths yet**. The spec says: "Do NOT change world data paths yet — data stays at `~/.nightshift/miniverse/{repo}/{team}/` until Phase 2 migration." So keep the directory paths pointing to `~/.nightshift/miniverse/` but rename the variable for code clarity.

Wait — but the PID/port files should change since nothing reads them except our code. Let's rename PID/port/log files but keep data paths:
- `~/.nightshift/miniverse.pid` → `~/.nightshift/agentville.pid`
- `~/.nightshift/miniverse.port` → `~/.nightshift/agentville.port`
- `~/.nightshift/miniverse.log` → `~/.nightshift/agentville.log`
- `~/.nightshift/miniverse/{repo}/{team}/` → **keep as-is** (data path, needs migration)

**Step 4: Rename test file**

```bash
git mv tests/visualize.test.ts tests/agentville.test.ts
```

Update imports in `tests/agentville.test.ts`:
```typescript
import { getPidFilePath, getPortFilePath, isAgentvilleRunning } from '../lib/agentville.js';
```

Update test assertions:
- `p.includes('.nightshift/miniverse.pid')` → `p.includes('.nightshift/agentville.pid')`
- `p.includes('.nightshift/miniverse.port')` → `p.includes('.nightshift/agentville.port')`
- `isServerRunning()` → `isAgentvilleRunning()`

**Step 5: Update any other importers**

Check `lib/start.ts` for `isServerRunning` usage — update if present.

Check `bin/nightshift.ts` for any visualize imports.

**Step 6: Run build and tests**

Run: `bun run build && bun run test`
Expected: Build passes, tests pass

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename visualize.ts → agentville.ts, rename integration functions"
```

---

### Task 9: Update frontend to use new engine bundle

**Files:**
- Modify: `lib/agentville/server/server.ts` — serve `agentville-core.js` instead of `miniverse-core.js`
- Modify: `lib/agentville/server/frontend.ts` — import from new bundle name
- Modify: `lib/start.ts` — copy new bundle instead of old one
- Modify: `package.json` — update build copy path

**Step 1: Update server.ts to serve new bundle**

In `lib/agentville/server/server.ts`:
- Line ~658: Change URL path check from `/miniverse-core.js` to `/agentville-core.js`
- Line ~660: Change file path from `miniverse-core.js` to `agentville-core.js`

Also keep backward-compat: serve `/miniverse-core.js` as an alias to the same file (or just update both).

Actually, simpler: serve BOTH paths pointing to the same file. The old frontend references `/miniverse-core.js`, new code will use `/agentville-core.js`.

```typescript
if (req.method === 'GET' && (url.pathname === '/agentville-core.js' || url.pathname === '/miniverse-core.js')) {
  const corePath = path.join(this.publicDir ?? '.', '..', 'core', 'agentville-core.js');
  // ...
}
```

**Step 2: Update frontend.ts import**

Line 200:
```javascript
import { Agentville, PropSystem, createStandardSpriteConfig } from '/agentville-core.js';
```

Line ~387:
```javascript
const mv = new Agentville({
```

**Step 3: Update lib/start.ts core copy**

Line ~132-136: Update to copy new engine bundle:
```typescript
const coreDir = join(__dirname, 'agentville', 'core');
mkdirSync(join(agentvilleDir, '..', 'core'), { recursive: true });
if (existsSync(join(coreDir, 'dist', 'agentville-core.js'))) {
  // copy agentville-core.js
}
```

Wait — the built output goes to `lib/agentville/core/dist/agentville-core.js` but after tsc compilation it'll be at `dist/lib/agentville/core/dist/agentville-core.js`... That's wrong. The Vite output isn't TypeScript so tsc won't copy it. The `build` script copies it manually.

Current build script copies `lib/miniverse/core` → `dist/lib/miniverse/`. We need to update this to copy the Vite-built JS to the right place.

**Step 4: Update package.json build script**

The build script needs to:
1. Build engine with Vite → `lib/agentville/core/dist/agentville-core.js`
2. Compile TypeScript → `dist/`
3. Copy engine bundle: `mkdir -p dist/lib/agentville/core && cp lib/agentville/core/dist/agentville-core.js dist/lib/agentville/core/`
4. Copy type definitions: `cp lib/agentville/core/agentville-core.d.ts dist/lib/agentville/core/`
5. Keep copying old miniverse core for backward compat during transition: `cp -r lib/miniverse/core dist/lib/miniverse/`
6. Copy other assets

Updated build script:
```json
"build": "vite build --config lib/agentville/core/vite.config.ts && tsc -p tsconfig.build.json && mkdir -p dist/lib/agentville/core && cp lib/agentville/core/dist/agentville-core.js dist/lib/agentville/core/ && cp lib/agentville/core/agentville-core.d.ts dist/lib/agentville/core/ && cp -r lib/miniverse/core dist/lib/miniverse/ && cp -r presets dist/ && cp -r worlds dist/ && cp -r defaults dist/ && cp -r bin dist/"
```

**Step 5: Run build and verify**

Run: `bun run build`
Verify: `dist/lib/agentville/core/agentville-core.js` exists and exports `Agentville`

**Step 6: Run tests**

Run: `bun run test`
Expected: All pass

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: serve agentville-core.js from engine, update frontend import"
```

---

### Task 10: Rename world assets directory

**Files:**
- Move: `worlds/nightshift/` → `worlds/agentville/`
- Modify: `lib/start.ts` — update base world path
- Modify: `lib/agentville/server/server.ts` — update default world serving path if needed

**Step 1: Move world directory**

```bash
git mv worlds/nightshift worlds/agentville
```

**Step 2: Update lib/start.ts**

Line ~109: Change base world path:
```typescript
const baseWorldDir = join(__dirname, '..', 'worlds', 'agentville');
```

**Step 3: Verify server world serving**

The server serves world assets at `/worlds/*` using the publicDir config. The path `worlds/nightshift/` appears in how the frontend loads assets. Check `frontend.ts` for hardcoded `worlds/nightshift` references.

In the frontend JS, the `world` config property is passed to `new Agentville({ world: currentTeam })` which becomes the worldBasePath prefix. This is dynamic (comes from server state), not hardcoded. No change needed in frontend.

**Step 4: Run build and tests**

Run: `bun run build && bun run test`
Expected: All pass

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename worlds/nightshift → worlds/agentville"
```

---

### Task 11: Update remaining code references

**Files:**
- Modify: `lib/spawn.ts` — update "miniverse citizens" doc comment
- Modify: `lib/world-config.ts` — update "miniverse world configuration" doc comment
- Modify: `lib/start.ts` — rename `miniverseDir` variable, update core copy path, update warning messages

**Step 1: Update comments in spawn.ts**

Search for "miniverse" in `lib/spawn.ts` and replace with "agentville" in comments only.

**Step 2: Update comments in world-config.ts**

Search for "miniverse" in `lib/world-config.ts` and replace with "agentville" in comments only.

**Step 3: Update lib/start.ts variable names and paths**

- Rename `miniverseDir` → keep as variable name but update comment
- Actually rename for consistency:
  - `miniverseDir` → `vizDir` or keep as is (it's the runtime data path which stays at `~/.nightshift/miniverse/` for now)
  - Update core copy path to use new agentville core location
  - Update warning messages: "Visualization" → "Agentville" where appropriate

**Step 4: Full codebase sweep**

Run: `grep -rn "miniverse\|Miniverse" lib/ tests/ bin/ --include="*.ts" --include="*.sh"`

Every remaining reference should be one of:
1. Runtime data paths (`~/.nightshift/miniverse/`) — keep for now (Phase 2 migration)
2. `@miniverse/generate` — external package name, keep
3. Old vendored files in `lib/miniverse/core/` — will be removed in Task 12

Flag and document any unexpected references.

**Step 5: Run build and tests**

Run: `bun run build && bun run test`
Expected: All pass

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: update remaining miniverse references in comments and variables"
```

---

### Task 12: Delete vendored bundle and clean up

**Files:**
- Delete: `lib/miniverse/core/miniverse-core.js` (2,399 line vendored bundle)
- Delete: `lib/miniverse/core/miniverse-core.d.ts` (old type definitions)
- Delete: `lib/miniverse/` directory (should be empty after server moved in Task 6)
- Modify: `package.json` build script — remove old miniverse copy step
- Modify: `.gitignore` — no longer need to track old path

**Step 1: Verify old miniverse directory contents**

```bash
ls -la lib/miniverse/
ls -la lib/miniverse/core/
```

Expected: Only `core/miniverse-core.js` and `core/miniverse-core.d.ts` remain (server moved in Task 6).

**Step 2: Delete old files**

```bash
git rm lib/miniverse/core/miniverse-core.js
git rm lib/miniverse/core/miniverse-core.d.ts
```

Remove the now-empty directory:
```bash
rmdir lib/miniverse/core lib/miniverse 2>/dev/null || true
```

**Step 3: Update package.json build script**

Remove the `cp -r lib/miniverse/core dist/lib/miniverse/` step from the build script.

Final build script:
```json
"build": "vite build --config lib/agentville/core/vite.config.ts && tsc -p tsconfig.build.json && mkdir -p dist/lib/agentville/core && cp lib/agentville/core/dist/agentville-core.js dist/lib/agentville/core/ && cp lib/agentville/core/agentville-core.d.ts dist/lib/agentville/core/ && cp -r presets dist/ && cp -r worlds dist/ && cp -r defaults dist/ && cp -r bin dist/"
```

**Step 4: Update server.ts core path**

In `lib/agentville/server/server.ts`, the core JS serving path (`miniverse-core.js` fallback) can now be removed — only serve `/agentville-core.js`:

```typescript
if (req.method === 'GET' && url.pathname === '/agentville-core.js') {
  const corePath = path.join(this.publicDir ?? '.', '..', 'core', 'agentville-core.js');
```

**Step 5: Run build and tests**

Run: `bun run build && bun run test`
Expected: Build passes, tests pass. No regressions.

Verify: `dist/lib/miniverse/` no longer exists. `dist/lib/agentville/core/agentville-core.js` exists and is functional.

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove vendored miniverse-core.js bundle, replaced by source build"
```

---

### Task 13: Update docs

**Files:**
- Modify: `docs/architecture.md` — any miniverse references
- Modify: `docs/troubleshooting.md` — any miniverse references
- Modify: `docs/customization.md` — any miniverse references

**Step 1: Search docs for miniverse references**

```bash
grep -rn "miniverse\|Miniverse" docs/ --include="*.md"
```

**Step 2: Update found references**

Replace "miniverse" → "agentville" and "Miniverse" → "Agentville" in doc files.
Do NOT update old plan files in `docs/plans/` — they're historical records.

**Step 3: Commit**

```bash
git add docs/
git commit -m "docs: update miniverse → agentville references"
```

---

### Task 14: Final verification

**Step 1: Clean build from scratch**

```bash
rm -rf dist/
bun run build
```
Expected: SUCCESS

**Step 2: Run all tests**

```bash
bun run test
```
Expected: 177/182 pass (same as baseline — 5 worktree env failures)

**Step 3: Full miniverse reference audit**

```bash
grep -rn "miniverse\|Miniverse" lib/ tests/ bin/ --include="*.ts" --include="*.sh"
```

Every remaining reference should be:
1. `@miniverse/generate` — external package name (keep)
2. Runtime data paths `~/.nightshift/miniverse/` — deferred to Phase 2 migration
3. Nothing else

**Step 4: Verify dist structure**

```bash
ls dist/lib/agentville/
ls dist/lib/agentville/core/
ls dist/lib/agentville/server/
```

Expected:
- `dist/lib/agentville/core/agentville-core.js` — built engine
- `dist/lib/agentville/core/agentville-core.d.ts` — type definitions
- `dist/lib/agentville/server/server.js` — compiled server
- `dist/lib/agentville/server/cli.js` — compiled CLI
- etc.

**Step 5: Verify no `dist/lib/miniverse/` exists**

```bash
ls dist/lib/miniverse/ 2>/dev/null && echo "ERROR: old miniverse dir still in dist" || echo "OK: clean"
```

**Step 6: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "chore: final verification — Phase 0+1 complete"
```
