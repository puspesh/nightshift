# Agentville — Product Spec

> The Sims meets Coin Master for AI agents. A gamified virtual office
> that turns "watching my agents work" into an addictive idle game.

---

## WHY

Everyone is vibe coding — engineers and non-engineers alike. They run AI agents and then... wait. "What do I do while my agents are working?" The answer: **play the game.**

The more you use AI agents for real work, the richer your Agentville gets. Any AI tool does the work; Agentville makes you come back.

## THE HOOK

"I could just close the terminal while my agents work, but my Agentville has a rooftop garden, my planner agent wears a top hat, and I just raided someone's world for 500 coins."

---

## Independence

**Agentville is a standalone product.** It works with any AI tool that can send HTTP events — not just nightshift, not just Claude Code.

- Nightshift is one integration (and the first one)
- Any AI tool, agent framework, or coding assistant can connect
- The Agentville server runs independently and accepts events from any source

This means Agentville has its own lifecycle (`agentville start/stop`), its own persistence (`~/.agentville/`), and its own install. Nightshift automatically starts/stops Agentville as part of its lifecycle, but users can also run Agentville standalone.

### Integrations

| AI Tool | How it connects | Status |
|---------|----------------|--------|
| **Claude Code** | Hook config → POST to Agentville on tool use events | [BUILT] via `POST /api/hooks/claude-code` |
| **Nightshift** | Auto-starts Agentville server, agents emit events via hooks | [BUILT] via `nightshift start` |
| **Codex** | Wrapper/plugin that POSTs on task events | [PLANNED] |

Adding a new CLI agent integration = writing an adapter that POSTs to `localhost:4321/events` with the standard event schema. The Agentville server doesn't know or care what sent the event.

---

## What's Built vs. What's New

The current codebase has a visualization system called **Miniverse** (`lib/miniverse/`). Agentville builds on top of it, adding the game layer. The rename from Miniverse to Agentville is part of the work.

### Built (current Miniverse)

- Pixel-art office world rendered at `localhost:4321` via vendored engine (`miniverse-core.js`)
- Agents rendered as animated citizens with 4 sprites (dexter, morty, nova, rio) — auto-assigned round-robin by role, not user-selectable
- Real-time agent state tracking via Claude Code hooks (`POST /api/hooks/claude-code`) and heartbeats (`POST /api/heartbeat`)
- Sub-agents tracked as independent citizens in the world (spawned on `SubagentStart`, removed on `SubagentStop`)
- WebSocket broadcasting of agent state changes to connected browsers
- Multi-repo/multi-team support — separate worlds per repo/team combo, selectable via dropdown
- Server auto-started by `nightshift start`, auto-stopped by `nightshift stop`
- PID/port stored at `~/.nightshift/miniverse.pid` / `~/.nightshift/miniverse.port`
- World layout stored per-team at `~/.nightshift/miniverse/{repo}/{team}/world.json` (rendering config: grid, tiles, props, citizens — NOT game state)
- Agent state: `idle` → `thinking` → `working` → `sleeping` (30s no heartbeat) → `offline` (1hr)
- Asset generation via `@miniverse/generate` (FAL.ai) — optional
- Frontend: single generated HTML with agent status panel, team selector, click-to-tooltip

### New (to be built)

- **Rename**: Miniverse → Agentville throughout codebase
- **Standalone lifecycle**: `agentville start/stop` CLI commands (currently only `nightshift start/stop`)
- **Unified event API**: `POST /events` with standard envelope (currently: separate `/api/heartbeat` and `/api/hooks/claude-code` endpoints with different schemas)
- **Single world per user**: Merge multi-repo/multi-team into one persistent world at `~/.agentville/world.json` (currently: separate worlds per repo/team)
- **Game state persistence**: `world.json` as game state (coins, inventory, agents, stats) with atomic writes + backup (currently: world.json is only rendering config)
- **Economy engine**: Coin earning, multipliers, random drops, streak tracking
- **Shop & purchasing**: Browser UI for buying items with coins
- **Desk assignment**: First-come-first-served with +10% earning bonus
- **Facilities & needs**: One-time purchases that add earning multipliers
- **Sub-agent stars**: Replace current "sub-agents as citizens" with star animation above parent's head
- **Agent cosmetics**: User-selectable sprites + accessories (currently: auto-assigned round-robin)
- **HUD**: Agent roster counts, coins/hr, streak display
- **World expansion**: Expandable rooms and floors
- **Idle timeout**: 5-minute heartbeat timeout to mark idle (currently: 30 seconds to sleeping)

---

## Architecture: How It All Connects

```
┌─────────────────────────────────────────────────────────────────┐
│  CLI Agents (Claude Code, Codex, etc.)                          │
│  Running standalone or via nightshift                            │
│                                                                 │
│  On every tool use / session event:                             │
│    Hook / adapter fires                                          │
│      → HTTP POST to Agentville server (localhost:4321)           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Agentville Server (standalone or auto-started by nightshift)   │
│  Always running while agents run — no browser needed            │
│                                                                 │
│  Receives events → processes game logic:                        │
│    work:completed → calculate coins (base × multipliers)        │
│                   → roll for random drops                       │
│                   → update streak counter                       │
│                   → persist to world.json                       │
│    agent:heartbeat → update agent state (working/idle/error)    │
│    agent:spawned → track sub-agent count per agent              │
│                                                                 │
│  Persists world.json after every coin-earning event             │
│  Syncs to cloud on interval (if cloud enabled)                  │
│                                                                 │
│  WebSocket → broadcasts state to connected browsers             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼ (optional)
┌─────────────────────────────────────────────────────────────────┐
│  Browser (localhost:4321) — pure rendering client               │
│  Opens/closes freely — does NOT affect coin tracking            │
│                                                                 │
│  Connects via WebSocket → receives live state updates           │
│  Renders pixel-art world, agents, animations                    │
│  User interacts: buy items, place decorations, browse shop      │
│  Purchases sent to server → server updates world.json           │
└─────────────────────────────────────────────────────────────────┘
```

**Key point: the browser is a view, not the engine.** Close the tab, coins still accumulate. Reopen it, everything is up to date. The Agentville server is the game engine — runs standalone or auto-started by nightshift.

---

## Starting World

Every new Agentville starts with the same base setup:

- A small office room (basic walls, floor, lighting)
- 2 plain desks (first-come, first-served — buy more as you add agents)
- No facilities (all needs unmet = base earning rate)
- No decorations
- 0 coins
- A shop UI accessible from the world

The starting world is bootstrapped on first `agentville start` by writing `world.json` with 2 `desk_basic` items pre-populated in inventory (placed in the starting room at default positions).

From here, the user earns coins through agent work and upgrades everything: desks, facilities, decorations, cosmetics, room expansions. The starting world is intentionally bare — making it look good is the game.

### Desk assignment

Agents are **not pre-assigned** to desks. On first `agent:heartbeat`, the server assigns the agent to the first empty desk in the world. If no desk is available, the agent works without a desk (standing/wandering).

- **With desk:** +10% coin earning bonus (desk bonus multiplier)
- **Without desk:** base earning rate (no penalty, but missing the bonus)

This creates an incentive to buy desks early — more desks = more agents seated = more coins. Desk assignment is stored in the agent's entry in `world.json` and persists across restarts.

---

## Shared World

**One Agentville per user** — all agents across all teams and repos live in one persistent world. This replaces the current multi-repo/multi-team separate worlds.

### Agent roster & HUD

The server tracks all known agents and their live status in memory. The browser HUD displays:

- **Total agents** (registered)
- **Working** / **Idle** / **Error** counts
- **Active sub-agents** count
- **Coins per hour** (current earning rate with multipliers)
- **Streak** (consecutive days)

Agent roster is built from `world.json` agents (persisted) + live heartbeat state (in-memory). An agent that stops sending heartbeats for 5 minutes is marked idle. If ALL agents are idle, the world becomes raidable (Phase 2+).

---

## Agent Visuals

### Sub-agent stars [NEW]

When an agent spawns sub-agents (e.g., planner launching explorers), **animated stars appear above the agent's head** — one star per active sub-agent, capped at 5 visually. Stars appear on `agent:spawned`, fade on `agent:spawn-ended`. Sub-agent count is tracked in-memory only (resets on server restart — correct since sub-agents wouldn't survive a restart either).

This replaces the current behavior where sub-agents appear as independent citizens in the world.

### Activity states

| State | Visual |
|-------|--------|
| **Working** | Agent at desk, screen glowing, typing animation |
| **Working + sub-agents** | Same + N animated stars above head (capped at 5 visually) |
| **Idle** | Agent walks around, visits facilities, Zzz animation if idle for 5+ min |
| **Error** | Red exclamation mark, sparks |

---

## Facilities & Needs [NEW]

Facilities are one-time purchases that boost earning. No decay, no maintenance — build it and it's handled.

| Need | Facility Examples | Effect |
|------|------------------|--------|
| **Food** | Kitchen, cafeteria, vending machines | +earning multiplier |
| **Hydration** | Water coolers, coffee machines, juice bars | +earning multiplier |
| **Rest** | Couches, nap pods, bedrooms | +earning multiplier |
| **Comfort** | Ergonomic desks, good chairs, lighting | +earning multiplier |
| **Fun** | Recreation area, arcade machines, ping pong | +earning multiplier |

No facility = base earning (no penalty). Each adds a multiplier. All 5 met = max earning rate. Agents visit facilities when idle — purely visual/aesthetic.

---

## Dual Currency [NEW]

### Coins (Earned)

Primary currency. **Earned through agent work, never purchased.**

#### Coin earning flow

1. Agent completes work (merges PR, passes tests, etc.)
2. Hook/adapter fires → POST to Agentville server
3. Server receives `work:completed` event with event type and metadata
4. Server calculates coins:
   - Look up base rate for event type (PR merged = 100, test passed = 40, etc.)
   - Apply multipliers (agent count, desk, streak, facilities, decorations)
   - Roll for random drop (chance of bonus coins or item)
5. Server updates `world.json`: increment coins, update stats, add drop to inventory
6. Server broadcasts update via WebSocket (browser updates if open)

**This all happens server-side. No browser needed. No user action needed.**

#### Earning rates (ballpark)

| Event | Coins | Frequency |
|-------|-------|-----------|
| Issue triaged | 10 | frequent |
| Plan written | 50 | several/day |
| Review completed | 30 | several/day |
| Test suite passed | 40 | several/day |
| PR merged | 100 | few/day |
| Random drop | 10-500 | random |

**~1,000 coins per productive day** at base rate (before multipliers).

#### Multipliers

| Multiplier | Effect |
|------------|--------|
| Agent count | +10% per additional active agent |
| Desk bonus | +10% if agent is seated at a desk (no desk = base rate) |
| Streak bonus | +5% per consecutive day (caps at +50%) |
| Needs met | +10% per facility category (max +50% for all 5) |
| Decoration bonus | +1% common, +3% rare, +5% legendary (capped at +20% total) |

With all multipliers: **2-3x base rate**.

#### Spending coins

| Category | Price Range | Examples |
|----------|-------------|---------|
| **Basic desk** | 200 | Simple desk for a new agent |
| **Upgraded desk** | 500-2,000 | Dual monitors, standing desk, corner office |
| **Basic facility** | 500 | Water cooler, vending machine |
| **Premium facility** | 2,000-5,000 | Full kitchen, game room, nap pod suite |
| **Common decoration** | 100-500 | Plants, posters, lamps, rugs |
| **Rare decoration** | 1,000-5,000 | Aquarium, arcade machine, trophy case |
| **Legendary decoration** | 10,000-25,000 | Rooftop garden, fountain, hologram display |
| **Cosmetics (sprite catalog)** | 200-2,000 | Agent hats, outfits, accessories (~15 options) |
| **Consumable boosts** | 50-200 | Temporary earning boost, energy drink, focus potion |
| **Office expansion** | 5,000-15,000 | New room, new floor, building wing |

#### Spending flow

1. User opens Agentville in browser (localhost:4321)
2. Browses shop, selects item, clicks buy
3. Browser sends purchase request to Agentville server
4. Server validates: enough coins? Item available?
5. Server deducts coins, adds item to inventory, updates `world.json`
6. Server broadcasts update → browser renders the new item

#### Coin sinks

- Tiered pricing (common → rare → legendary)
- Consumables (one-time use, must repurchase)
- Shields (recurring cost, Phase 2+)
- Raids steal coins (Phase 2+)

### Cash (Purchased) — Phase 2+

Premium currency. **Purchased with real money only.** Not available in Phase 1 — defined now so the economy accounts for it.

| Category | Examples |
|----------|---------|
| **Premium decorations** | Exclusive themed sets, animated items, special effects |
| **Premium cosmetics** | Exclusive agent skins, rare outfits, unique accessories |
| **Premium consumables** | Longer/stronger boosts than coin versions |
| **Seasonal items** | Time-limited event / battle pass items |
| **Convenience** | Speed up construction, instant upgrades |

**Rules:**
- Cosmetic or convenience only — never pay-to-win
- Cash items look cooler but coin items provide the same functional boosts
- No conversion between coins and cash
- Cash items tradeable (Phase 2+)
- Phase 1: shop shows "coming soon" cash slots to establish the concept

---

## Social / Competitive (Coin Master Mechanics) — Phase 2+

### Raids

| Mechanic | Description |
|----------|-------------|
| **Raidable worlds** | When **all** agents are idle, world becomes vulnerable |
| **Raider agent** | Pure game logic — wakes periodically, matched to raidable world, dice roll for coin steal |
| **Shields** | Buy shields (coins, 500/day) to protect when agents idle |
| **Revenge raids** | When raided, chance to raid back |

Raids steal **coins only** — never cash or cash-purchased items.

### Social

| Mechanic | Description |
|----------|-------------|
| **Leaderboards** | Global and friend — richest, most productive, best decorated |
| **World visits** | Browse other Agentvilles (opt-in, read-only) |
| **Trading** | Trade rare drops and decorations |

---

## Agent Configuration UI — Phase 2+

- Visual agent config through the Agentville UI
- Drag-and-drop team builder
- Live editing of agent behavior

---

## Persistence [NEW]

### Where world state lives

```
~/.agentville/
├── world.json            ← the single source of truth (game state)
└── world.json.bak        ← rolling backup (previous write)
```

Currently: visualization-only config at `~/.nightshift/miniverse/{repo}/{team}/world.json`. Agentville replaces this with a single game-state file at `~/.agentville/world.json`.

The Agentville server reads `world.json` on startup, holds it in memory during operation, and writes back after every coin-earning event or purchase. The file is always up to date.

**Write strategy:** atomic write-to-temp-then-rename. Every save writes to `world.json.tmp`, then atomically renames over `world.json`. A rolling backup (`world.json.bak`) is kept — on startup, if `world.json` is missing or corrupt, the server falls back to `world.json.bak`.

### What's in `world.json`

```jsonc
{
  "schemaVersion": 1,

  // --- Economy ---
  "coins": 0,
  "inventory": [                           // ALL owned items (single ownership record)
    {
      "id": "item_0",
      "catalogId": "desk_basic",
      "type": "desk",                      // "desk" | "facility" | "decoration" | "cosmetic" | "consumable"
      "placed": true,                      // whether item is placed in a room
      "placedAt": { "roomId": "room_0", "x": 2, "y": 3 }  // null if not placed
    }
  ],

  // --- World Layout (expandable) ---
  "world": {
    "floors": [                            // start with 1, buy more
      {
        "id": "floor_0",
        "name": "Ground Floor",
        "rooms": [
          {
            "id": "room_0",
            "name": "Main Office",
            "width": 12,                   // grid units
            "height": 8,
            "style": "basic"               // wall/floor theme (upgradeable)
          }
        ]
      }
    ]
  },

  // --- Agents (keyed by source/name to avoid collisions) ---
  "agents": {
    "nightshift/ns-dev-planner": {
      "source": "nightshift",
      "name": "Planner",
      "cosmetic": "dexter",                // sprite catalog ID
      "accessories": [],                   // equipped cosmetics
      "desk": "item_0"                     // inventory item ID, or null if no desk
    }
  },

  // --- Stats ---
  "stats": {
    "totalCoinsEarned": 0,
    "totalCoinsSpent": 0,
    "totalWorkCompleted": 0,
    "streakDays": 0,
    "lastActiveDate": "2026-04-14",        // local calendar date (YYYY-MM-DD)
    "timezone": "America/Los_Angeles"      // set on first run, used for day boundaries
  },

  // --- Cloud (Phase 2) ---
  "cloudSync": {
    "lastSyncedAt": null,                  // ISO timestamp of last successful sync
    "syncSequence": 0                      // monotonic counter, incremented on every write
  }
}
```

**Notes on the schema:**
- `inventory` is the single ownership record. An item's room membership is derived from `placedAt.roomId` — no separate room-level item list needed.
- `agents` keys are namespaced (`source/agentId`) to prevent collisions when multiple tools have agents with the same name.
- `stats.timezone` is set once on first run from the system locale. Streak "day" = local calendar date boundary.
- A missed day resets `streakDays` to 0.
- Phase 2 fields (`cash`, `shields`, `raidWins`, `raidLosses`, `achievements`) will be added when those features are built — not included in Phase 1 schema.

### Starting world bootstrap

On first `agentville start`, the server writes `world.json` with:
- `schemaVersion: 1`, `coins: 0`
- `inventory`: 2 items — `desk_basic` at `(2,3)` and `(6,3)` in `room_0`
- `world.floors`: 1 floor, 1 room (`Main Office`, 12x8, `basic` style)
- `agents`: empty (populated as agents send their first heartbeat)
- `stats`: zeroed, `timezone` set from system locale

### World expansion

The world starts small (1 floor, 1 room) and expands through purchases:

| Expansion | What it does | Price range |
|-----------|-------------|-------------|
| **New room** | Adds a room to the current floor (more space for desks, facilities, decorations) | 5,000 |
| **Room upgrade** | Increases room dimensions (wider/taller) | 2,000-5,000 |
| **Room style** | Changes wall/floor theme (modern, retro, garden, etc.) | 1,000-3,000 |
| **New floor** | Adds an entire floor with one starter room | 10,000-15,000 |
| **Special areas** | Rooftop, basement, courtyard — unique room types with unique slots | 15,000-25,000 |

Rooms have a fixed grid. Items snap to grid positions. Each room has a max capacity based on its dimensions — bigger rooms = more slots.

Game state only — agent performance history stays in the orchestrator (nightshift, etc.).

### Local mode (Default)

- `world.json` stored locally
- Works offline, no account
- Single-player only
- Zero setup

### Cloud mode — Phase 2

- Auth: auto-generated anonymous token (no login)
- Server syncs `world.json` to Cloudflare Workers on interval and on stop
- Cloud copy enables multiplayer (raids, leaderboards, visits)
- Conflict resolution: TBD (needs sequence counter and proper merge strategy)

### Lifecycle

| Event | What happens to world.json |
|-------|---------------------------|
| Server start | Load `world.json` (create with starting world if missing, fallback to `.bak` if corrupt) |
| Agent completes work | Server awards coins, writes `world.json` |
| User buys item (browser) | Server deducts coins, writes `world.json` |
| Browser opens/closes | Nothing — server keeps running, no data loss |
| Server stop | Write final state, exit |
| Server start (next day) | Load `world.json`, evaluate streak (increment or reset to 0), resume |

---

## Event Interface [NEW]

This replaces the current separate endpoints (`POST /api/heartbeat` and `POST /api/hooks/claude-code`) with a unified event API.

All events are HTTP POSTs to `localhost:4321/events`. Every event shares a common envelope:

```jsonc
{
  "type": "agent:heartbeat",           // event type (required)
  "source": "nightshift",              // integration source (required)
  "agent": "ns-dev-planner",           // agent identifier (required)
  "timestamp": 1713086400000,          // unix ms (required)
  "data": { ... }                      // event-specific payload (required)
}
```

### Event types and payloads

**`agent:heartbeat`** — agent state update (most frequent event)
```jsonc
{ "state": "working", "task": "Writing implementation plan" }
// state: "working" | "idle" | "error"
```
Server: updates agent state, assigns agent to first empty desk if unassigned, broadcasts to browser. If agent is new (not in `world.json`), creates an entry with default cosmetic.

**`work:completed`** — coin-earning event
```jsonc
{ "workType": "pr_merged", "ref": "org/repo#42" }
// workType: "issue_triaged" | "plan_written" | "review_completed" | "test_passed" | "pr_merged"
// ref: optional reference (issue/PR URL)
```
Server: looks up base rate for `workType`, applies multipliers, rolls for random drop, writes world.json, broadcasts.

**`agent:spawned`** — sub-agent created
```jsonc
{ "parent": "ns-dev-planner", "child": "ns-dev-planner-sub-a3f2c1" }
```
Server: increments parent's in-memory sub-agent count, broadcasts (star animation).

**`agent:spawn-ended`** — sub-agent finished
```jsonc
{ "parent": "ns-dev-planner", "child": "ns-dev-planner-sub-a3f2c1" }
```
Server: decrements parent's in-memory sub-agent count, broadcasts (star removal).

**`agent:idle`** — agent entered idle state
```jsonc
{ "reason": "session_ended" }
// reason: "session_ended" | "no_work" | "timeout"
```
Server: updates agent state to idle. Evaluates raidability (Phase 2+): if ALL registered agents are idle, world becomes raidable.

**`agent:error`** — agent encountered an error
```jsonc
{ "error": "Tool execution failed", "errorType": "tool_failure" }
```
Server: updates agent state to error, broadcasts (error animation).

### Server-side idle detection

If an agent stops sending heartbeats for 5 minutes, the server automatically marks it idle (equivalent to receiving an `agent:idle` event). This handles cases where the agent process crashes without sending a clean idle event.

### What the server does

| Event | Server Action |
|-------|--------------|
| `agent:heartbeat` | Update agent state + desk assignment, register new agents, broadcast |
| `work:completed` | Calculate coins, roll drops, write world.json, broadcast |
| `agent:spawned` | Increment sub-agent count (in-memory), broadcast |
| `agent:spawn-ended` | Decrement sub-agent count (in-memory), broadcast |
| `agent:idle` | Update agent state, evaluate raidability (Phase 2+), broadcast |
| `agent:error` | Update agent state, broadcast |

---

## Core Game Loops [NEW]

1. **Productivity:** Use agents → earn coins → buy boosters → earn faster
2. **Facilities:** Earn coins → build facilities → earning multiplier increases → earn more
3. **Decoration:** Earn coins → decorate → decoration bonuses → earn more
4. **Defense:** Keep agents active → protected. Go idle → raidable (Phase 2+)
5. **Social:** Build world → raid others → leaderboards (Phase 2+)

---

## Tech Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| Visualization engine | Vendored pixel-art engine (`miniverse-core.js`) | [BUILT] |
| Server | WebSocket + HTTP (ws library), port 4321 | [BUILT] |
| Asset generation | `@miniverse/generate` (FAL.ai) | [BUILT] |
| Game engine | Coin economy, multipliers, drops, shop | [NEW] |
| Game state persistence | `~/.agentville/world.json` with atomic writes | [NEW] |
| Unified event API | `POST /events` with standard envelope | [NEW] |
| Shop UI | Browser-based item shop + placement | [NEW] |
| HUD | Agent roster, coins/hr, streak display | [NEW] |
| Cloud backend | Cloudflare Workers | [Phase 2] |

---

## Monetization

**Deferred.** Dual currency designed from the start so the economy works when cash is introduced.

Phase 1: purely coin-based with "coming soon" cash slots.
Phase 2+: cash store, premium items, potentially seasonal content.

---

## Implementation Phases & Tasks

### Current State Summary

The codebase has a working visualization system called **Miniverse** (`lib/miniverse/`). It renders a pixel-art office at `localhost:4321` with real-time agent state tracking via Claude Code hooks. Agents appear as animated citizens. The server handles HTTP + WebSocket, supports multi-repo/multi-team worlds, and is auto-started by `nightshift start`. There is no game state, no economy, no shop — purely visualization.

**Agentville is a standalone product.** It knows nothing about nightshift, Claude Code, or any specific AI tool. It exposes a generic `POST /events` API. Integrations (nightshift, Claude Code, Codex, etc.) are adapters that translate their events into Agentville's format. All nightshift-specific logic (hook scripts, event mapping, lifecycle bridging) lives in the nightshift codebase, never in Agentville.

### Key architecture boundary

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│  NIGHTSHIFT (integration)       │     │  AGENTVILLE (standalone product) │
│                                 │     │                                 │
│  lib/hooks.ts                   │     │  lib/agentville/server/         │
│  bin/ns-heartbeat.sh            │────▶│  POST /events                   │
│  bin/ns-work-event.sh           │     │  (generic envelope:             │
│  lib/agentville.ts (lifecycle)  │     │   source, agent, type, data)    │
│                                 │     │                                 │
│  Maps ns pipeline events to     │     │  Doesn't know what sent the     │
│  Agentville event types         │     │  event or why                   │
└─────────────────────────────────┘     └─────────────────────────────────┘
```

### Key files that will be heavily modified or replaced

**Agentville (standalone):**
- `lib/miniverse/server/server.ts` — main server (~1040 lines) → becomes `lib/agentville/server/server.ts`
- `lib/miniverse/server/store.ts` — agent state tracking
- `lib/miniverse/server/frontend.ts` — inline HTML/JS frontend
- `lib/miniverse/server/events.ts` — event log ring buffer
- `lib/miniverse/server/cli.ts` — standalone CLI
- `lib/miniverse/core/miniverse-core.js` — vendored engine bundle (to be replaced with source build)
- `lib/world-config.ts` — world config generation
- `worlds/nightshift/` — world assets and config files

**Nightshift (integration layer):**
- `lib/visualize.ts` — server lifecycle management (start/stop/register)
- `lib/hooks.ts` — Claude Code hook config generation
- `bin/ns-heartbeat.sh` — heartbeat script

---

### Phase 0 — Pull in Engine Source & Build Pipeline

Replace the vendored `miniverse-core.js` bundle (104KB minified blob) with the upstream source from `github.com/ianscott313/miniverse`. This enables renaming class names, modifying the engine for new features (star animations, etc.), and removes a binary artifact from git.

**Note:** Only the **core engine** needs to be pulled from upstream. The server code (`lib/miniverse/server/`) is our own — heavily customized with CORS hardening, input sanitization, multi-world support, pre-registered agents, subagent metadata, custom routes, and a complete frontend rewrite. Upstream server has not diverged since we vendored. No re-application of changes needed.

- [ ] **0.1 Add miniverse core source to repo**
  - Clone/subtree `github.com/ianscott313/miniverse` — extract only the `packages/core/` source directory
  - Place at `lib/miniverse/core/src/` (or a suitable location)
  - Determine approach: git subtree, copy of source files, or submodule (subtree or copy preferred for build simplicity)

- [ ] **0.2 Add build pipeline for core engine**
  - Add vite/rollup/esbuild config to compile `lib/miniverse/core/src/` → `lib/miniverse/core/miniverse-core.js`
  - Add build script to `package.json` (e.g., `build:core`)
  - Wire into main `build` script so `npm run build` builds core first, then TypeScript
  - Verify the built output matches the current vendored bundle (same exports: `Miniverse`, `PropSystem`, `createStandardSpriteConfig`, etc.)

- [ ] **0.3 Delete vendored bundle**
  - Remove the checked-in `lib/miniverse/core/miniverse-core.js` (104KB)
  - Add it to `.gitignore` (it's now a build artifact)
  - Keep `miniverse-core.d.ts` or generate it from source
  - Verify all existing tests still pass with the source-built bundle

- [ ] **0.4 Verify upstream compatibility**
  - Run existing visualization end-to-end: `nightshift start` → open browser → confirm agents render correctly
  - Confirm all sprite animations, citizen movement, prop rendering, click tooltips work as before
  - This is the baseline before any rename or modification

---

### Phase 1 — Rename & Restructure

Sweep rename from Miniverse to Agentville. No behavior changes — purely naming. Runtime paths (`~/.nightshift/miniverse/`) stay unchanged until Phase 2 (where migration tooling exists).

- [ ] **1.1 Rename engine source class names**
  - In the core engine source (from Phase 0): rename `class Miniverse` → `class Agentville` (and any other `Miniverse` references)
  - Update exports: `Miniverse` → `Agentville`
  - Rebuild: output becomes `agentville-core.js`
  - Update `miniverse-core.d.ts` → `agentville-core.d.ts` with renamed types

- [ ] **1.2 Rename source files and directories**
  - `lib/miniverse/` → `lib/agentville/`
  - `lib/miniverse/server/` → `lib/agentville/server/`
  - `lib/miniverse/core/` → `lib/agentville/core/`
  - `lib/visualize.ts` → `lib/agentville.ts` (this remains nightshift's integration layer — see 1.6)
  - `lib/spawn.ts` — update doc comment referencing "miniverse citizens"
  - Update all import paths across the codebase
  - Update `tsconfig.build.json` copy targets and build config from Phase 0

- [ ] **1.3 Rename classes, types, and variables**
  - `MiniverseServer` → `AgentvilleServer`
  - `startMiniverse` / `stopMiniverse` → `startAgentville` / `stopAgentville`
  - All `miniverse` references in `lib/`, `bin/`, `tests/`
  - Update type definitions in `lib/types.ts`
  - Update server `/api/info` response: `miniverse: true` → `agentville: true`, update version string

- [ ] **1.4 Rename world assets**
  - `worlds/nightshift/` → `worlds/agentville/` (default world template)
  - Update asset path references in `server.ts` and `frontend.ts`
  - Update frontend HTML import from `/miniverse-core.js` to `/agentville-core.js`
  - Update frontend JS: `new Miniverse(...)` → `new Agentville(...)`

- [ ] **1.5 Update tests**
  - Rename `tests/visualize.test.ts` → `tests/agentville.test.ts`
  - Update `tests/world-config.test.ts` imports/references
  - Update all test assertions referencing "miniverse" paths (e.g., `.nightshift/miniverse.pid` assertions)
  - Update class name references in all test files

- [ ] **1.6 Clarify nightshift integration boundary**
  - `lib/agentville.ts` (formerly `lib/visualize.ts`) is nightshift's integration layer — it calls Agentville server start/stop but is not part of Agentville itself
  - Rename its exports: `startMiniverse` → `startAgentville`, `stopMiniverse` → `stopAgentville`
  - Keep nightshift-specific paths here: PID file at `~/.nightshift/agentville.pid`, port at `~/.nightshift/agentville.port`, log at `~/.nightshift/agentville.log`
  - **Do NOT change world data paths yet** — data stays at `~/.nightshift/miniverse/{repo}/{team}/` until Phase 2 migration

- [ ] **1.7 Update docs and scripts**
  - Update references in `docs/architecture.md`, `docs/troubleshooting.md`, etc.
  - Update `package.json` build script copy targets
  - Update `scripts/measure-build.sh` if it references miniverse paths

---

### Phase 2 — Persistence & Lifecycle

New game-state `world.json` schema, standalone Agentville lifecycle, single-world model. Migration from old paths happens first to prevent data loss.

- [ ] **2.1 Define world.json game state schema**
  - Create `lib/agentville/schema.ts` with TypeScript interfaces for the full `world.json` structure: `AgentvilleWorld`, `InventoryItem`, `Floor`, `Room`, `AgentEntry`, `Stats`, `CloudSync`
  - Include `schemaVersion: 1` for future migrations
  - Include validation function `validateWorldState(data): AgentvilleWorld | null`
  - Agent keys use generic `{source}/{agentId}` format — no `ns-` prefix assumptions in the schema

- [ ] **2.2 Implement atomic persistence layer**
  - Create `lib/agentville/persistence.ts`
  - `loadWorld(dir)`: reads `~/.agentville/world.json`, falls back to `.bak` if corrupt/missing, returns parsed `AgentvilleWorld`
  - `saveWorld(dir, state)`: writes to `.tmp`, renames to `world.json`, copies previous to `.bak`
  - `bootstrapWorld(dir, timezone)`: creates starting world — 1 floor, 1 room (12×8 "Main Office"), 2 `desk_basic` items at (2,3) and (6,3), zero coins, empty agents, timezone from system locale
  - All operations on `~/.agentville/` directory (create if missing)

- [ ] **2.3 Migration tooling** *(moved from Phase 7 — must happen before single-world switch)*
  - On server startup: if `~/.agentville/world.json` does not exist but `~/.nightshift/miniverse/` does, auto-migrate
  - Pick the largest (or most recently modified) team world from `~/.nightshift/miniverse/{repo}/{team}/world.json` as the starting point
  - Convert old rendering-only world config to new game state schema (add `coins: 0`, `inventory`, `stats`, etc. — existing layout is preserved as the room layout)
  - Warn user in server logs: "Migrated world from ~/.nightshift/miniverse/{repo}/{team}/"
  - Clean up old `~/.nightshift/miniverse.pid` and `~/.nightshift/miniverse.port` if they exist
  - On `nightshift start`: if old PID file exists, stop that process first

- [ ] **2.4 Implement streak evaluation**
  - On server startup after loading `world.json`: compare `stats.lastActiveDate` to current local date (using `stats.timezone`)
  - Same day → no change. Next day → increment `streakDays`. Skipped day(s) → reset `streakDays` to 0
  - Update `lastActiveDate` to today

- [ ] **2.5 Standalone `agentville` CLI**
  - Create `bin/agentville.ts` (or extend existing `lib/agentville/server/cli.ts`)
  - Commands: `agentville start [--port PORT]`, `agentville stop`
  - `start`: load/bootstrap world.json, start HTTP+WS server, write PID/port files to `~/.agentville/`
  - `stop`: read PID file, send SIGTERM, clean up PID/port files
  - Register as `bin` entry in `package.json`
  - **Packaging note:** For Phase 1, `agentville` CLI lives in the same package as `nightshift` (pragmatic). Separation into its own npm package is deferred to Phase 2+ when Agentville has its own install story.

- [ ] **2.6 Update nightshift lifecycle integration**
  - Update `lib/agentville.ts` so `nightshift start` auto-starts the agentville server if not already running
  - `nightshift stop` stops agentville only if no other nightshift sessions are active (existing behavior, new paths)
  - Both `nightshift start` and `agentville start` use the same server code — just different entry points
  - nightshift passes `--port` and asset paths but does NOT pass team/repo info (Agentville doesn't care)

- [ ] **2.7 Migrate from multi-world to single world**
  - Remove multi-repo/multi-team world separation from server
  - Remove team selector dropdown from frontend
  - Remove `/api/worlds` endpoint (or return single world)
  - Update `/api/world` to return the single world (no `?repo=&team=` params)
  - Remove LRU world cache from frontend
  - All agents from all sources appear in the same world

- [ ] **2.8 Minimal frontend compatibility**
  - Update frontend to render from new `world.json` game state format (basic: single room, placed items as props)
  - This is a minimal bridge — just enough that the visualization doesn't break between Phase 2 and Phase 6
  - Full frontend rewrite is Phase 6

- [ ] **2.9 Server startup flow**
  - On start: `loadWorld()` (with migration if needed) → evaluate streak → hold state in memory → start HTTP+WS
  - On shutdown (SIGTERM): `saveWorld()` → exit
  - Save triggers: after every coin-earning event, after every purchase (implemented in later phases — wire the hook points now)

- [ ] **2.10 Write persistence tests**
  - `loadWorld` / `saveWorld` round-trip
  - Atomic write (verify `.bak` exists after save)
  - Corrupt file fallback to `.bak`
  - Missing file → bootstrap
  - Streak evaluation: same day, next day, skipped day
  - Schema validation: valid/invalid inputs
  - Migration: old-format world → new-format conversion
  - Migration: old PID file cleanup

---

### Phase 3 — Unified Event API

Replace separate endpoints with `POST /events` standard envelope. Agentville defines the generic API; nightshift updates its adapters.

- [ ] **3.1 Define event types and payloads**
  - Create `lib/agentville/events.ts` (or extend existing)
  - TypeScript types for each event: `HeartbeatEvent`, `WorkCompletedEvent`, `AgentSpawnedEvent`, `AgentSpawnEndedEvent`, `AgentIdleEvent`, `AgentErrorEvent`
  - Common envelope type: `AgentvilleEvent { type, source, agent, timestamp, data }`
  - `source` is an opaque string — Agentville doesn't interpret it (could be "nightshift", "claude-code", "codex", anything)
  - `agent` is the agent identifier — Agentville keys it as `{source}/{agent}` internally
  - Validation function: `validateEvent(body): AgentvilleEvent | null`

- [ ] **3.2 Implement `POST /events` endpoint**
  - Single endpoint that accepts all event types
  - Parse envelope, validate, dispatch to type-specific handlers
  - Return `200` with `{ ok: true }` on success, `400` on invalid payload
  - This is Agentville's only inbound API — replaces `handleClaudeCodeHook()` and `/api/heartbeat`

- [ ] **3.3 Implement event handlers**
  - `agent:heartbeat` → update agent state, assign desk if unassigned, register new agents (create entry in world.json with default cosmetic), broadcast
  - `work:completed` → delegate to economy engine (Phase 4) — stub until then
  - `agent:spawned` → increment in-memory sub-agent count for parent, broadcast
  - `agent:spawn-ended` → decrement in-memory sub-agent count for parent, broadcast
  - `agent:idle` → update agent state, broadcast
  - `agent:error` → update agent state, broadcast
  - Desk assignment is synchronous (single-threaded Node.js) — no race conditions on concurrent heartbeats

- [ ] **3.4 Implement server-side idle detection**
  - Replace current 30-second sleep timeout with 5-minute idle timeout
  - If no heartbeat received for 5 minutes, auto-mark agent idle (with Zzz animation)
  - Keep a distinct "offline" state for agents that sent an explicit `agent:idle { reason: "session_ended" }` — these should NOT show as wandering around. Visual: faded out or at desk with screen off
  - Use a periodic sweep (existing pattern in `store.ts`) with updated thresholds

- [ ] **3.5 Define WebSocket broadcast schema**
  - Standardize all outbound WebSocket messages now (before frontend work): `{ type, payload, timestamp }`
  - Types: `state:update`, `coins:earned`, `item:placed`, `item:purchased`, `agent:registered`, `effect:activated`, `effect:expired`
  - This ensures Phase 6 frontend builds against a stable contract

- [ ] **3.6 Keep backward-compatible endpoints (temporary)**
  - Keep `/api/hooks/claude-code` as a thin adapter that translates the Claude Code hook format into the generic event envelope and forwards to the `/events` handler internally
  - Keep `/api/heartbeat` as adapter
  - Mark as deprecated — remove in a future release
  - These adapters live in the server but are documented as legacy shims

- [ ] **3.7 Update nightshift hook adapters** *(nightshift-side, not Agentville)*
  - Update `bin/ns-heartbeat.sh` to POST to `/events` with the standard envelope format
  - Script must read Claude Code hook JSON payload from **stdin** (not just CLI args) to extract `subagent_id`, prompt text, tool name, etc.
  - Map Claude Code hook events to Agentville event types:
    - `SessionStart` → `agent:heartbeat { state: "idle" }`
    - `UserPromptSubmit` → `agent:heartbeat { state: "working", task: "..." }`
    - `PreToolUse` / `PostToolUse` → `agent:heartbeat { state: "working", task: "..." }`
    - `SubagentStart` → `agent:spawned { parent, child }`
    - `SubagentStop` → `agent:spawn-ended { parent, child }`
    - `Stop` / `SessionEnd` → `agent:idle { reason: "session_ended" }`
  - Include `source: "nightshift"` (or `"claude-code"` for standalone Claude) and proper `agent` field
  - Update `HOOK_EVENTS` in `lib/hooks.ts` to include `SubagentStart`, `SubagentStop`, `SessionEnd` (currently missing — means no sub-agent events are ever sent)

- [ ] **3.8 Add `work:completed` event emission** *(nightshift-side, not Agentville)*
  - Create `bin/ns-work-event.sh` (or extend `ns-heartbeat.sh`) to emit `work:completed` events
  - Map nightshift pipeline events to work types:
    - Producer triages issue → `work:completed { workType: "issue_triaged" }`
    - Planner writes plan → `work:completed { workType: "plan_written" }`
    - Reviewer completes review → `work:completed { workType: "review_completed" }`
    - Tester passes tests → `work:completed { workType: "test_passed" }`
    - PR merged → `work:completed { workType: "pr_merged" }`
  - Update `lib/hooks.ts` to install these hooks alongside heartbeats
  - **This is critical** — without it, the economy engine (Phase 4) has no source of coin-earning events

- [ ] **3.9 Write event API tests**
  - Valid envelope accepted for each event type
  - Invalid envelope rejected (missing fields, unknown type)
  - Unknown `source` values accepted (Agentville is source-agnostic)
  - Heartbeat registers new agent in world state with `{source}/{agent}` key
  - Heartbeat assigns desk to unassigned agent
  - Idle detection fires after 5 minutes of no heartbeat
  - `session_ended` idle shows distinct state from timeout idle
  - Backward-compat endpoints translate correctly to new format

---

### Phase 4 — Economy Engine

Coin earning, multipliers, streaks, random drops. Pure game logic — no integration-specific code.

- [ ] **4.1 Define item catalog**
  - Create `lib/agentville/catalog.ts`
  - Static catalog of all purchasable items with: `catalogId`, `name`, `type` (desk/facility/decoration/cosmetic/consumable/expansion), `price`, `rarity` (common/rare/legendary), `category` (for facilities: food/hydration/rest/comfort/fun), `multiplierBonus` (for decorations), `description`
  - Include all items from spec: desks (basic through corner office), facilities (water cooler through game room), decorations (plants through hologram display), cosmetics (~15 sprite options), consumables (boosts), expansions (rooms, floors, special areas)
  - Export `getCatalogItem(id)`, `getCatalogByType(type)`, `getBaseRate(workType)`

- [ ] **4.2 Define earning rates**
  - Base rates per `workType`: `issue_triaged: 10`, `plan_written: 50`, `review_completed: 30`, `test_passed: 40`, `pr_merged: 100`
  - Random drop table: probability per `work:completed` event, range 10-500 coins or item drop
  - Work types are generic strings — Agentville doesn't know what "issue_triaged" means, just that it maps to 10 coins

- [ ] **4.3 Implement multiplier calculator**
  - Create `lib/agentville/economy.ts`
  - `calculateMultiplier(world: AgentvilleWorld, agentKey: string): number`
  - Agent count: +10% per additional active agent (count from agents with recent heartbeat)
  - Desk bonus: +10% if the specific agent has a desk assigned
  - Streak bonus: +5% per streak day, cap at +50%
  - Needs met: +10% per facility category with at least one facility placed, max +50%
  - Decoration bonus: +1% common, +3% rare, +5% legendary, cap +20% total
  - Return total multiplier (1.0 base + all bonuses)

- [ ] **4.4 Implement coin awarding**
  - `awardCoins(world, agentKey, workType): { coinsAwarded, multiplier, drop? }`
  - Look up base rate → apply multiplier → award coins
  - Roll for random drop (configurable probability, e.g. 10% chance per work:completed)
  - Update `world.coins`, `world.stats.totalCoinsEarned`, `world.stats.totalWorkCompleted`
  - Return result for broadcasting to frontend

- [ ] **4.5 Wire economy into event handler**
  - In `work:completed` handler (stub from 3.3): call `awardCoins()`, call `saveWorld()`, broadcast `coins:earned` via WebSocket
  - Broadcast uses schema from 3.5: `{ type: "coins:earned", payload: { coins, total, multiplier, drop?, agentKey }, timestamp }`

- [ ] **4.6 Implement desk assignment**
  - On `agent:heartbeat` for an agent with no desk: find first `desk_*` item in inventory that isn't assigned to any agent, assign it
  - Store desk assignment in `agents[key].desk` (inventory item ID)
  - If no free desk, agent works without one (no penalty, just missing +10% bonus)
  - Assignment is synchronous in the single-threaded event handler — no race conditions

- [ ] **4.7 Write economy tests**
  - Base rate lookup for each work type, including unknown work types (should return 0 or a default)
  - Multiplier calculation: each multiplier type individually, all combined, cap enforcement
  - Coin awarding: correct coins = base × multiplier, stats updated
  - Random drop: verify probability (seeded RNG for deterministic tests)
  - Desk assignment: assigns first free desk, no-op when no desks available, concurrent heartbeats handled correctly
  - Streak bonus at various streak lengths (including cap at +50%)

---

### Phase 5 — Shop & Inventory

Purchase flow, inventory management, item placement. Pure game logic.

- [ ] **5.1 Implement purchase logic**
  - Create `lib/agentville/shop.ts`
  - `purchaseItem(world, catalogId): { success, error?, item? }`
  - Validate: catalog item exists, enough coins, item-specific limits (spec doesn't limit, so allow multiples)
  - Deduct coins, create `InventoryItem` with unique ID, add to `inventory`, update `stats.totalCoinsSpent`
  - For expansions: create new room/floor in `world.world.floors`

- [ ] **5.2 Implement item placement**
  - `placeItem(world, itemId, roomId, x, y): { success, error? }`
  - Validate: item exists in inventory, not already placed (or allow re-placement), room exists, position within room bounds, position not occupied
  - Update item's `placed`, `placedAt` fields

- [ ] **5.3 Implement item removal (unplace)**
  - `unplaceItem(world, itemId): { success, error? }`
  - Set `placed: false`, `placedAt: null`
  - Item stays in inventory (never lost, just unplaced)

- [ ] **5.4 Implement agent cosmetic selection**
  - `setAgentCosmetic(world, agentKey, cosmeticCatalogId): { success, error? }`
  - Validate: cosmetic is owned (in inventory), agent exists
  - Update `agents[key].cosmetic`
  - `setAgentAccessory(world, agentKey, accessoryCatalogId): { success, error? }` — similar for accessories

- [ ] **5.5 Shop API endpoints**
  - `GET /api/catalog` — return full item catalog (grouped by type)
  - `GET /api/catalog/:type` — return items of a specific type
  - `POST /api/shop/buy` — `{ catalogId }` → purchase item, save world, broadcast
  - `POST /api/shop/place` — `{ itemId, roomId, x, y }` → place item, save world, broadcast
  - `POST /api/shop/unplace` — `{ itemId }` → unplace item, save world, broadcast
  - `POST /api/shop/use` — `{ itemId }` → activate consumable, remove from inventory, broadcast (wired to Phase 7.5)
  - `POST /api/agent/cosmetic` — `{ agentKey, cosmeticId }` → set cosmetic, save world, broadcast
  - `GET /api/world` — return full world state (already exists, update to return game state)

- [ ] **5.6 Write shop tests**
  - Purchase: success, insufficient coins, invalid catalog ID
  - Placement: success, out of bounds, position occupied, item not in inventory
  - Unplace: success, item not placed
  - Cosmetic: success, cosmetic not owned
  - Coin deduction correctness
  - Inventory item ID uniqueness
  - Consumable use: success, item not consumable, item not in inventory

---

### Phase 6 — Frontend Game Layer

HUD, shop UI, updated visuals. All in the inline frontend (`frontend.ts`).

- [ ] **6.1 World state → render config translation**
  - Write `worldStateToRenderConfig(world: AgentvilleWorld)` function that translates the game state schema into the format `agentville-core.js` expects (floor grids, tile maps, prop arrays from placed inventory items)
  - This is the bridge between the game data model and the pixel-art engine
  - Map `inventory[].placedAt` coordinates to engine prop positions
  - Map room dimensions and styles to tile grids

- [ ] **6.2 Multi-room rendering**
  - Room tabs or navigation to switch between rooms on the same floor
  - Each room rendered as a separate tile grid via the engine
  - Active room shown, others accessible via tabs

- [ ] **6.3 Multi-floor rendering**
  - Floor selector UI (buttons or elevator metaphor)
  - Switching floors shows that floor's rooms
  - Starting state: 1 floor, 1 room — selector appears when 2+ floors exist

- [ ] **6.4 HUD overlay**
  - Top bar or side panel showing:
    - Total coins (with animated increment on earn)
    - Coins/hr (calculated from recent earning rate)
    - Streak (consecutive days, with flame/star icon)
    - Agent roster: total / working / idle / error counts
    - Active sub-agents count
  - Receives updates via WebSocket broadcast (schema from 3.5)

- [ ] **6.5 Shop UI**
  - Shop panel (toggleable overlay or sidebar)
  - Browse by category tabs: Desks, Facilities, Decorations, Cosmetics, Consumables, Expansions
  - Each item shows: name, icon/preview, price, rarity badge, description
  - Buy button (grayed out if insufficient coins)
  - "Coming soon" slots for cash items (Phase 2+ placeholder)
  - On purchase: POST to `/api/shop/buy`, animate coin deduction, show item added to inventory

- [ ] **6.6 Inventory & placement UI**
  - Inventory panel showing owned but unplaced items
  - Drag-to-place or click-to-place on the world grid
  - Grid overlay showing valid placement positions
  - On place: POST to `/api/shop/place`
  - Placed items rendered as props in the pixel-art world

- [ ] **6.7 Agent customization UI**
  - Click agent → popup with cosmetic options
  - Show owned cosmetics, highlight equipped
  - Preview sprite change before confirming
  - On select: POST to `/api/agent/cosmetic`

- [ ] **6.8 Sub-agent star animation**
  - Replace current behavior (sub-agents as separate citizens) with star animation above parent's head
  - **Implementation approach:** Modify engine source (available since Phase 0) to support an overlay/badge system on citizens, OR implement as a canvas overlay layer in the frontend that tracks citizen positions via engine callbacks
  - On `agent:spawned` broadcast: add animated star sprite above parent citizen
  - On `agent:spawn-ended` broadcast: remove star
  - Cap at 5 stars visually

- [ ] **6.9 Updated agent state visuals**
  - Working: agent at desk, screen glowing, typing animation
  - Working + sub-agents: same + star overlay
  - Idle (timeout): agent walks around, visits facilities (if any placed), Zzz after 5+ min
  - Idle (session ended): distinct visual — faded/dimmed, not wandering (agent process is gone)
  - Error: red exclamation mark, sparks

- [ ] **6.10 Coin earn animation**
  - When `coins:earned` WebSocket message received:
    - Floating "+N coins" text above the earning agent
    - HUD coin counter animates up
    - If random drop: special animation (sparkle/chest)
  - Keep animations lightweight (CSS or canvas overlay)

---

### Phase 7 — Facilities, Expansion & Polish

Facility multipliers, world growth, consumables, final integration testing.

- [ ] **7.1 Facility multiplier integration**
  - When a facility is placed, it contributes to the needs-met multiplier
  - 5 categories: food, hydration, rest, comfort, fun
  - Each category with at least one placed facility → +10% earning multiplier
  - All 5 categories met → +50% total from facilities
  - Already calculated in Phase 4's multiplier calculator — verify it works end-to-end with placed facilities

- [ ] **7.2 Idle agent facility visits (visual)**
  - When an agent is idle (timeout, not session-ended), occasionally animate them walking to a placed facility
  - Random selection from placed facilities
  - Purely aesthetic — no gameplay effect beyond existing multiplier
  - Only if facilities exist; otherwise idle wander as before

- [ ] **7.3 Room expansion implementation**
  - When user purchases "new room": add room to current floor in `world.world.floors`
  - Set default dimensions, basic style
  - Frontend: room appears as new tab (wired to 6.2)
  - When user purchases "room upgrade": increase dimensions
  - When user purchases "room style": change wall/floor theme

- [ ] **7.4 Floor expansion implementation**
  - When user purchases "new floor": add floor with one starter room
  - Frontend: floor selector shows new floor (wired to 6.3)
  - Special areas (rooftop, basement, courtyard) as unique room types

- [ ] **7.5 Consumable items**
  - Consumables provide temporary effects (e.g., 2x earning for 30 minutes)
  - Activation via `POST /api/shop/use` (endpoint from 5.5)
  - Server tracks active effects with expiration timestamps (in-memory, lost on restart — acceptable for Phase 1)
  - Multiplier calculator checks active consumable effects
  - Frontend shows active effects with countdown timer

- [ ] **7.6 Clean up existing interactive protocol**
  - Audit current server endpoints not in the Agentville spec: `/api/act`, `/api/observe`, `/api/channels`, `/api/inbox`, `/api/webhook`, `/api/generate`
  - Decide per endpoint: keep (useful for future), deprecate (keep but don't document), or remove
  - Remove or gate any endpoint that exposes nightshift-specific behavior

- [ ] **7.7 End-to-end integration test**
  - Simulate full game loop: start server → agent heartbeat → work:completed → verify coins earned → purchase item → place item → verify world state
  - Test multiplier stacking end-to-end
  - Test streak across simulated days
  - Test server restart preserves all state
  - Test with multiple sources (e.g., "nightshift" and "claude-code" agents coexisting)

---

### Phase 2+ — Future (Not in Scope)

These are defined in the spec but explicitly deferred:

- **Cash currency** — real-money premium store
- **Raids** — steal coins from idle worlds
- **Shields** — protect against raids
- **Leaderboards** — global and friend rankings
- **World visits** — browse other Agentvilles
- **Trading** — trade items between users
- **Cloud sync** — Cloudflare Workers backend
- **Agent config UI** — visual agent configuration
- **Seasonal content** — time-limited events / battle pass
- **Agentville as separate npm package** — own install, own repo

---

### Dependency Graph

```
Phase 0 (Engine Source & Build)
  └─→ Phase 1 (Rename)
        └─→ Phase 2 (Persistence, Migration & Lifecycle)
              ├─→ Phase 3 (Event API + Nightshift Adapters)
              │     └─→ Phase 4 (Economy) ←── requires events to trigger coins
              │           └─→ Phase 5 (Shop) ←── requires coins to spend
              │                 └─→ Phase 6 (Frontend) ←── requires all APIs
              │                       └─→ Phase 7 (Facilities, Expansion, Polish)
              │
              │   Phase 3.5 (WS Schema) ←── must complete before Phase 6
              │   Phase 3.7-3.8 (Nightshift Adapters) ←── must complete before Phase 4 is functional
              │
              └─→ Phase 2.3 (Migration) ←── runs before 2.7 (single-world switch)
```

Phases 6 and 7 have some parallelism — frontend rendering (6.1-6.3), HUD (6.4), and shop UI (6.5-6.6) can proceed while facilities/expansion backend (7.1-7.5) is built.

### Estimated Task Count

| Phase | Tasks | Description |
|-------|-------|-------------|
| 0 | 4 | Engine source & build pipeline |
| 1 | 7 | Rename & restructure |
| 2 | 10 | Persistence, migration & lifecycle |
| 3 | 9 | Unified event API + nightshift adapters |
| 4 | 7 | Economy engine |
| 5 | 6 | Shop & inventory |
| 6 | 10 | Frontend game layer |
| 7 | 7 | Facilities, expansion, polish |
| **Total** | **60** | |
