import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// CoinStackSystem is a canvas render layer — we test it in isolation
// without any DOM/canvas dependencies by exercising its data methods.
import { CoinStackSystem } from '../lib/agentville/core/src/effects/CoinStack.js';

describe('CoinStackSystem', () => {
  let system: CoinStackSystem;
  const collectCalls: Array<{ agentId: string; totalCount: number }> = [];

  beforeEach(() => {
    collectCalls.length = 0;
    system = new CoinStackSystem();
    system.onCollect((info) => {
      collectCalls.push({ agentId: info.agentId, totalCount: info.totalCount });
    });
  });

  describe('addStack', () => {
    it('creates a stack for an agent at the given position', () => {
      system.addStack('agent-1', 100, 200, 1);
      const stacks = system.getStacks();
      assert.equal(stacks.size, 1);
      const stack = stacks.get('agent-1')!;
      assert.equal(stack.x, 100);
      assert.equal(stack.y, 200);
      assert.equal(stack.totalCount, 1);
      assert.equal(stack.visualCount, 1);
    });

    it('increments visual count up to cap (5)', () => {
      for (let i = 0; i < 7; i++) {
        system.addStack('agent-1', 100, 200, 1);
      }
      const stack = system.getStacks().get('agent-1')!;
      assert.equal(stack.visualCount, 5, 'visual count should cap at 5');
      assert.equal(stack.totalCount, 7, 'total count should track all coins');
    });

    it('resets auto-collect timer on each new coin', () => {
      system.addStack('agent-1', 100, 200, 1);
      // Advance 30 seconds
      system.update(30);
      // Add another coin — timer should reset
      system.addStack('agent-1', 100, 200, 1);
      // Advance 40 more seconds (total 70s from first coin, but only 40s from second)
      system.update(40);
      // Stack should still be present (40s < 60s auto-collect threshold)
      const stacks = system.getStacks();
      assert.equal(stacks.size, 1, 'stack should still exist — timer was reset');
    });
  });

  describe('collectStack', () => {
    it('removes stack and returns coin info for animation', () => {
      system.addStack('agent-1', 100, 200, 3);
      const info = system.collectStack('agent-1');
      assert.ok(info, 'collectStack should return info');
      assert.equal(info!.x, 100);
      assert.equal(info!.y, 200);
      assert.equal(info!.totalCount, 3);
      // Stack should be marked as collecting
      const stacks = system.getStacks();
      const stack = stacks.get('agent-1');
      assert.ok(stack?.collecting, 'stack should be in collecting state');
    });

    it('returns null for unknown agent', () => {
      const info = system.collectStack('nonexistent');
      assert.equal(info, null);
    });
  });

  describe('collectAll', () => {
    it('returns all stacks and marks them as collecting', () => {
      system.addStack('agent-1', 100, 200, 2);
      system.addStack('agent-2', 300, 400, 5);
      system.addStack('agent-3', 500, 600, 1);
      const results = system.collectAll();
      assert.equal(results.length, 3);
      // All should be collecting
      for (const [, stack] of system.getStacks()) {
        assert.ok(stack.collecting);
      }
    });

    it('returns empty array when no stacks exist', () => {
      const results = system.collectAll();
      assert.equal(results.length, 0);
    });
  });

  describe('auto-collect', () => {
    it('starts fly animation after 60s then fires callback when animation completes', () => {
      system.addStack('agent-1', 100, 200, 3);
      // Advance past 60s — should start collecting animation, not fire callback yet
      system.update(61);
      assert.equal(collectCalls.length, 0, 'callback should not fire immediately — animation must play first');
      const stack = system.getStacks().get('agent-1');
      assert.ok(stack, 'stack should still exist during animation');
      assert.ok(stack!.collecting, 'stack should be in collecting state');
      // Advance past animation duration (0.5s)
      system.update(0.6);
      assert.equal(collectCalls.length, 1, 'callback should fire after animation completes');
      assert.equal(collectCalls[0].agentId, 'agent-1');
      assert.equal(collectCalls[0].totalCount, 3);
      // Stack should be removed after animation
      assert.equal(system.getStacks().size, 0, 'stack should be removed after animation');
    });

    it('does not trigger before 60s', () => {
      system.addStack('agent-1', 100, 200, 3);
      system.update(59);
      assert.equal(collectCalls.length, 0, 'should not auto-collect before 60s');
      const stacks = system.getStacks();
      assert.equal(stacks.size, 1, 'stack should still exist');
    });
  });

  describe('containsPoint', () => {
    it('detects click on stack area', () => {
      system.addStack('agent-1', 100, 200, 1);
      // Stack occupies a small area around (100, 200)
      const hit = system.containsPoint(105, 195);
      assert.ok(hit, 'point near stack should hit');
    });

    it('returns null for point outside stack bounds', () => {
      system.addStack('agent-1', 100, 200, 1);
      const hit = system.containsPoint(500, 500);
      assert.equal(hit, null, 'distant point should not hit');
    });

    it('returns the agentId of the hit stack', () => {
      system.addStack('agent-1', 100, 200, 1);
      const hit = system.containsPoint(105, 195);
      assert.equal(hit, 'agent-1');
    });
  });

  describe('collect animation lifecycle', () => {
    it('removes stack after collect animation completes', () => {
      system.addStack('agent-1', 100, 200, 3);
      system.collectStack('agent-1');
      // Advance time to complete the fly animation (~500ms = 0.5s)
      system.update(1);
      // Stack should be removed after animation completes
      const stacks = system.getStacks();
      assert.equal(stacks.size, 0, 'stack should be removed after animation');
    });

    it('fires onCollect callback when animation completes', () => {
      system.addStack('agent-1', 100, 200, 5);
      system.collectStack('agent-1');
      system.update(1);
      assert.equal(collectCalls.length, 1);
      assert.equal(collectCalls[0].totalCount, 5);
    });
  });

  describe('setCoinCollectTarget', () => {
    it('sets the fly-to target position used by collect animation', () => {
      system.setCoinCollectTarget(400, 20);
      // Verify target is used: add a stack far from target, collect, and check
      // that it doesn't throw during animation (rendering tested via canvas in E2E)
      system.addStack('agent-1', 100, 200, 1);
      system.collectStack('agent-1');
      // Advance partially — stack should still exist mid-animation
      system.update(0.25);
      const stack = system.getStacks().get('agent-1');
      assert.ok(stack, 'stack should still exist mid-animation');
      assert.ok(stack!.collectProgress > 0, 'animation should be progressing');
      assert.ok(stack!.collectProgress < 1, 'animation should not be complete yet');
    });
  });

  describe('RenderLayer interface', () => {
    it('has order 18', () => {
      assert.equal(system.order, 18);
    });
  });

  describe('sprite loading', () => {
    it('reports not loaded before loadSprite is called', () => {
      assert.equal(system.isSpriteLoaded(), false);
    });

    it('falls back to canvas primitives when sprite not loaded', () => {
      system.addStack('agent-1', 100, 200, 3);
      system.update(0.016);
      assert.equal(system.getStacks().size, 1);
    });
  });

  describe('fountain scatter', () => {
    it('creates particles when spawnFountain is called', () => {
      system.spawnFountain(100, 200, 5);
      const particles = system._getParticles();
      assert.equal(particles.length, 5);
    });

    it('particles settle after physics completes', () => {
      system.spawnFountain(100, 200, 3);
      for (let i = 0; i < 60; i++) system.update(0.05);
      const particles = system._getParticles();
      for (const p of particles) {
        assert.ok(p.settled, 'particle should be settled');
      }
    });

    it('settled particles with agentId merge into stack', () => {
      system.spawnFountain(100, 200, 3, 'agent-1');
      for (let i = 0; i < 60; i++) system.update(0.05);
      const stacks = system.getStacks();
      assert.equal(stacks.has('agent-1'), true);
      assert.equal(stacks.get('agent-1')!.totalCount, 3);
      assert.equal(system._getParticles().length, 0);
    });

    it('particles without agentId remain after settling', () => {
      system.spawnFountain(100, 200, 3);
      for (let i = 0; i < 60; i++) system.update(0.05);
      // No agentId → no merge, particles stay settled
      assert.equal(system._getParticles().length, 3);
    });

    it('rapid successive spawns for same agent merge correctly', () => {
      // First fountain
      system.spawnFountain(100, 200, 3, 'agent-1');
      // Advance partway — first batch still in flight
      system.update(0.3);
      // Second fountain before first settles
      system.spawnFountain(100, 200, 2, 'agent-1');
      assert.equal(system._getParticles().length, 5);
      // Settle all particles
      for (let i = 0; i < 120; i++) system.update(0.05);
      // All 5 should merge into one stack
      const stacks = system.getStacks();
      assert.equal(stacks.has('agent-1'), true);
      assert.equal(stacks.get('agent-1')!.totalCount, 5);
      assert.equal(system._getParticles().length, 0);
    });
  });
});
