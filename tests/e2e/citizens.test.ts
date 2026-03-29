import { test, expect } from '@playwright/test';
import { startTestServer, sendHeartbeat, collectConsoleLogs, createTestWorld } from './helpers.js';
import type { MiniverseServer } from '../../lib/miniverse/server/server.js';

let server: MiniverseServer;
let baseUrl: string;
let cleanup: () => void;

test.beforeAll(async () => {
  const world = createTestWorld('test-repo', 'test');
  cleanup = world.cleanup;
  const started = await startTestServer(world.publicDir);
  server = started.server;
  baseUrl = started.baseUrl;
});

test.afterAll(async () => {
  server?.stop();
  cleanup?.();
});

test.beforeEach(async ({ page }) => {
  // Stub all PNG requests to prevent 404 errors from sprite loading
  await page.route('**/*.png', (route) =>
    route.fulfill({ body: Buffer.alloc(0), contentType: 'image/png' })
  );
});

/** Wait for a specific console log prefix to appear, with timeout. */
async function waitForLog(page: import('@playwright/test').Page, logs: string[], minCount: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (logs.length < minCount && Date.now() < deadline) {
    await page.waitForTimeout(100);
  }
  expect(logs.length).toBeGreaterThanOrEqual(minCount);
}

test('citizens appear in status panel after heartbeat', async ({ page }) => {
  const wsLogs = collectConsoleLogs(page, '[nightshift:ws:connected]');
  await page.goto(`${baseUrl}?world=test-repo/test&debug=true`);
  await waitForLog(page, wsLogs, 1);

  await sendHeartbeat(baseUrl, { agent: 'ns-test-producer', name: 'Producer', state: 'idle' });
  await sendHeartbeat(baseUrl, { agent: 'ns-test-planner', name: 'Planner', state: 'working', task: 'Planning' });
  await sendHeartbeat(baseUrl, { agent: 'ns-test-coder', name: 'Coder', state: 'thinking' });

  // Wait for cards to appear
  await expect(page.locator('.agent-card')).toHaveCount(3, { timeout: 10_000 });

  // Verify each card has correct state
  const producerCard = page.locator('[data-agent="ns-test-producer"]');
  await expect(producerCard.locator('.status')).toHaveText('Idle');

  const plannerCard = page.locator('[data-agent="ns-test-planner"]');
  await expect(plannerCard.locator('.status')).toHaveText('Working');
  await expect(plannerCard.locator('.task')).toHaveText('Planning');

  const coderCard = page.locator('[data-agent="ns-test-coder"]');
  await expect(coderCard.locator('.status')).toHaveText('Thinking');
});

test('citizen spawn events are logged to console', async ({ page }) => {
  const spawnLogs = collectConsoleLogs(page, '[nightshift:citizen:spawn]');
  const wsLogs = collectConsoleLogs(page, '[nightshift:ws:connected]');
  await page.goto(`${baseUrl}?world=test-repo/test&debug=true`);
  await waitForLog(page, wsLogs, 1);

  await sendHeartbeat(baseUrl, { agent: 'ns-test-producer', name: 'Producer', state: 'idle' });
  await waitForLog(page, spawnLogs, 1);

  const payload = JSON.parse(spawnLogs[0].replace('[nightshift:citizen:spawn] ', ''));
  expect(payload.agentId).toBe('ns-test-producer');
  expect(payload.state).toBe('idle');
});

test('state change events are logged to console', async ({ page }) => {
  const spawnLogs = collectConsoleLogs(page, '[nightshift:citizen:spawn]');
  const stateLogs = collectConsoleLogs(page, '[nightshift:citizen:state]');
  const wsLogs = collectConsoleLogs(page, '[nightshift:ws:connected]');
  await page.goto(`${baseUrl}?world=test-repo/test&debug=true`);
  await waitForLog(page, wsLogs, 1);

  // First heartbeat — spawn
  await sendHeartbeat(baseUrl, { agent: 'ns-test-producer', name: 'Producer', state: 'idle' });
  await waitForLog(page, spawnLogs, 1);

  // Second heartbeat — state change
  await sendHeartbeat(baseUrl, { agent: 'ns-test-producer', name: 'Producer', state: 'working', task: 'Using Bash' });
  await waitForLog(page, stateLogs, 1);

  const payload = JSON.parse(stateLogs[0].replace('[nightshift:citizen:state] ', ''));
  expect(payload.agentId).toBe('ns-test-producer');
  expect(payload.from).toBe('idle');
  expect(payload.to).toBe('working');
  expect(payload.task).toBe('Using Bash');
});

test('status panel updates on state change', async ({ page }) => {
  const wsLogs = collectConsoleLogs(page, '[nightshift:ws:connected]');
  await page.goto(`${baseUrl}?world=test-repo/test&debug=true`);
  await waitForLog(page, wsLogs, 1);

  // Initial state
  await sendHeartbeat(baseUrl, { agent: 'ns-test-producer', name: 'Producer', state: 'idle' });
  const card = page.locator('[data-agent="ns-test-producer"]');
  await expect(card.locator('.status')).toHaveText('Idle', { timeout: 10_000 });

  // Change to working
  await sendHeartbeat(baseUrl, { agent: 'ns-test-producer', name: 'Producer', state: 'working', task: 'Reading files' });
  await expect(card.locator('.status')).toHaveText('Working', { timeout: 5_000 });
  await expect(card.locator('.task')).toHaveText('Reading files');

  // Change to thinking
  await sendHeartbeat(baseUrl, { agent: 'ns-test-producer', name: 'Producer', state: 'thinking' });
  await expect(card.locator('.status')).toHaveText('Thinking', { timeout: 5_000 });
});

test('multiple agents render independently', async ({ page }) => {
  const wsLogs = collectConsoleLogs(page, '[nightshift:ws:connected]');
  await page.goto(`${baseUrl}?world=test-repo/test&debug=true`);
  await waitForLog(page, wsLogs, 1);

  // Register 3 agents with different states
  await sendHeartbeat(baseUrl, { agent: 'ns-test-producer', name: 'Producer', state: 'idle' });
  await sendHeartbeat(baseUrl, { agent: 'ns-test-planner', name: 'Planner', state: 'working', task: 'Planning issue' });
  await sendHeartbeat(baseUrl, { agent: 'ns-test-coder', name: 'Coder', state: 'thinking' });

  await expect(page.locator('.agent-card')).toHaveCount(3, { timeout: 10_000 });

  // Change only one agent's state
  await sendHeartbeat(baseUrl, { agent: 'ns-test-planner', name: 'Planner', state: 'idle' });

  // Verify only planner changed, others unchanged
  await expect(page.locator('[data-agent="ns-test-planner"] .status')).toHaveText('Idle', { timeout: 5_000 });
  await expect(page.locator('[data-agent="ns-test-producer"] .status')).toHaveText('Idle');
  await expect(page.locator('[data-agent="ns-test-coder"] .status')).toHaveText('Thinking');
});

test('canvas renders without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  const wsLogs = collectConsoleLogs(page, '[nightshift:ws:connected]');
  await page.goto(`${baseUrl}?world=test-repo/test&debug=true`);
  await waitForLog(page, wsLogs, 1);

  // Send heartbeats and wait for rendering
  await sendHeartbeat(baseUrl, { agent: 'ns-test-producer', name: 'Producer', state: 'idle' });
  await page.waitForTimeout(2000);

  // Canvas should exist
  const canvas = page.locator('#canvas-container canvas');
  await expect(canvas).toHaveCount(1, { timeout: 10_000 });

  // No console errors should have occurred
  expect(errors).toEqual([]);
});
