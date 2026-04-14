import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent } from '../lib/agentville/event-types.js';

describe('validateEvent', () => {
  it('accepts valid heartbeat event', () => {
    const event = validateEvent({
      type: 'agent:heartbeat',
      source: 'nightshift',
      agent: 'producer',
      data: { state: 'working', task: 'Fixing bug' },
    });
    assert.ok(event);
    assert.equal(event!.type, 'agent:heartbeat');
    assert.equal(event!.source, 'nightshift');
    assert.equal(event!.agent, 'producer');
    assert.ok(typeof event!.timestamp === 'number');
  });

  it('accepts valid work:completed event', () => {
    const event = validateEvent({
      type: 'work:completed',
      source: 'nightshift',
      agent: 'producer',
      data: { workType: 'issue_triaged', description: 'Triaged issue #42' },
    });
    assert.ok(event);
    assert.equal(event!.type, 'work:completed');
  });

  it('accepts valid agent:spawned event', () => {
    const event = validateEvent({
      type: 'agent:spawned',
      source: 'nightshift',
      agent: 'producer',
      data: { parent: 'producer', child: 'sub-abc123', task: 'Review code' },
    });
    assert.ok(event);
    assert.equal(event!.type, 'agent:spawned');
  });

  it('accepts valid agent:spawn-ended event', () => {
    const event = validateEvent({
      type: 'agent:spawn-ended',
      source: 'nightshift',
      agent: 'producer',
      data: { parent: 'producer', child: 'sub-abc123' },
    });
    assert.ok(event);
  });

  it('accepts valid agent:idle event', () => {
    const event = validateEvent({
      type: 'agent:idle',
      source: 'nightshift',
      agent: 'producer',
      data: { reason: 'session_ended' },
    });
    assert.ok(event);
    assert.equal(event!.type, 'agent:idle');
  });

  it('accepts valid agent:error event', () => {
    const event = validateEvent({
      type: 'agent:error',
      source: 'nightshift',
      agent: 'producer',
      data: { error: 'Tool failed', tool: 'Bash' },
    });
    assert.ok(event);
  });

  it('rejects missing type', () => {
    const event = validateEvent({
      source: 'nightshift',
      agent: 'producer',
    });
    assert.equal(event, null);
  });

  it('rejects missing source', () => {
    const event = validateEvent({
      type: 'agent:heartbeat',
      agent: 'producer',
    });
    assert.equal(event, null);
  });

  it('rejects missing agent', () => {
    const event = validateEvent({
      type: 'agent:heartbeat',
      source: 'nightshift',
    });
    assert.equal(event, null);
  });

  it('rejects unknown event type', () => {
    const event = validateEvent({
      type: 'unknown:event',
      source: 'nightshift',
      agent: 'producer',
    });
    assert.equal(event, null);
  });

  it('rejects non-object input', () => {
    assert.equal(validateEvent(null), null);
    assert.equal(validateEvent('string'), null);
    assert.equal(validateEvent(42), null);
    assert.equal(validateEvent(undefined), null);
  });

  it('accepts unknown source values (source-agnostic)', () => {
    const event = validateEvent({
      type: 'agent:heartbeat',
      source: 'some-random-tool',
      agent: 'my-agent',
    });
    assert.ok(event);
    assert.equal(event!.source, 'some-random-tool');
  });

  it('fills in timestamp when not provided', () => {
    const before = Date.now();
    const event = validateEvent({
      type: 'agent:heartbeat',
      source: 'test',
      agent: 'test',
    });
    const after = Date.now();
    assert.ok(event);
    assert.ok(event!.timestamp! >= before);
    assert.ok(event!.timestamp! <= after);
  });

  it('preserves provided timestamp', () => {
    const event = validateEvent({
      type: 'agent:heartbeat',
      source: 'test',
      agent: 'test',
      timestamp: 1234567890,
    });
    assert.ok(event);
    assert.equal(event!.timestamp, 1234567890);
  });

  it('accepts event without data field', () => {
    const event = validateEvent({
      type: 'agent:heartbeat',
      source: 'test',
      agent: 'test',
    });
    assert.ok(event);
    assert.equal(event!.data, undefined);
  });
});

describe('AgentStore idle detection', () => {
  // Import AgentStore for testing sweep behavior
  it('session_ended agents stay offline during sweep', async () => {
    const { AgentStore } = await import('../lib/agentville/server/store.js');
    const store = new AgentStore(100, 50); // 100ms timeout, 50ms sweep for fast test

    // Register an agent that explicitly ended session
    store.heartbeat({
      agent: 'test-agent',
      state: 'offline',
      metadata: { idleReason: 'session_ended' },
    });

    // Wait for sweep to run
    store.start();
    await new Promise(resolve => setTimeout(resolve, 200));
    store.stop();

    // Agent should still be offline (not transitioned to sleeping)
    const agents = store.getAll();
    const agent = agents.find(a => a.agent === 'test-agent');
    assert.ok(agent);
    assert.equal(agent!.state, 'offline');
  });

  it('regular agents transition to sleeping after timeout', async () => {
    const { AgentStore } = await import('../lib/agentville/server/store.js');
    const store = new AgentStore(100, 50); // 100ms timeout, 50ms sweep for fast test

    // Register a working agent
    store.heartbeat({
      agent: 'active-agent',
      state: 'working',
      task: 'Coding',
    });

    // Wait for sweep to fire after timeout
    store.start();
    await new Promise(resolve => setTimeout(resolve, 250));
    store.stop();

    const agents = store.getAll();
    const agent = agents.find(a => a.agent === 'active-agent');
    assert.ok(agent);
    assert.equal(agent!.state, 'sleeping');
  });
});
