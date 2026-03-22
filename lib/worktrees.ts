import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Get the nightshift directory for a repository.
 */
export function getNightshiftDir(repoName: string): string {
  return join(homedir(), '.nightshift', repoName);
}

/**
 * Get the team directory for a repository and team.
 */
export function getTeamDir(repoName: string, team: string): string {
  return join(homedir(), '.nightshift', repoName, team);
}

/**
 * Create git worktrees for the given roles within a team.
 */
export function createWorktrees(repoName: string, team: string, roles: string[], mainBranch: string): void {
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
          `Failed to create branch ${branchName} from origin/${mainBranch}: ${(err as Error).message}`
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
        `Failed to create worktree for ${role} at ${worktreePath}: ${(err as Error).message}`
      );
    }
  }
}

/**
 * Remove all worktrees and branches for a team.
 */
export function removeWorktrees(repoName: string, team: string): void {
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
 */
export function discoverCoderCount(repoName: string, team: string): number {
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
 */
export function discoverTeams(repoName: string): string[] {
  const nightshiftDir = getNightshiftDir(repoName);

  if (!existsSync(nightshiftDir)) {
    return [];
  }

  return readdirSync(nightshiftDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}
