import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, accessSync, constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = readFileSync(join(root, 'install.sh'), 'utf-8');

describe('install.sh exists and is well-formed', () => {
  it('install.sh exists at project root', () => {
    assert.ok(existsSync(join(root, 'install.sh')));
  });

  it('is executable', () => {
    accessSync(join(root, 'install.sh'), constants.X_OK);
  });

  it('starts with bash shebang', () => {
    assert.match(script, /^#!\/usr\/bin\/env bash/);
  });

  it('uses strict mode (set -euo pipefail)', () => {
    assert.ok(script.includes('set -euo pipefail'));
  });
});

describe('install.sh pre-flight checks', () => {
  it('checks for git', () => {
    assert.ok(script.includes('command -v git'));
  });

  it('checks for node', () => {
    assert.ok(script.includes('command -v node'));
  });

  it('validates node version >= 18', () => {
    assert.match(script, /-ge 18/);
  });

  it('checks for npm or bun', () => {
    assert.ok(script.includes('command -v npm'));
    assert.ok(script.includes('command -v bun'));
  });

  it('errors clearly when prerequisites missing', () => {
    assert.ok(script.includes('git is required but not installed'));
    assert.ok(script.includes('node >= 18 is required but not installed'));
    assert.ok(script.includes('npm or bun is required but not installed'));
  });
});

describe('install.sh environment variables', () => {
  it('supports NIGHTSHIFT_HOME override', () => {
    assert.match(script, /NIGHTSHIFT_HOME/);
    assert.match(script, /\$\{NIGHTSHIFT_HOME:-\$HOME\/\.nightshift-install\}/);
  });

  it('supports NIGHTSHIFT_BIN override', () => {
    assert.match(script, /NIGHTSHIFT_BIN/);
    assert.match(script, /\$\{NIGHTSHIFT_BIN:-\/usr\/local\/bin\}/);
  });

  it('falls back to ~/.local/bin when default bin dir not writable', () => {
    assert.ok(script.includes('$HOME/.local/bin'));
    assert.ok(script.includes('mkdir -p "$BIN_DIR"'));
  });
});

describe('install.sh install flow', () => {
  it('clones with --depth 1 for speed', () => {
    assert.ok(script.includes('git clone --depth 1'));
  });

  it('supports updating existing installation', () => {
    assert.ok(script.includes('Updating existing installation'));
    assert.ok(script.includes('pull --ff-only'));
  });

  it('checks for local modifications before re-cloning', () => {
    assert.ok(script.includes('git -C "$INSTALL_DIR" diff --quiet HEAD'));
    assert.ok(script.includes('has local modifications'));
  });

  it('runs npm/bun install with --ignore-scripts', () => {
    assert.ok(script.includes('install --ignore-scripts'));
  });

  it('errors on dependency install failure', () => {
    assert.ok(script.includes('error "Dependency installation failed"'));
  });

  it('errors on build failure', () => {
    assert.ok(script.includes('error "Build failed"'));
  });

  it('does not pipe build output through tail (would swallow errors)', () => {
    // Build and install commands should NOT be piped to tail
    const lines = script.split('\n');
    for (const line of lines) {
      if (line.includes('$PKG_MGR') && !line.trim().startsWith('#')) {
        assert.ok(
          !line.includes('| tail'),
          `Package manager command should not be piped to tail: ${line.trim()}`,
        );
      }
    }
  });
});

describe('install.sh binary linking', () => {
  it('links dist/bin/nightshift.js', () => {
    assert.ok(script.includes('dist/bin/nightshift.js'));
  });

  it('uses ln -sf for idempotent linking', () => {
    assert.ok(script.includes('ln -sf'));
  });

  it('does not invoke sudo', () => {
    // Check that no non-comment line invokes sudo
    const lines = script.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue;
      assert.ok(
        !trimmed.includes('sudo '),
        `install.sh should not invoke sudo — falls back to ~/.local/bin instead. Found: ${trimmed}`,
      );
    }
  });
});

describe('install.sh verification', () => {
  it('verifies binary is executable after install', () => {
    assert.ok(script.includes('-x "$LINK_PATH"'));
  });

  it('prints version on success', () => {
    assert.ok(script.includes('installed successfully'));
  });

  it('prints install paths on success', () => {
    assert.ok(script.includes('Source:'));
    assert.ok(script.includes('Binary:'));
  });

  it('prints getting-started hint', () => {
    assert.ok(script.includes('nightshift init --team dev'));
  });
});

describe('install.sh color handling', () => {
  it('disables colors when not a TTY', () => {
    assert.ok(script.includes('[ -t 1 ]'));
    assert.match(script, /RED='' GREEN='' /);
  });
});

describe('install.sh passes shellcheck', () => {
  it('shellcheck reports no errors', () => {
    try {
      execSync('command -v shellcheck', { encoding: 'utf-8' });
    } catch {
      // shellcheck not installed — skip
      return;
    }
    try {
      execSync(`shellcheck -S error "${join(root, 'install.sh')}"`, {
        encoding: 'utf-8',
      });
    } catch (e: any) {
      assert.fail(`shellcheck found errors:\n${e.stdout || e.stderr || e.message}`);
    }
  });
});

describe('install.sh clones correct repo', () => {
  it('clones from puspesh/nightshift', () => {
    assert.ok(script.includes('github.com/puspesh/nightshift.git'));
  });
});
