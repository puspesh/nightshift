import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import prompts from 'prompts';
import { detectRepoRoot, detectRepoName } from './detect.js';
import { removeLabels } from './labels.js';
import { removeWorktrees, getNightshiftDir, getTeamDir, discoverTeams } from './worktrees.js';
import { removeAgentProfiles, removeExtensionFiles, removeRepoMd, getGlobalAgentsDir } from './copy.js';
import { removeHooks } from './hooks.js';
import { loadTeamConfig } from './start.js';
import type { AgentEntry } from './types.js';

/**
 * Parse a flag value from CLI args (e.g. --team alpha -> "alpha").
 */
function parseFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return null;
  return args[index + 1];
}

/**
 * Discover all agent roles for a team by scanning the filesystem.
 * Filesystem-first: scans worktree dirs + agent profile files.
 * Merges with team.yaml if available (catches worktree: false agents).
 *
 * Returns AgentEntry[] with cwd set to the actual directory.
 */
export function discoverAgentEntries(
  repoName: string,
  team: string,
  repoRoot: string,
): AgentEntry[] {
  const teamDir = getTeamDir(repoName, team);
  const worktreesDir = join(teamDir, 'worktrees');
  const roleSet = new Set<string>();
  const entries: AgentEntry[] = [];

  // 1. Scan worktree directories
  if (existsSync(worktreesDir)) {
    for (const dir of readdirSync(worktreesDir)) {
      const fullPath = join(worktreesDir, dir);
      roleSet.add(dir);
      entries.push({
        role: dir,
        agent: `ns-${team}-${dir}`,
        cwd: fullPath,
      });
    }
  }

  // 2. Scan ~/.claude/agents/ for agent files without worktrees
  const agentsDir = getGlobalAgentsDir();
  const prefix = `ns-${team}-`;
  if (existsSync(agentsDir)) {
    for (const file of readdirSync(agentsDir)) {
      if (!file.startsWith(prefix) || !file.endsWith('.md')) continue;
      const agentName = file.slice(0, -3); // strip .md
      const role = agentName.slice(prefix.length);
      if (!roleSet.has(role)) {
        roleSet.add(role);
        entries.push({
          role,
          agent: agentName,
          cwd: repoRoot, // no worktree → runs from repo root
        });
      }
    }
  }

  // 3. Merge with team.yaml (catches agents with worktree: false that might not have files yet)
  const config = loadTeamConfig(team, repoRoot);
  if (config) {
    for (const [role, def] of Object.entries(config.agents)) {
      if (def.scalable) {
        // For scalable agents, the filesystem scan already caught actual instances
        // Don't add base role — only instances exist on disk
        continue;
      }
      if (!roleSet.has(role)) {
        roleSet.add(role);
        entries.push({
          role,
          agent: `ns-${team}-${role}`,
          cwd: def.worktree === false
            ? repoRoot
            : join(worktreesDir, role),
        });
      }
    }
  }

  return entries;
}

/**
 * Remove a team's subsection from CLAUDE.md.
 */
export function cleanClaudeMd(repoRoot: string, team: string): void {
  const claudeMdPath = join(repoRoot, 'CLAUDE.md');

  if (!existsSync(claudeMdPath)) {
    return;
  }

  let content = readFileSync(claudeMdPath, 'utf-8');

  // Find the ## Nightshift Teams section
  const sectionMarker = '## Nightshift Teams';
  const sectionIndex = content.indexOf(sectionMarker);

  if (sectionIndex === -1) {
    return; // No Nightshift Teams section
  }

  // Find the end of the ## Nightshift Teams section (next ## heading or EOF)
  const afterSection = content.slice(sectionIndex + sectionMarker.length);
  const nextH2Match = afterSection.match(/\n## /);
  const sectionEnd = nextH2Match
    ? sectionIndex + sectionMarker.length + nextH2Match.index!
    : content.length;

  const sectionContent = content.slice(sectionIndex, sectionEnd);

  // Find the ### <team> subsection within the section
  const teamHeading = `### ${team}`;
  const teamIndex = sectionContent.indexOf(teamHeading);

  if (teamIndex === -1) {
    return; // Team subsection not found
  }

  // Find the end of this team's subsection (next ### heading or end of section)
  const afterTeam = sectionContent.slice(teamIndex + teamHeading.length);
  const nextH3Match = afterTeam.match(/\n### /);
  const teamEnd = nextH3Match
    ? teamIndex + teamHeading.length + nextH3Match.index!
    : sectionContent.length;

  // Remove the team subsection
  const newSectionContent =
    sectionContent.slice(0, teamIndex) + sectionContent.slice(teamEnd);

  // Check if any ### subsections remain
  const hasRemainingTeams = /### /.test(newSectionContent.slice(sectionMarker.length));

  if (!hasRemainingTeams) {
    // Remove the entire ## Nightshift Teams section
    let start = sectionIndex;
    // Remove preceding blank lines
    while (start > 0 && content[start - 1] === '\n') {
      start--;
    }
    content = content.slice(0, start) + content.slice(sectionEnd);
  } else {
    content = content.slice(0, sectionIndex) + newSectionContent + content.slice(sectionEnd);
  }

  writeFileSync(claudeMdPath, content.trimEnd() + '\n');
}

/**
 * Run the full nightshift teardown flow.
 */
export async function teardown(args: string[]): Promise<void> {
  const team = parseFlag(args, '--team');
  const force = args.includes('--force');
  const shouldRemoveLabels = args.includes('--remove-labels');

  console.log('');
  console.log(chalk.bold('  nightshift teardown'));
  console.log('');

  // Detect project
  let repoRoot: string;
  let repoName: string;
  try {
    repoRoot = detectRepoRoot();
    repoName = detectRepoName();
  } catch (err) {
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }

  let teamsToRemove: string[];
  if (team) {
    teamsToRemove = [team];
  } else {
    // Discover all teams
    teamsToRemove = discoverTeams(repoName);
    if (teamsToRemove.length === 0) {
      console.log(chalk.dim('No nightshift teams found.'));
      process.exit(0);
    }
  }

  // Confirm unless --force
  if (!force) {
    const msg = team
      ? `Remove ${team} team from ${repoName}?`
      : `Remove ALL nightshift teams (${teamsToRemove.join(', ')}) from ${repoName}?`;
    const response = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message: msg,
      initial: false,
    });

    if (!response.confirmed) {
      console.log(chalk.dim('Cancelled.'));
      process.exit(0);
    }
  }

  console.log('');

  // For each team to remove:
  for (const t of teamsToRemove) {
    console.log(chalk.bold(`Removing ${t} team...`));

    // 1. Remove worktrees
    try {
      removeWorktrees(repoName, t);
      console.log(`  ${chalk.green('\u2713')} Worktrees removed`);
    } catch (err) {
      console.log(`  ${chalk.yellow('~')} ${(err as Error).message}`);
    }

    // 2. Remove team directory (~/.nightshift/<repo>/<team>/)
    const teamDir = getTeamDir(repoName, t);
    try {
      if (existsSync(teamDir)) {
        rmSync(teamDir, { recursive: true, force: true });
      }
      console.log(`  ${chalk.green('\u2713')} ${teamDir} removed`);
    } catch (err) {
      console.log(`  ${chalk.yellow('~')} ${(err as Error).message}`);
    }

    // 3. Remove agent profiles
    try {
      const removed = removeAgentProfiles(t);
      console.log(`  ${chalk.green('\u2713')} ${removed.length} profiles removed`);
    } catch (err) {
      console.log(`  ${chalk.yellow('~')} ${(err as Error).message}`);
    }

    // 4. Remove team extension files
    try {
      const removed = removeExtensionFiles(repoRoot, t);
      console.log(`  ${chalk.green('\u2713')} ${removed.length} config files removed`);
    } catch (err) {
      console.log(`  ${chalk.yellow('~')} ${(err as Error).message}`);
    }

    // 4b. Remove visualization hooks (filesystem-first agent discovery)
    try {
      const agentEntries = discoverAgentEntries(repoName, t, repoRoot);
      if (agentEntries.length > 0) {
        removeHooks(repoName, t, agentEntries);
      }
      console.log(`  ${chalk.green('\u2713')} Visualization hooks removed`);
    } catch (err) {
      console.log(`  ${chalk.yellow('~')} ${(err as Error).message}`);
    }

    // 5. Optionally remove labels
    if (shouldRemoveLabels) {
      try {
        const removed = removeLabels(t);
        console.log(`  ${chalk.green('\u2713')} ${removed} labels removed`);
      } catch (err) {
        console.log(`  ${chalk.yellow('~')} ${(err as Error).message}`);
      }
    }

    // 6. Clean CLAUDE.md (remove team subsection)
    try {
      cleanClaudeMd(repoRoot, t);
      console.log(`  ${chalk.green('\u2713')} CLAUDE.md updated`);
    } catch (err) {
      console.log(`  ${chalk.yellow('~')} ${(err as Error).message}`);
    }
  }

  // If removing ALL teams (no --team flag), also remove repo.md and parent nightshift dir
  if (!team) {
    try {
      removeRepoMd(repoRoot);
      // Also clean up the .claude/nightshift/ directory if empty
      const nightshiftConfigDir = join(repoRoot, '.claude', 'nightshift');
      if (existsSync(nightshiftConfigDir)) {
        const remaining = readdirSync(nightshiftConfigDir);
        if (remaining.length === 0) {
          rmSync(nightshiftConfigDir, { recursive: true, force: true });
        }
      }
      console.log(`  ${chalk.green('\u2713')} repo.md removed`);
    } catch (err) {
      console.log(`  ${chalk.yellow('~')} ${(err as Error).message}`);
    }

    // Remove ~/.nightshift/<repo>/ if empty
    const nightshiftDir = getNightshiftDir(repoName);
    try {
      if (existsSync(nightshiftDir)) {
        const remaining = readdirSync(nightshiftDir);
        if (remaining.length === 0) {
          rmSync(nightshiftDir, { recursive: true, force: true });
        }
      }
    } catch { /* ignore */ }
  }

  console.log('');
  console.log(chalk.green.bold('Teardown complete.'));
  if (!shouldRemoveLabels) {
    console.log(
      chalk.dim('  Note: GitHub labels were kept. Use --remove-labels to delete them.')
    );
  }
  console.log('');
}
