import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Get the nightshift directory for a repository.
 * @param {string} repoName - Name of the repository
 * @returns {string} Path to ~/.nightshift/<repoName>/
 */
export function getNightshiftDir(repoName) {
  return join(homedir(), '.nightshift', repoName);
}

/**
 * Get the team directory for a repository and team.
 * @param {string} repoName - Name of the repository
 * @param {string} team - Team name
 * @returns {string} Path to ~/.nightshift/<repoName>/<team>/
 */
export function getTeamDir(repoName, team) {
  return join(homedir(), '.nightshift', repoName, team);
}

/**
 * Create git worktrees for the given roles within a team.
 * Each role gets its own worktree at ~/.nightshift/<repo>/<team>/worktrees/<role>/
 * on branch _ns/<team>/<role> based on origin/<mainBranch>.
 *
 * @param {string} repoName - Name of the repository
 * @param {string} team - Team name
 * @param {string[]} roles - Array of role names (e.g., ['planner', 'reviewer', 'coder-1', 'tester'])
 * @param {string} mainBranch - Main branch name (e.g., "main")
 */
export function createWorktrees(repoName, team, roles, mainBranch) {
  const teamDir = getTeamDir(repoName, team);

  // Create directory structure
  mkdirSync(join(teamDir, 'worktrees'), { recursive: true });
  mkdirSync(join(teamDir, 'locks'), { recursive: true });
  mkdirSync(join(teamDir, 'status'), { recursive: true });

  // Fetch latest
  execSync('git fetch origin', {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  for (const role of roles) {
    const worktreePath = join(teamDir, 'worktrees', role);
    const branchName = `_ns/${team}/${role}`;

    // Skip if worktree already exists
    if (existsSync(worktreePath)) {
      continue;
    }

    // Create the branch if it doesn't exist
    try {
      execSync(`git rev-parse --verify ${branchName}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // Branch doesn't exist — create it from origin/<mainBranch>
      try {
        execSync(`git branch ${branchName} origin/${mainBranch}`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        throw new Error(
          `Failed to create branch ${branchName} from origin/${mainBranch}: ${err.message}`
        );
      }
    }

    // Create the worktree
    try {
      execSync(`git worktree add "${worktreePath}" ${branchName}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      throw new Error(
        `Failed to create worktree for ${role} at ${worktreePath}: ${err.message}`
      );
    }
  }
}

/**
 * Remove all worktrees and branches for a team.
 * Discovers roles by scanning <teamDir>/worktrees/ subdirectories.
 *
 * @param {string} repoName - Name of the repository
 * @param {string} team - Team name
 */
export function removeWorktrees(repoName, team) {
  const teamDir = getTeamDir(repoName, team);
  const worktreesDir = join(teamDir, 'worktrees');

  if (!existsSync(worktreesDir)) {
    return;
  }

  const roles = readdirSync(worktreesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const role of roles) {
    const worktreePath = join(worktreesDir, role);

    // Remove worktree
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // Worktree may already be removed
    }

    // Remove branch
    const branchName = `_ns/${team}/${role}`;
    try {
      execSync(`git branch -D ${branchName}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // Branch may not exist
    }
  }
}

/**
 * Discover the number of coder roles for a team.
 * Counts coder-* directories in <teamDir>/worktrees/.
 *
 * @param {string} repoName - Name of the repository
 * @param {string} team - Team name
 * @returns {number} Number of coder worktrees
 */
export function discoverCoderCount(repoName, team) {
  const worktreesDir = join(getTeamDir(repoName, team), 'worktrees');

  if (!existsSync(worktreesDir)) {
    return 0;
  }

  return readdirSync(worktreesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('coder-'))
    .length;
}

/**
 * Discover all teams for a repository.
 * Lists subdirectories of ~/.nightshift/<repoName>/.
 *
 * @param {string} repoName - Name of the repository
 * @returns {string[]} Array of team names
 */
export function discoverTeams(repoName) {
  const nightshiftDir = getNightshiftDir(repoName);

  if (!existsSync(nightshiftDir)) {
    return [];
  }

  return readdirSync(nightshiftDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}
