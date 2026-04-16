import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { detectRepoRoot, detectRepoName, detectMainBranch } from './detect.js';
import { getPresetDir } from './copy.js';
import { parseTeamConfig, validateTeamConfig, expandAgentInstances } from './team-config.js';
import { createLabelsFromConfig } from './labels.js';
import { generateAndInstallProfiles } from './init.js';

/**
 * Parse a flag value from CLI args.
 */
function parseFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return null;
  return args[index + 1];
}

/**
 * Resolve the preset directory for a team.
 * Checks repo-local teams first, then built-in presets.
 */
export function resolvePresetDir(team: string, repoRoot: string): string | null {
  const localDir = join(repoRoot, '.claude', 'nightshift', 'teams', team);
  if (existsSync(join(localDir, 'team.yaml'))) return localDir;
  const presetDir = getPresetDir(team);
  if (existsSync(join(presetDir, 'team.yaml'))) return presetDir;
  return null;
}

/**
 * Lightweight agent file regeneration.
 * Regenerates agent profiles and labels without touching worktrees,
 * dependencies, CLAUDE.md, or extension files.
 */
export async function reinit(args: string[]): Promise<void> {
  const team = parseFlag(args, '--team');
  const agentFlag = parseFlag(args, '--agent');

  if (!team) {
    console.error(chalk.red('Please specify a team: npx nightshift reinit --team dev'));
    process.exit(1);
  }

  const repoRoot = detectRepoRoot();
  const repoName = detectRepoName();
  const mainBranch = detectMainBranch();

  // Resolve preset dir (repo-local teams → built-in presets)
  const presetDir = resolvePresetDir(team, repoRoot);
  if (!presetDir) {
    console.error(chalk.red(`No team.yaml found for team "${team}".`));
    process.exit(1);
  }

  const config = parseTeamConfig(join(presetDir, 'team.yaml'));
  const validation = validateTeamConfig(config);
  if (!validation.valid) {
    console.error(chalk.red(`Invalid team.yaml: ${validation.errors.map(e => e.message).join(', ')}`));
    process.exit(1);
  }

  console.log('');
  console.log(chalk.bold(`  nightshift reinit — ${team}`));
  console.log('');

  if (agentFlag) {
    // Single agent regeneration
    const expanded = expandAgentInstances(config);
    const match = expanded.find(a => a.role === agentFlag || a.agent === agentFlag);
    if (!match) {
      console.error(chalk.red(`Agent "${agentFlag}" not found in team "${team}". Available: ${expanded.map(a => a.role).join(', ')}`));
      process.exit(1);
    }

    // Regenerate only this agent's profile
    const installed = generateAndInstallProfiles(
      config, presetDir, repoName, mainBranch, undefined, repoRoot, match.role,
    );
    console.log(`  ${chalk.green('v')} Regenerated ${installed[0] || match.agent}`);
  } else {
    // Full team regeneration
    try {
      const installed = generateAndInstallProfiles(
        config, presetDir, repoName, mainBranch, undefined, repoRoot,
      );
      console.log(`  ${chalk.green('v')} ${installed.length} profiles regenerated`);
    } catch (err) {
      console.error(chalk.red(`Failed to generate profiles: ${(err as Error).message}`));
      process.exit(1);
    }

    // Recreate labels (idempotent)
    try {
      const labelsCreated = createLabelsFromConfig(config);
      if (labelsCreated > 0) {
        console.log(`  ${chalk.green('v')} ${labelsCreated} new labels created`);
      } else {
        console.log(`  ${chalk.dim('  Labels up to date')}`);
      }
    } catch {
      console.log(`  ${chalk.dim('  Labels skipped (gh not available)')}`);
    }
  }

  console.log('');
  console.log(chalk.green('Reinit complete.'));
  console.log('');
}
