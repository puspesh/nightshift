#!/usr/bin/env node
/**
 * agentville-dev — Start the Agentville server + UI with mock agent activity.
 *
 * Usage:
 *   npx tsx scripts/agentville-dev.ts [--port 4321] [--agents 4] [--no-browser]
 *
 * This spins up the full Agentville server and feeds it a stream of realistic
 * mock events so you can iterate on the UI without running real Nightshift teams.
 *
 * Press Ctrl-C to stop.  The world state is saved to ~/.agentville/ as usual.
 */

import { existsSync, mkdirSync, symlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { AgentvilleServer } from '../lib/agentville/server/server.js';
import { loadWorld, saveWorld, bootstrapWorld, ensureStarterItems } from '../lib/agentville/persistence.js';
import { evaluateStreak } from '../lib/agentville/streak.js';
import type { AgentvilleWorld } from '../lib/agentville/schema.js';
import type { AgentvilleEvent } from '../lib/agentville/event-types.js';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function flag(name: string): boolean { return args.includes(name); }
function opt(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const PORT = parseInt(opt('--port', '4321'), 10);
const AGENT_COUNT = parseInt(opt('--agents', '4'), 10);
const NO_BROWSER = flag('--no-browser');

// ---------------------------------------------------------------------------
// Mock agent definitions
// ---------------------------------------------------------------------------
interface MockAgent {
  id: string;
  name: string;
  color: string;
  role: string;
  tasks: string[];
  workTypes: string[];
}

const AGENT_POOL: MockAgent[] = [
  {
    id: 'ns-dev-producer',
    name: 'Producer',
    color: '#f59e0b',
    role: 'producer',
    tasks: [
      'Triaging issue #142: API rate limiting',
      'Reviewing team backlog',
      'Assigning issue #156 to coder-1',
      'Checking CI pipeline status',
      'Prioritizing bug reports',
      'Writing sprint summary',
    ],
    workTypes: ['issue_triaged'],
  },
  {
    id: 'ns-dev-planner',
    name: 'Planner',
    color: '#3b82f6',
    role: 'planner',
    tasks: [
      'Writing plan for SSO auth integration',
      'Exploring codebase for migration paths',
      'Drafting API schema for v2 endpoints',
      'Analyzing dependency graph',
      'Designing database schema changes',
      'Mapping component architecture',
    ],
    workTypes: ['plan_written'],
  },
  {
    id: 'ns-dev-reviewer',
    name: 'Reviewer',
    color: '#8b5cf6',
    role: 'reviewer',
    tasks: [
      'Reviewing PR #87: Add auth middleware',
      'Code review: refactor payment module',
      'Reviewing plan: database migration',
      'Checking test coverage for PR #92',
      'Security review of API endpoints',
      'Reviewing documentation updates',
    ],
    workTypes: ['review_completed'],
  },
  {
    id: 'ns-dev-coder-1',
    name: 'Coder 1',
    color: '#10b981',
    role: 'coder',
    tasks: [
      'Implementing auth middleware',
      'Fixing race condition in queue worker',
      'Adding pagination to /api/users',
      'Refactoring database connection pool',
      'Building webhook retry logic',
      'Updating error handling patterns',
    ],
    workTypes: ['pr_merged'],
  },
  {
    id: 'ns-dev-coder-2',
    name: 'Coder 2',
    color: '#06b6d4',
    role: 'coder',
    tasks: [
      'Building notification service',
      'Migrating to new ORM syntax',
      'Adding rate limiter middleware',
      'Implementing file upload endpoint',
      'Creating admin dashboard API',
      'Fixing timezone handling in scheduler',
    ],
    workTypes: ['pr_merged'],
  },
  {
    id: 'ns-dev-tester',
    name: 'Tester',
    color: '#ef4444',
    role: 'tester',
    tasks: [
      'Running integration test suite',
      'Testing auth flow edge cases',
      'Verifying API backward compatibility',
      'Load testing /api/events endpoint',
      'Testing error recovery scenarios',
      'Validating database migration rollback',
    ],
    workTypes: ['test_passed'],
  },
];

// ---------------------------------------------------------------------------
// Randomness helpers
// ---------------------------------------------------------------------------
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randBetween(min: number, max: number): number { return min + Math.random() * (max - min); }

// ---------------------------------------------------------------------------
// Mock event generator
// ---------------------------------------------------------------------------
class MockEventGenerator {
  private agents: MockAgent[];
  private agentStates: Map<string, string> = new Map();
  private port: number;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private running = false;

  constructor(agents: MockAgent[], port: number) {
    this.agents = agents;
    this.port = port;
  }

  start() {
    this.running = true;
    console.log(`  Mock engine: ${this.agents.length} agents will generate events\n`);

    // Stagger agent spawns over 3-8 seconds so they don't all appear at once
    for (let i = 0; i < this.agents.length; i++) {
      const delay = i * randBetween(800, 2000);
      const timer = setTimeout(() => {
        if (!this.running) return;
        this.spawnAgent(this.agents[i]);
        this.scheduleAgentLoop(this.agents[i]);
      }, delay);
      this.timers.push(timer);
    }

    // Occasional sub-agent spawns
    this.scheduleSubagentEvents();
  }

  stop() {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private async post(event: AgentvilleEvent) {
    try {
      await fetch(`http://localhost:${this.port}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    } catch {
      // Server might not be ready yet; silent fail
    }
  }

  private spawnAgent(agent: MockAgent) {
    this.agentStates.set(agent.id, 'working');
    this.post({
      type: 'agent:heartbeat',
      source: 'nightshift',
      agent: agent.id,
      data: {
        state: 'working',
        name: agent.name,
        color: agent.color,
        task: pick(agent.tasks),
        energy: 0.8 + Math.random() * 0.2,
      },
    });
    console.log(`    [mock] ${agent.name} spawned`);
  }

  private scheduleAgentLoop(agent: MockAgent) {
    if (!this.running) return;

    // Each agent cycles: working (8-25s) -> thinking (3-8s) -> work:completed -> new task
    // Occasionally goes idle/sleeping for variety
    const cycleTime = randBetween(8000, 25000);

    const timer = setTimeout(() => {
      if (!this.running) return;
      this.runAgentCycle(agent);
    }, cycleTime);
    this.timers.push(timer);
  }

  private async runAgentCycle(agent: MockAgent) {
    if (!this.running) return;

    const roll = Math.random();

    if (roll < 0.20) {
      // 20% chance: go idle briefly
      this.agentStates.set(agent.id, 'idle');
      await this.post({
        type: 'agent:heartbeat',
        source: 'nightshift',
        agent: agent.id,
        data: { state: 'idle', task: null },
      });

      const idleDuration = randBetween(8000, 20000);
      const timer = setTimeout(() => {
        if (!this.running) return;
        // Come back to working
        this.agentStates.set(agent.id, 'working');
        this.post({
          type: 'agent:heartbeat',
          source: 'nightshift',
          agent: agent.id,
          data: {
            state: 'working',
            task: pick(agent.tasks),
            energy: 0.6 + Math.random() * 0.4,
          },
        });
        this.scheduleAgentLoop(agent);
      }, idleDuration);
      this.timers.push(timer);
      return;
    }

    if (roll < 0.35) {
      // 15% chance: sleeping
      this.agentStates.set(agent.id, 'sleeping');
      await this.post({
        type: 'agent:heartbeat',
        source: 'nightshift',
        agent: agent.id,
        data: { state: 'sleeping', task: null },
      });

      const sleepDuration = randBetween(10000, 25000);
      const timer = setTimeout(() => {
        if (!this.running) return;
        this.agentStates.set(agent.id, 'working');
        this.post({
          type: 'agent:heartbeat',
          source: 'nightshift',
          agent: agent.id,
          data: {
            state: 'working',
            task: pick(agent.tasks),
            energy: 0.9 + Math.random() * 0.1,
          },
        });
        this.scheduleAgentLoop(agent);
      }, sleepDuration);
      this.timers.push(timer);
      return;
    }

    if (roll < 0.42) {
      // 7% chance: brief error
      await this.post({
        type: 'agent:error',
        source: 'nightshift',
        agent: agent.id,
        data: {
          error: pick([
            'Rate limit exceeded',
            'Git conflict detected',
            'Build failed: type error',
            'Test timeout after 30s',
            'API returned 503',
          ]),
          tool: pick(['Bash', 'Edit', 'Read', 'Grep', 'Write']),
        },
      });

      // Recover after a beat
      const recovery = randBetween(3000, 8000);
      const timer = setTimeout(() => {
        if (!this.running) return;
        this.post({
          type: 'agent:heartbeat',
          source: 'nightshift',
          agent: agent.id,
          data: {
            state: 'working',
            task: pick(agent.tasks),
            energy: 0.5 + Math.random() * 0.3,
          },
        });
        this.scheduleAgentLoop(agent);
      }, recovery);
      this.timers.push(timer);
      return;
    }

    // Normal cycle: thinking -> work completed -> new task
    // Thinking phase
    await this.post({
      type: 'agent:heartbeat',
      source: 'nightshift',
      agent: agent.id,
      data: { state: 'thinking', task: this.agentStates.get(agent.id) === 'working' ? undefined : pick(agent.tasks) },
    });

    const thinkTime = randBetween(2000, 6000);
    const timer = setTimeout(async () => {
      if (!this.running) return;

      // Emit work:completed
      await this.post({
        type: 'work:completed',
        source: 'nightshift',
        agent: agent.id,
        data: {
          workType: pick(agent.workTypes),
          description: pick(agent.tasks),
        },
      });

      // Small pause then start new task
      const pauseTimer = setTimeout(() => {
        if (!this.running) return;
        this.agentStates.set(agent.id, 'working');
        this.post({
          type: 'agent:heartbeat',
          source: 'nightshift',
          agent: agent.id,
          data: {
            state: 'working',
            task: pick(agent.tasks),
            energy: Math.min(1, 0.4 + Math.random() * 0.6),
          },
        });
        this.scheduleAgentLoop(agent);
      }, randBetween(1000, 3000));
      this.timers.push(pauseTimer);
    }, thinkTime);
    this.timers.push(timer);
  }

  private scheduleSubagentEvents() {
    if (!this.running) return;

    // Spawn a sub-agent every 30-90 seconds
    const delay = randBetween(30000, 90000);
    const timer = setTimeout(async () => {
      if (!this.running) return;

      const parent = pick(this.agents);
      const childId = `${parent.id}/sub-${Date.now()}`;

      await this.post({
        type: 'agent:spawned',
        source: 'nightshift',
        agent: parent.id,
        data: {
          parent: parent.id,
          child: childId,
          task: pick(parent.tasks),
        },
      });

      // Sub-agent heartbeats for a bit then ends
      await this.post({
        type: 'agent:heartbeat',
        source: 'nightshift',
        agent: childId,
        data: {
          state: 'working',
          name: `${parent.name} (sub)`,
          task: pick(parent.tasks),
        },
      });

      const subLifetime = randBetween(10000, 30000);
      const endTimer = setTimeout(async () => {
        if (!this.running) return;
        await this.post({
          type: 'agent:spawn-ended',
          source: 'nightshift',
          agent: parent.id,
          data: { parent: parent.id, child: childId },
        });
        await this.post({
          type: 'agent:idle',
          source: 'nightshift',
          agent: childId,
          data: { reason: 'session_ended' },
        });
      }, subLifetime);
      this.timers.push(endTimer);

      this.scheduleSubagentEvents();
    }, delay);
    this.timers.push(timer);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function main() {
  // Load or bootstrap world (same logic as real CLI)
  const agentvilleDir = join(homedir(), '.agentville');
  mkdirSync(agentvilleDir, { recursive: true });

  let gameState: AgentvilleWorld | null = loadWorld(agentvilleDir);
  if (!gameState) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    gameState = bootstrapWorld(timezone);
    saveWorld(agentvilleDir, gameState);
    console.log('  Bootstrapped new Agentville world');
  }
  if (ensureStarterItems(gameState)) {
    saveWorld(agentvilleDir, gameState);
  }
  const streakResult = evaluateStreak(gameState.stats);
  gameState.stats.streakDays = streakResult.streakDays;
  gameState.stats.lastActiveDate = streakResult.lastActiveDate;
  saveWorld(agentvilleDir, gameState);

  // Resolve paths for the server.
  // The server uses publicDir for:
  //   - Core JS bundle: path.join(publicDir, '..', 'core', 'agentville-core.js')
  //   - World data: publicDir/world.json (loadGlobalWorld)
  //   - Static assets: /worlds/* and /universal_assets/* resolve via publicDir
  //
  // We create a dev runtime directory at ~/.agentville/dev/ with:
  //   - world.json symlinked from base-world.json (full world with tiles/sprites)
  //   - Symlinks to world_assets/ and universal_assets/ from source
  //   - ../core/agentville-core.js symlinked to the built bundle
  const __filename = fileURLToPath(import.meta.url);
  const projectRoot = resolve(dirname(__filename), '..');
  const sourceWorldDir = join(projectRoot, 'worlds', 'agentville');
  const coreBundleSrc = join(projectRoot, 'lib', 'agentville', 'core', 'dist', 'agentville-core.js');

  if (!existsSync(coreBundleSrc)) {
    console.error('  Core bundle not found. Run `npm run build:core` first.');
    process.exit(1);
  }

  // Set up dev runtime directory
  const devDir = join(homedir(), '.agentville', 'dev');
  const devCoreDir = join(homedir(), '.agentville', 'core');
  mkdirSync(devDir, { recursive: true });
  mkdirSync(devCoreDir, { recursive: true });

  // Symlink world.json → base-world.json (full world data with tiles, floor, props)
  const devWorldJson = join(devDir, 'world.json');
  const baseWorldJson = join(sourceWorldDir, 'base-world.json');
  if (!existsSync(devWorldJson) && existsSync(baseWorldJson)) {
    symlinkSync(baseWorldJson, devWorldJson);
  }

  // Symlink world_assets/ and universal_assets/ for tile/sprite images
  for (const dir of ['world_assets', 'universal_assets']) {
    const link = join(devDir, dir);
    const target = join(sourceWorldDir, dir);
    if (!existsSync(link) && existsSync(target)) {
      symlinkSync(target, link);
    }
  }

  // Symlink core bundle (server resolves: devDir/../core/agentville-core.js)
  const coreBundleLink = join(devCoreDir, 'agentville-core.js');
  if (!existsSync(coreBundleLink)) {
    symlinkSync(coreBundleSrc, coreBundleLink);
  }

  // Start server
  const server = new AgentvilleServer({
    port: PORT,
    publicDir: devDir,
    devMode: true,
    async onRoute(req, res, url) {
      if (req.method === 'POST' && url.pathname === '/api/world/save') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        try {
          const raw = readFileSync(baseWorldJson, 'utf-8');
          const world = JSON.parse(raw);
          if (body.props) world.props = body.props;
          if (body.wanderPoints) world.wanderPoints = body.wanderPoints;
          writeFileSync(baseWorldJson, JSON.stringify(world, null, 2) + '\n');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return true;
      }
      return false;
    },
  });
  server.setGameState(gameState);
  server.onMutation(() => {
    const state = server.getGameState();
    if (state) saveWorld(agentvilleDir, state);
  });

  const actualPort = await server.start();

  const url = `http://localhost:${actualPort}`;
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║     A G E N T V I L L E   D E V      ║');
  console.log('  ╠══════════════════════════════════════╣');
  console.log(`  ║  Server:  ${url.padEnd(26)}║`);
  console.log(`  ║  Agents:  ${String(AGENT_COUNT).padEnd(26)}║`);
  console.log('  ║  Mode:    mock events                ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log('  Agents cycle through working/thinking/idle states.');
  console.log('  Work events earn coins. Sub-agents spawn periodically.');
  console.log('  Use the UI shop, place items, and interact normally.');
  console.log('  Press Ctrl-C to stop.\n');

  // Select agents
  const activeAgents = AGENT_POOL.slice(0, Math.min(AGENT_COUNT, AGENT_POOL.length));

  // Start mock event generator
  const mock = new MockEventGenerator(activeAgents, actualPort);

  // Small delay to let server fully initialize
  setTimeout(() => mock.start(), 500);

  // Open browser
  if (!NO_BROWSER) {
    const { exec } = await import('node:child_process');
    const url = `http://localhost:${actualPort}`;
    const cmd = process.platform === 'darwin' ? `open "${url}"`
      : process.platform === 'win32' ? `start "${url}"`
      : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n  Shutting down Agentville Dev...');
    mock.stop();
    const state = server.getGameState();
    if (state) saveWorld(agentvilleDir, state);
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start Agentville Dev:', err);
  process.exit(1);
});
