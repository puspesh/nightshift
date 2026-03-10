import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Detect the git repository root directory.
 * @returns {string} Absolute path to the repo root
 * @throws {Error} If not inside a git repository
 */
export function detectRepoRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error(
      'Not inside a git repository. Run this command from within a git repo.'
    );
  }
}

/**
 * Detect the repository name (basename of the repo root).
 * @returns {string} Repository name
 */
export function detectRepoName() {
  const root = detectRepoRoot();
  return root.split('/').pop() || 'unknown';
}

/**
 * Detect the main branch name.
 * Checks for origin/main, then origin/master, then falls back to current branch.
 * @returns {string} Main branch name (e.g., "main" or "master")
 */
export function detectMainBranch() {
  // Check for origin/main
  try {
    execSync('git rev-parse --verify origin/main', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 'main';
  } catch {
    // Not found, try master
  }

  // Check for origin/master
  try {
    execSync('git rev-parse --verify origin/master', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 'master';
  } catch {
    // Not found, fall back to current branch
  }

  // Fall back to current branch
  try {
    return execSync('git branch --show-current', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return 'main';
  }
}

/**
 * Detect the package manager used by the project.
 * Checks for lockfiles in priority order: pnpm, yarn, bun, npm.
 * @param {string} repoRoot - Path to the repository root
 * @returns {string} Package manager name ("pnpm", "yarn", "bun", or "npm")
 */
export function detectPackageManager(repoRoot) {
  if (existsSync(join(repoRoot, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(join(repoRoot, 'yarn.lock'))) {
    return 'yarn';
  }
  if (existsSync(join(repoRoot, 'bun.lockb')) || existsSync(join(repoRoot, 'bun.lock'))) {
    return 'bun';
  }
  return 'npm';
}

/**
 * Detect the primary language of the project.
 * @param {string} repoRoot - Path to the repository root
 * @returns {string} Language identifier: 'javascript', 'go', 'python', 'rust', or 'unknown'
 */
export function detectLanguage(repoRoot) {
  if (existsSync(join(repoRoot, 'package.json'))) {
    return 'javascript';
  }
  if (existsSync(join(repoRoot, 'go.mod'))) {
    return 'go';
  }
  if (
    existsSync(join(repoRoot, 'pyproject.toml')) ||
    existsSync(join(repoRoot, 'requirements.txt'))
  ) {
    return 'python';
  }
  if (existsSync(join(repoRoot, 'Cargo.toml'))) {
    return 'rust';
  }
  return 'unknown';
}

/**
 * Detect available scripts from the project's package.json.
 * @param {string} repoRoot - Path to the repository root
 * @returns {{ build: string|null, test: string|null, lint: string|null, typecheck: string|null }}
 */
export function detectScripts(repoRoot) {
  const pkgPath = join(repoRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    return { build: null, test: null, lint: null, typecheck: null };
  }

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const scripts = pkg.scripts || {};
    return {
      build: scripts.build || null,
      test: scripts.test || null,
      lint: scripts.lint || null,
      typecheck: scripts.typecheck || null,
    };
  } catch {
    return { build: null, test: null, lint: null, typecheck: null };
  }
}

/**
 * Validate a team name against the naming convention.
 * Must start with a lowercase letter, contain only lowercase letters, digits, and hyphens,
 * and end with a lowercase letter or digit.
 * @param {string} name - Team name to validate
 * @returns {boolean} True if valid
 */
export function validateTeamName(name) {
  return /^[a-z]([a-z0-9-]*[a-z0-9])?$/.test(name);
}

/**
 * Detect the git remote origin URL.
 * @returns {string} Remote URL
 * @throws {Error} If no remote "origin" is configured
 */
export function detectRemote() {
  try {
    return execSync('git remote get-url origin', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error(
      'No remote "origin" found. Run this command in a repo with a remote.'
    );
  }
}
