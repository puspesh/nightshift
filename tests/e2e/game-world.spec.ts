import { test, expect, Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

let serverPort: number;
let server: { stop: () => void } | null = null;

// Run all tests serially — they share mutable server-side game state.
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const { AgentvilleServer } = await import('../../dist/lib/agentville/server/server.js');
  const { bootstrapWorld } = await import('../../dist/lib/agentville/persistence.js');

  const randomPort = 10000 + Math.floor(Math.random() * 50000);
  const publicDir = path.join(projectRoot, 'dist', 'lib', 'agentville', 'server');

  // Ensure universal_assets are accessible from publicDir so engine can load sprites
  const assetsLink = path.join(publicDir, 'universal_assets');
  const assetsSource = path.join(projectRoot, 'dist', 'worlds', 'agentville', 'universal_assets');
  if (!fs.existsSync(assetsLink) && fs.existsSync(assetsSource)) {
    fs.symlinkSync(assetsSource, assetsLink);
  }

  const srv = new AgentvilleServer({ port: randomPort, publicDir });
  serverPort = await srv.start();

  const world = bootstrapWorld('UTC');
  srv.setGameState(world);

  server = srv;
});

test.afterAll(async () => {
  server?.stop();
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SOURCE = 'test';

/** Server stores agents as {source}/{agent}. */
function agentKey(agent: string): string {
  return `${SOURCE}/${agent}`;
}

async function postEvent(port: number, event: Record<string, unknown>) {
  const res = await fetch(`http://localhost:${port}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  return res;
}

async function heartbeat(
  port: number,
  agent: string,
  state: string,
  task?: string,
) {
  return postEvent(port, {
    type: 'agent:heartbeat',
    source: SOURCE,
    agent,
    data: { state, task: task ?? `Task for ${agent}`, name: agent },
  });
}

/** Post n work:completed (pr_merged ≈ 110 coins each). */
async function earnCoins(port: number, agent: string, n: number) {
  for (let i = 0; i < n; i++) {
    await postEvent(port, {
      type: 'work:completed',
      source: SOURCE,
      agent,
      data: { workType: 'pr_merged' },
    });
  }
}

async function getGameState(port: number) {
  const res = await fetch(`http://localhost:${port}/api/game-state`);
  return res.json();
}

interface SerializedCitizen {
  agentId: string;
  tileX: number;
  tileY: number;
  state: string;
  visible: boolean;
  moving: boolean;
}

async function getCitizens(page: Page): Promise<SerializedCitizen[]> {
  return page.evaluate(() => {
    const av = (window as any).__av;
    if (!av) return [];
    return av.getCitizens().map((c: any) => {
      const pos = c.getTilePosition();
      return {
        agentId: c.agentId,
        tileX: pos.x,
        tileY: pos.y,
        state: c.state,
        visible: c.visible,
        moving: c.isMoving(),
      };
    });
  });
}

async function waitForCitizen(
  page: Page,
  fullAgentKey: string,
  timeout = 10_000,
): Promise<SerializedCitizen> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const citizens = await getCitizens(page);
    const match = citizens.find((c) => c.agentId === fullAgentKey);
    if (match) return match;
    await page.waitForTimeout(250);
  }
  throw new Error(`Citizen ${fullAgentKey} did not appear within ${timeout}ms`);
}

/** CSS.escape-safe selector for data-agent attribute with slashes. */
function cardSelector(agent: string): string {
  // data-agent values contain slashes, e.g. "test/agent-a"
  return `[data-agent="${agentKey(agent)}"]`;
}

// ---------------------------------------------------------------------------
// Original test (kept as test 0)
// ---------------------------------------------------------------------------

test('game world loads and shows agent with coins', async ({ page }) => {
  await heartbeat(serverPort, 'test-agent', 'working', 'Testing');

  await page.goto(`http://localhost:${serverPort}`);

  await expect(page).toHaveTitle(/nightshift/i);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });

  await expect(page.locator('#hud-coins')).toBeVisible();

  await expect(page.locator('.agent-card').first()).toBeVisible({ timeout: 5000 });
  const agentCard = page.locator('.agent-card').first();
  await expect(agentCard.locator('.name')).toContainText('test-agent');
  await expect(agentCard.locator('.status')).toHaveText('Working');

  await earnCoins(serverPort, 'test-agent', 1);

  await expect(async () => {
    const text = await page.locator('#hud-coins').textContent();
    const coins = parseInt((text || '0').replace(/,/g, ''), 10);
    expect(coins).toBeGreaterThan(0);
  }).toPass({ timeout: 5000 });

  await expect(agentCard).toBeVisible();
});

// ---------------------------------------------------------------------------
// Citizen spawning & positioning (tests 1–3)
// ---------------------------------------------------------------------------

test('multiple agents spawn at distinct positions', async ({ page }) => {
  await page.goto(`http://localhost:${serverPort}`);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });

  // Register agents AFTER page load so they trigger the engine's auto-spawn
  // (which uses tile reservation for unique positions)
  const agents = ['agent-a', 'agent-b', 'agent-c', 'agent-d'];
  for (const a of agents) {
    await heartbeat(serverPort, a, 'working');
  }

  // Wait for all 4 citizens to appear via auto-spawn
  for (const a of agents) {
    await waitForCitizen(page, agentKey(a), 15_000);
  }

  const citizens = await getCitizens(page);
  const keys = agents.map(agentKey);
  const matched = citizens.filter((c) => keys.includes(c.agentId));
  expect(matched.length).toBe(4);

  // All visible
  for (const c of matched) {
    expect(c.visible).toBe(true);
  }

  // No two share the same tile (auto-spawn reserves distinct tiles)
  const positions = new Set(matched.map((c) => `${c.tileX},${c.tileY}`));
  expect(positions.size).toBe(matched.length);

  // 4 agent cards in DOM
  for (const a of agents) {
    await expect(page.locator(cardSelector(a))).toBeVisible();
  }
});

test('working agent anchors near assigned desk', async ({ page }) => {
  await page.goto(`http://localhost:${serverPort}`);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });

  await heartbeat(serverPort, 'desk-agent', 'working');

  const key = agentKey('desk-agent');
  await waitForCitizen(page, key, 15_000);

  // Wait for movement to settle
  await expect(async () => {
    const c = (await getCitizens(page)).find((c) => c.agentId === key)!;
    expect(c.moving).toBe(false);
  }).toPass({ timeout: 10_000 });

  const settled = (await getCitizens(page)).find((c) => c.agentId === key)!;
  const pos1 = { x: settled.tileX, y: settled.tileY };

  await page.waitForTimeout(2000);

  const later = (await getCitizens(page)).find((c) => c.agentId === key)!;
  expect(later.tileX).toBe(pos1.x);
  expect(later.tileY).toBe(pos1.y);
  expect(later.moving).toBe(false);
});

test('agents without desks still appear (more agents than desks)', async ({ page }) => {
  // Bootstrap world has 2 starter desks. Many agents already registered from prior tests.
  // Register 3 new agents — by now all desks should be taken.
  const agents = ['desk-overflow-a', 'desk-overflow-b', 'desk-overflow-c'];
  for (const a of agents) {
    await heartbeat(serverPort, a, 'working');
  }

  await page.goto(`http://localhost:${serverPort}`);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });

  // All 3 cards appear
  for (const a of agents) {
    await expect(page.locator(cardSelector(a))).toBeVisible({ timeout: 5000 });
  }

  // Check game state — desks are limited, so at least one agent should have no desk
  const gs = await getGameState(serverPort);
  const agentRecords = agents.map((a) => gs.agents[agentKey(a)]).filter(Boolean);
  const withoutDesk = agentRecords.filter((r: any) => r.desk === null);

  expect(withoutDesk.length).toBeGreaterThanOrEqual(1);

  // The desk-less agent still shows "Working" in UI
  const desklessAgent = agents.find((a) => gs.agents[agentKey(a)]?.desk === null);
  if (desklessAgent) {
    const card = page.locator(cardSelector(desklessAgent));
    await expect(card.locator('.status')).toHaveText('Working');
  }
});

// ---------------------------------------------------------------------------
// State lifecycle (tests 4–6)
// ---------------------------------------------------------------------------

test('agent transitions working → idle → error → offline', async ({ page }) => {
  const agent = 'lifecycle-agent';
  const key = agentKey(agent);

  await page.goto(`http://localhost:${serverPort}`);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });

  await heartbeat(serverPort, agent, 'working');

  const card = page.locator(cardSelector(agent));
  await expect(card.locator('.status')).toHaveText('Working', { timeout: 5000 });

  // Verify citizen is visible
  await waitForCitizen(page, key, 15_000);
  let c = (await getCitizens(page)).find((c) => c.agentId === key)!;
  expect(c.visible).toBe(true);

  // → idle
  await postEvent(serverPort, {
    type: 'agent:idle',
    source: SOURCE,
    agent,
    data: {},
  });
  await expect(card.locator('.status')).toHaveText('Idle', { timeout: 5000 });
  c = (await getCitizens(page)).find((c) => c.agentId === key)!;
  expect(c.visible).toBe(true);

  // → error
  await postEvent(serverPort, {
    type: 'agent:error',
    source: SOURCE,
    agent,
    data: { error: 'something broke' },
  });
  await expect(card.locator('.status')).toHaveText('Error', { timeout: 5000 });
  c = (await getCitizens(page)).find((c) => c.agentId === key)!;
  expect(c.visible).toBe(true);

  // → offline (idle with session_ended)
  await postEvent(serverPort, {
    type: 'agent:idle',
    source: SOURCE,
    agent,
    data: { reason: 'session_ended' },
  });
  await expect(card.locator('.status')).toHaveText('Offline', { timeout: 5000 });

  // Citizen becomes invisible
  await expect(async () => {
    const cit = (await getCitizens(page)).find((c) => c.agentId === key);
    expect(cit?.visible).toBe(false);
  }).toPass({ timeout: 5000 });
});

test('agent goes offline and comes back online', async ({ page }) => {
  const agent = 'comeback-agent';
  const key = agentKey(agent);

  await page.goto(`http://localhost:${serverPort}`);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });

  await heartbeat(serverPort, agent, 'working');

  const card = page.locator(cardSelector(agent));
  await expect(card.locator('.status')).toHaveText('Working', { timeout: 5000 });

  // Wait for citizen to fully spawn before going offline
  await waitForCitizen(page, key, 15_000);

  // Go offline
  await postEvent(serverPort, {
    type: 'agent:idle',
    source: SOURCE,
    agent,
    data: { reason: 'session_ended' },
  });
  await expect(card.locator('.status')).toHaveText('Offline', { timeout: 5000 });

  // Citizen becomes invisible (or removed from engine)
  await expect(async () => {
    const cit = (await getCitizens(page)).find((c) => c.agentId === key);
    // Either invisible or fully removed from engine
    expect(!cit || cit.visible === false).toBe(true);
  }).toPass({ timeout: 5000 });

  // Come back online
  await heartbeat(serverPort, agent, 'working');
  await expect(card.locator('.status')).toHaveText('Working', { timeout: 5000 });

  // Citizen visible again (may be re-spawned)
  await expect(async () => {
    const cit = (await getCitizens(page)).find((c) => c.agentId === key);
    expect(cit?.visible).toBe(true);
  }).toPass({ timeout: 10_000 });

  // Still in game state
  const gs = await getGameState(serverPort);
  expect(gs.agents[key]).toBeDefined();
});

test('rapid state changes don\'t crash the UI', async ({ page }) => {
  const agent = 'rapid-agent';

  await page.goto(`http://localhost:${serverPort}`);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });

  await heartbeat(serverPort, agent, 'working');
  await expect(page.locator(cardSelector(agent))).toBeVisible({ timeout: 5000 });

  // Collect JS errors
  const errors: Error[] = [];
  page.on('pageerror', (err) => errors.push(err));

  // Rapid alternating state changes
  const states = ['working', 'idle', 'error', 'working', 'idle', 'working', 'error', 'idle', 'working', 'working'];
  for (const state of states) {
    if (state === 'idle') {
      await postEvent(serverPort, { type: 'agent:idle', source: SOURCE, agent, data: {} });
    } else if (state === 'error') {
      await postEvent(serverPort, { type: 'agent:error', source: SOURCE, agent, data: { error: 'test' } });
    } else {
      await heartbeat(serverPort, agent, state);
    }
  }

  await page.waitForTimeout(2000);

  // WS still connected
  await expect(page.locator('#connection-status')).toHaveText('Connected');
  // No JS errors
  expect(errors).toHaveLength(0);
  // Agent card still exists
  await expect(page.locator(cardSelector(agent))).toBeVisible();
});

// ---------------------------------------------------------------------------
// Sub-agents (test 7)
// ---------------------------------------------------------------------------

test('sub-agent spawn and end lifecycle', async ({ page }) => {
  const parent = 'parent-agent';

  await page.goto(`http://localhost:${serverPort}`);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });

  await heartbeat(serverPort, parent, 'working');
  await expect(page.locator(cardSelector(parent))).toBeVisible({ timeout: 5000 });

  // Sub-agent wrap should be hidden initially
  await expect(page.locator('#hud-subagents-wrap')).toBeHidden();

  // Spawn child-001 — server stores as test/child-001
  await postEvent(serverPort, {
    type: 'agent:spawned',
    source: SOURCE,
    agent: parent,
    data: { child: 'child-001', name: 'child-001' },
  });

  // Sub-agent counter becomes visible with "1"
  await expect(page.locator('#hud-subagents-wrap')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#hud-subagents')).toHaveText('1', { timeout: 5000 });

  // Child card appears — key is test/child-001
  await expect(page.locator(`[data-agent="${agentKey('child-001')}"]`)).toBeVisible({ timeout: 5000 });

  // Spawn child-002
  await postEvent(serverPort, {
    type: 'agent:spawned',
    source: SOURCE,
    agent: parent,
    data: { child: 'child-002', name: 'child-002' },
  });

  await expect(page.locator('#hud-subagents')).toHaveText('2', { timeout: 5000 });

  // End child-001
  await postEvent(serverPort, {
    type: 'agent:spawn-ended',
    source: SOURCE,
    agent: parent,
    data: { child: 'child-001' },
  });

  // child-001 card goes offline
  await expect(page.locator(`[data-agent="${agentKey('child-001')}"] .status`)).toHaveText('Offline', { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Citizen walking & separation (tests 8–9)
// ---------------------------------------------------------------------------

test('idle citizen begins walking (isMoving transitions)', async ({ page }) => {
  const agent = 'walker-agent';
  const key = agentKey(agent);

  await page.goto(`http://localhost:${serverPort}`);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });

  await heartbeat(serverPort, agent, 'working');
  await waitForCitizen(page, key, 15_000);

  // Transition to idle — idle citizens wander
  await postEvent(serverPort, {
    type: 'agent:idle',
    source: SOURCE,
    agent,
    data: {},
  });

  // Wait up to 15s for isMoving to become true at least once
  let sawMoving = false;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const c = (await getCitizens(page)).find((c) => c.agentId === key);
    if (c?.moving) {
      sawMoving = true;
      break;
    }
    await page.waitForTimeout(500);
  }

  expect(sawMoving).toBe(true);
});

test('citizens maintain separation — no tile overlap with 6 agents', async ({ page }) => {
  await page.goto(`http://localhost:${serverPort}`);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });

  // Register after page load so auto-spawn reserves unique tiles
  const agents = ['sep-a', 'sep-b', 'sep-c', 'sep-d', 'sep-e', 'sep-f'];
  for (const a of agents) {
    await heartbeat(serverPort, a, 'idle');
  }

  // Wait for all 6 citizens
  for (const a of agents) {
    await waitForCitizen(page, agentKey(a), 15_000);
  }

  // Allow settling
  await page.waitForTimeout(3000);

  const citizens = await getCitizens(page);
  const keys = agents.map(agentKey);
  const matched = citizens.filter((c) => keys.includes(c.agentId));
  expect(matched.length).toBe(6);

  // No two share exact tile position
  const positions = new Set(matched.map((c) => `${c.tileX},${c.tileY}`));
  expect(positions.size).toBe(matched.length);
});

// ---------------------------------------------------------------------------
// Shop UI (tests 10–11)
// ---------------------------------------------------------------------------

test('shop panel opens with catalog and shows correct items', async ({ page }) => {
  await page.goto(`http://localhost:${serverPort}`);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });

  // Click shop button
  await page.locator('#shop-btn').click();

  // Panel opens
  await expect(page.locator('#shop-panel')).toHaveClass(/open/, { timeout: 3000 });

  // Tabs rendered
  await expect(page.locator('#shop-tabs')).not.toBeEmpty();

  // Item cards with name and price
  await expect(page.locator('.item-name').first()).toBeVisible({ timeout: 3000 });
  await expect(page.locator('.item-price').first()).toBeVisible();

  // Buy buttons exist
  await expect(page.locator('.buy-btn').first()).toBeVisible();

  // Close shop
  await page.locator('#shop-close').click();
  await expect(page.locator('#shop-panel')).not.toHaveClass(/open/);
});

test('buy fails with insufficient coins', async () => {
  // expand_room costs 5000 — always unaffordable at this point
  const res = await fetch(`http://localhost:${serverPort}/api/shop/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalogId: 'expand_room' }),
  });

  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error).toMatch(/[Ii]nsufficient/);
});

// ---------------------------------------------------------------------------
// Item placement & removal (tests 12–17)
// ---------------------------------------------------------------------------

test('buy a decoration and see it in inventory as unplaced', async ({ page }) => {
  // Earn enough coins for deco_plant (100 coins) — pr_merged ≈ 110
  await earnCoins(serverPort, 'shop-tester', 1);

  // Buy deco_plant via API
  const buyRes = await fetch(`http://localhost:${serverPort}/api/shop/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalogId: 'deco_plant' }),
  });
  expect(buyRes.ok).toBe(true);
  const buyData = await buyRes.json();
  expect(buyData.success).toBe(true);

  // Navigate and open inventory
  await page.goto(`http://localhost:${serverPort}`);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });
  await page.locator('#inv-btn').click();
  await expect(page.locator('#inv-panel')).toHaveClass(/open/, { timeout: 3000 });

  // Should show item under "Unplaced" with a "Place" button
  await expect(page.locator('#inv-items').getByText('deco_plant').first()).toBeVisible({ timeout: 3000 });
  await expect(page.locator('.place-btn').first()).toBeVisible();
});

test('place item via API — confirms in game state', async () => {
  // Earn and buy a decoration
  await earnCoins(serverPort, 'placer-agent', 2);

  const buyRes = await fetch(`http://localhost:${serverPort}/api/shop/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalogId: 'deco_plant' }),
  });
  const buyData = await buyRes.json();
  expect(buyData.success).toBe(true);
  const itemId = buyData.item.id;

  // Place at (5, 5) in room_0
  const placeRes = await fetch(`http://localhost:${serverPort}/api/shop/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, roomId: 'room_0', x: 5, y: 5 }),
  });
  expect(placeRes.ok).toBe(true);
  const placeData = await placeRes.json();
  expect(placeData.success).toBe(true);

  // Verify in game state
  const gs = await getGameState(serverPort);
  const item = gs.inventory.find((i: any) => i.id === itemId);
  expect(item.placed).toBe(true);
  expect(item.placedAt).toEqual({ roomId: 'room_0', x: 5, y: 5 });
});

test('place fails — occupied position', async () => {
  // Buy 2 plants
  await earnCoins(serverPort, 'overlap-agent', 3);

  const buy1 = await (await fetch(`http://localhost:${serverPort}/api/shop/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalogId: 'deco_plant' }),
  })).json();
  expect(buy1.success).toBe(true);

  const buy2 = await (await fetch(`http://localhost:${serverPort}/api/shop/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalogId: 'deco_plant' }),
  })).json();
  expect(buy2.success).toBe(true);

  // Place first at (3, 1)
  const place1 = await fetch(`http://localhost:${serverPort}/api/shop/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId: buy1.item.id, roomId: 'room_0', x: 3, y: 1 }),
  });
  expect(place1.ok).toBe(true);

  // Place second at same position — should fail
  const place2 = await fetch(`http://localhost:${serverPort}/api/shop/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId: buy2.item.id, roomId: 'room_0', x: 3, y: 1 }),
  });
  expect(place2.status).toBe(400);
  const body = await place2.json();
  expect(body.success).toBe(false);
  expect(body.error).toMatch(/[Oo]ccupied|[Pp]osition/);
});

test('place fails — out of bounds', async () => {
  await earnCoins(serverPort, 'bounds-agent', 2);

  const buy = await (await fetch(`http://localhost:${serverPort}/api/shop/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalogId: 'deco_plant' }),
  })).json();
  expect(buy.success).toBe(true);

  // Room is 12×8, so (99, 99) is out of bounds
  const place = await fetch(`http://localhost:${serverPort}/api/shop/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId: buy.item.id, roomId: 'room_0', x: 99, y: 99 }),
  });
  expect(place.status).toBe(400);
  const body = await place.json();
  expect(body.success).toBe(false);
  expect(body.error).toMatch(/[Bb]ounds|[Oo]ut of/);
});

test('unplace a desk clears agent desk assignment', async () => {
  // Earn enough for a desk_basic (200 coins) — ~2 pr_merged
  await earnCoins(serverPort, 'desk-unplace-agent', 3);

  // Buy desk
  const buy = await (await fetch(`http://localhost:${serverPort}/api/shop/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalogId: 'desk_basic' }),
  })).json();
  expect(buy.success).toBe(true);
  const deskItemId = buy.item.id;

  // Place desk at (9, 3)
  const place = await fetch(`http://localhost:${serverPort}/api/shop/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId: deskItemId, roomId: 'room_0', x: 9, y: 3 }),
  });
  expect(place.ok).toBe(true);

  // Send heartbeat for new agent — should get assigned to this desk
  const deskAgent = 'new-desk-occupant';
  await heartbeat(serverPort, deskAgent, 'working');

  // Verify agent got assigned the desk
  const deskAgentKey = agentKey(deskAgent);
  await expect(async () => {
    const gs = await getGameState(serverPort);
    expect(gs.agents[deskAgentKey]?.desk).toBe(deskItemId);
  }).toPass({ timeout: 5000 });

  // Unplace the desk
  const unplace = await fetch(`http://localhost:${serverPort}/api/shop/unplace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId: deskItemId }),
  });
  expect(unplace.ok).toBe(true);

  // Verify: item unplaced, agent desk cleared
  const gs = await getGameState(serverPort);
  const deskItem = gs.inventory.find((i: any) => i.id === deskItemId);
  expect(deskItem.placed).toBe(false);
  expect(gs.agents[deskAgentKey]?.desk).toBeNull();
});

test('inventory UI — unplace button moves item to unplaced section', async ({ page }) => {
  // Ensure we have a placed item — buy and place a decoration
  await earnCoins(serverPort, 'inv-ui-agent', 2);

  const buy = await (await fetch(`http://localhost:${serverPort}/api/shop/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalogId: 'deco_plant' }),
  })).json();
  expect(buy.success).toBe(true);

  const place = await fetch(`http://localhost:${serverPort}/api/shop/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId: buy.item.id, roomId: 'room_0', x: 10, y: 6 }),
  });
  expect(place.ok).toBe(true);

  // Navigate, open inventory
  await page.goto(`http://localhost:${serverPort}`);
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 5000 });
  await page.locator('#inv-btn').click();
  await expect(page.locator('#inv-panel')).toHaveClass(/open/, { timeout: 3000 });

  // Should have Placed section with unplace buttons
  await expect(page.locator('.unplace-btn').first()).toBeVisible({ timeout: 3000 });

  // Click the first unplace button
  await page.locator('.unplace-btn').first().click();

  // Toast "Item removed" appears
  await expect(page.locator('#toast-container')).toContainText('Item removed', { timeout: 3000 });

  // Inventory refreshes — the unplaced count should have incremented
  await expect(async () => {
    const unplacedText = await page.locator('#inv-items').getByText(/^Unplaced/).textContent();
    expect(unplacedText).toBeTruthy();
  }).toPass({ timeout: 5000 });
});
