import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderTemplate,
  extractTemplateVars,
  validateTemplateVars,
} from '../lib/template.js';

describe('renderTemplate', () => {
  it('replaces a single variable', () => {
    const result = renderTemplate('Hello {{name}}!', { name: 'world' });
    assert.equal(result, 'Hello world!');
  });

  it('replaces multiple different variables', () => {
    const result = renderTemplate(
      '{{agent_name}} watches {{team_name}}:{{stage}}',
      { agent_name: 'ns-dev-producer', team_name: 'dev', stage: 'planning' },
    );
    assert.equal(result, 'ns-dev-producer watches dev:planning');
  });

  it('replaces the same variable multiple times', () => {
    const result = renderTemplate(
      '{{name}} and {{name}} again',
      { name: 'foo' },
    );
    assert.equal(result, 'foo and foo again');
  });

  it('throws on undefined variable', () => {
    assert.throws(
      () => renderTemplate('Hello {{missing}}!', {}),
      /Undefined template variables.*\{\{missing\}\}/,
    );
  });

  it('throws listing all undefined variables', () => {
    try {
      renderTemplate('{{a}} and {{b}}', { a: 'ok' });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok((err as Error).message.includes('{{b}}'));
      assert.ok(!(err as Error).message.includes('{{a}}'));
    }
  });

  it('handles template with no variables', () => {
    const result = renderTemplate('No variables here', {});
    assert.equal(result, 'No variables here');
  });

  it('preserves non-mustache braces', () => {
    const result = renderTemplate('if (x) { return {{val}}; }', { val: '42' });
    assert.equal(result, 'if (x) { return 42; }');
  });
});

describe('extractTemplateVars', () => {
  it('extracts all unique variable names', () => {
    const vars = extractTemplateVars('{{a}} and {{b}} and {{a}}');
    assert.deepEqual(vars.sort(), ['a', 'b']);
  });

  it('returns empty array for no variables', () => {
    const vars = extractTemplateVars('No variables here');
    assert.deepEqual(vars, []);
  });

  it('handles underscores in variable names', () => {
    const vars = extractTemplateVars('{{agent_name}} {{team_dir}}');
    assert.deepEqual(vars.sort(), ['agent_name', 'team_dir']);
  });
});

describe('validateTemplateVars', () => {
  it('returns empty array when all vars are available', () => {
    const missing = validateTemplateVars('{{a}} {{b}}', ['a', 'b', 'c']);
    assert.deepEqual(missing, []);
  });

  it('returns missing variable names', () => {
    const missing = validateTemplateVars('{{a}} {{b}} {{c}}', ['a']);
    assert.deepEqual(missing.sort(), ['b', 'c']);
  });

  it('returns empty array for template with no variables', () => {
    const missing = validateTemplateVars('no vars', []);
    assert.deepEqual(missing, []);
  });
});
