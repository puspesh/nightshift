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

  it('reads breadcrumb from last-issue directory', () => {
    assert.ok(
      loopScript.includes('last-issue/'),
      'Should read breadcrumb from last-issue directory'
    );
  });

  it('appends cost entries to costs file via node', () => {
    assert.ok(
      loopScript.includes('appendFileSync'),
      'Should append cost entries to JSONL file'
    );
  });

  it('cleans up temp file after each cycle', () => {
    assert.ok(
      loopScript.includes('rm -f "$CYCLE_OUTPUT"'),
      'Should clean up temp file after parsing'
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
    // The spawn call should include agent.agent as a parameter
    assert.ok(
      startTs.includes('agent.agent,'),
      'start.ts should pass agent name to the loop script'
    );
  });
});
