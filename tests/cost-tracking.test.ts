import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('ns-agent-loop.sh cost tracking', () => {
  const loopScript = readFileSync(
    join(__dirname, '..', '..', 'bin', 'ns-agent-loop.sh'),
    'utf-8'
  );

  it('accepts costs-file and agent-name arguments', () => {
    assert.ok(
      loopScript.includes('COSTS_FILE='),
      'Loop script should accept COSTS_FILE argument'
    );
    assert.ok(
      loopScript.includes('AGENT_NAME='),
      'Loop script should accept AGENT_NAME argument'
    );
  });

  it('uses --output-format json when cost tracking is enabled', () => {
    assert.ok(
      loopScript.includes('--output-format json'),
      'Should use --output-format json for cost capture'
    );
  });

  it('falls back to --print when cost tracking is disabled', () => {
    assert.ok(
      loopScript.includes('--print'),
      'Should fall back to --print when no costs-file provided'
    );
  });

  it('derives breadcrumb path from TEAM_DIR (not find)', () => {
    assert.ok(
      loopScript.includes('TEAM_DIR=$(dirname "$COSTS_FILE")'),
      'Should derive team dir from costs file path'
    );
    assert.ok(
      loopScript.includes('"${TEAM_DIR}/last-issue/${AGENT_NAME}"'),
      'Should build breadcrumb path from TEAM_DIR, not use find'
    );
    assert.ok(
      !loopScript.includes('find "$HOME'),
      'Should not use find to locate breadcrumb'
    );
  });

  it('clears breadcrumb after reading to prevent stale attribution', () => {
    // The breadcrumb must be removed after reading so idle cycles
    // don't re-attribute cost to the previous issue
    assert.ok(
      loopScript.includes('rm -f "$BREADCRUMB"'),
      'Should clear breadcrumb after reading issue number'
    );
  });

  it('uses O_APPEND for atomic writes to shared costs file', () => {
    assert.ok(
      loopScript.includes("openSync(process.argv[5], 'a')"),
      'Should use openSync with append flag for atomic JSONL writes'
    );
    assert.ok(
      loopScript.includes('writeSync(fd,'),
      'Should use writeSync for atomic write'
    );
  });

  it('logs errors to stderr instead of silently swallowing', () => {
    assert.ok(
      loopScript.includes("process.stderr.write('cost-tracking:"),
      'Should log cost tracking errors to stderr'
    );
  });

  it('cleans up temp file after each cycle and on SIGTERM', () => {
    assert.ok(
      loopScript.includes('rm -f "$CYCLE_OUTPUT"'),
      'Should clean up temp file after parsing'
    );
    // Trap handler should also clean up temp file
    const trapLine = loopScript.split('\n').find(l => l.includes('trap '));
    assert.ok(
      trapLine?.includes('CYCLE_OUTPUT'),
      'SIGTERM trap should clean up CYCLE_OUTPUT'
    );
  });
});

describe('start.ts passes cost args to headless agents', () => {
  const startTs = readFileSync(
    join(__dirname, '..', '..', 'lib', 'start.ts'),
    'utf-8'
  );

  it('passes costsFile to AGENT_LOOP_SCRIPT', () => {
    assert.ok(
      startTs.includes('costsFile'),
      'start.ts should pass costsFile to the loop script'
    );
  });

  it('passes agent.agent name to AGENT_LOOP_SCRIPT', () => {
    assert.ok(
      startTs.includes('agent.agent,'),
      'start.ts should pass agent name to the loop script'
    );
  });
});
