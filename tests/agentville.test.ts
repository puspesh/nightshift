import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPidFilePath, getPortFilePath, isAgentvilleRunning } from '../lib/agentville.js';

describe('PID file helpers', () => {
  it('getPidFilePath returns global path', () => {
    const p = getPidFilePath();
    assert.ok(
      p.includes('.agentville/agentville.pid') || p.includes('.nightshift/agentville.pid'),
      'PID file path should be under ~/.agentville/ or ~/.nightshift/',
    );
  });

  it('getPortFilePath returns global path', () => {
    const p = getPortFilePath();
    assert.ok(
      p.includes('.agentville/agentville.port') || p.includes('.nightshift/agentville.port'),
      'Port file path should be under ~/.agentville/ or ~/.nightshift/',
    );
  });

  it('isAgentvilleRunning returns false when no PID file', { skip: isAgentvilleRunning() ? 'server is currently running' : undefined }, () => {
    assert.equal(isAgentvilleRunning(), false);
  });
});
