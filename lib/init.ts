import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import prompts from 'prompts';
import { detectRepoRoot, detectRepoName, detectMainBranch, detectPackageManager, detectLanguage, detectScripts, validateTeamName, detectRemote, type DetectedScripts } from './detect.js';
import { createLabelsFromConfig } from './labels.js';
import { createWorktrees, getTeamDir } from './worktrees.js';
import { copyExtensionFiles, copyScaffoldFiles, getPresetDir, getGlobalAgentsDir } from './copy.js';
import { parseTeamConfig, validateTeamConfig, expandAgentInstances, getAgentRoles, getScalableAgents } from './team-config.js';
import type { TeamConfig } from './team-config.js';
import { generateAgentFile, buildTemplateVars } from './generate-agent.js';
import { checkTeamInitialized } from './start.js';

/**
 * Check if a command-line tool is available.
 */
function isAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Print the nightshift banner.
 */
function printBanner(): void {
  const art = [
    '███╗   ██╗██╗ ██████╗ ██╗  ██╗████████╗███████╗██╗  ██╗██╗███████╗████████╗',
    '████╗  ██║██║██╔════╝ ██║  ██║╚══██╔══╝██╔════╝██║  ██║██║██╔════╝╚══██╔══╝',
    '██╔██╗ ██║██║██║  ███╗███████║   ██║   ███████╗███████║██║█████╗     ██║   ',
    '██║╚██╗██║██║██║   ██║██╔══██║   ██║   ╚════██║██╔══██║██║██╔══╝     ██║   ',
    '██║ ╚████║██║╚██████╔╝██║  ██║   ██║   ███████║██║  ██║██║██║        ██║   ',
    '╚═╝  ╚═══╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝╚═╝        ╚═╝   ',
  ];

  console.log('');
  for (const line of art) {
    console.log(`  ${line}`);
  }
  console.log('');
  console.log(chalk.dim('  Coordinating AI agents for your development pipeline.'));
  console.log('');
}

/**
 * Parse a flag value from CLI arguments.
 */
function parseFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) {
    return null;
  }
  return args[idx + 1];
}

/**
 * Generate and install agent profiles from team.yaml + behavior templates.
 * Returns the list of generated file names.
 *
 * `targetDir` overrides the install location. Defaults to `getGlobalAgentsDir()`
 * (~/.claude/agents/). Tests pass a temp dir so they don't clobber real profiles.
 */
export function generateAndInstallProfiles(
  config: TeamConfig,
  presetDir: string,
  repoName: string,
  mainBranch: string,
  overrides?: Record<string, number>,
  repoRoot?: string,
  filterRole?: string,
  targetDir?: string,
): string[] {
  const agentsDir = join(presetDir, 'agents');
  const installDir = targetDir ?? getGlobalAgentsDir();
  mkdirSync(installDir, { recursive: true });

  // Behavior override dir: .claude/nightshift/agents/ in the repo
  const overrideDir = repoRoot
    ? join(repoRoot, '.claude', 'nightshift', 'agents')
    : null;

  let expanded = expandAgentInstances(config, overrides);

  // If filterRole is set, only generate the matching agent
  if (filterRole) {
    expanded = expanded.filter(a => a.role === filterRole || a.agent === filterRole);
  }

  const installed: string[] = [];

  for (const entry of expanded) {
    const baseRole = entry.instanceNumber
      ? entry.role.replace(/-\d+$/, '')
      : entry.role;

    // Template lookup order:
    // 1. Repo-level override: .claude/nightshift/agents/<role>.md
    // 2. Preset template: presets/<team>/agents/<role>.md
    // 3. Legacy: presets/<team>/agents/ns-<team>-<role>.md
    const overridePath = overrideDir ? join(overrideDir, `${baseRole}.md`) : null;
    const templatePath = join(agentsDir, `${baseRole}.md`);
    const legacyPath = join(agentsDir, `ns-${config.name}-${baseRole}.md`);

    let behaviorTemplate: string;
    if (overridePath && existsSync(overridePath)) {
      behaviorTemplate = readFileSync(overridePath, 'utf-8');
    } else if (existsSync(templatePath)) {
      behaviorTemplate = readFileSync(templatePath, 'utf-8');
    } else if (existsSync(legacyPath)) {
      behaviorTemplate = readFileSync(legacyPath, 'utf-8');
    } else {
      throw new Error(
        `Behavior template not found for agent "${baseRole}" in ${agentsDir}. ` +
        `Expected: ${baseRole}.md`
      );
    }

    const vars = buildTemplateVars(
      config,
      baseRole,
      repoName,
      mainBranch,
      entry.instanceNumber,
    );

    const content = generateAgentFile({
      teamConfig: config,
      agentName: baseRole,
      behaviorTemplate,
      templateVars: vars,
      instanceNumber: entry.instanceNumber,
    });

    const fileName = `${entry.agent}.md`;
    writeFileSync(join(installDir, fileName), content);
    installed.push(fileName);
  }

  return installed;
}

/**
 * Build the CLAUDE.md team subsection dynamically from team.yaml.
 */
function buildTeamSubsectionFromConfig(config: TeamConfig, repoName: string, overrides?: Record<string, number>): string {
  const teamDir = getTeamDir(repoName, config.name);
  const expanded = expandAgentInstances(config, overrides);

  let rows = '';
  for (const entry of expanded) {
    const hasWorktree = entry.definition.worktree !== false;
    const location = hasWorktree
      ? `\`${teamDir}/worktrees/${entry.role}/\``
      : '_(runs from main)_';
    rows += `| @${entry.agent} | ${entry.definition.description} | ${location} |\n`;
  }

  return `### ${config.name}\n| Agent | Role | Worktree |\n|-------|------|----------|\n${rows}\nConfig: \`.claude/nightshift/ns-${config.name}-*.md\`\n`;
}

/**
 * List available preset names by scanning the presets directory.
 */
function listAvailablePresets(): string[] {
  const presetsDir = join(getPresetDir(''), '..');
  if (!existsSync(presetsDir)) {
    return [];
  }
  return readdirSync(presetsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Generate repo.md content from detected project settings.
 */
export async function generateRepoMd(packageManager: string, language: string, scripts: DetectedScripts, mainBranch: string, skipPrompts: boolean): Promise<string> {
  const pm = packageManager || 'npm';

  // Build command strings from detected scripts
  let installCmd = `${pm} install`;
  let buildCmd = scripts.build ? `${pm} run build` : 'TODO';
  let typecheckCmd = scripts.typecheck ? `${pm} run typecheck` : 'TODO';
  let testCmd = scripts.test ? `${pm} run test` : 'TODO';
  let lintCmd = scripts.lint ? `${pm} run lint` : 'TODO';

  // Build verification command from available scripts
  const verifyParts: string[] = [];
  if (scripts.typecheck) verifyParts.push(`${pm} run typecheck`);
  if (scripts.lint) verifyParts.push(`${pm} run lint`);
  if (scripts.test) verifyParts.push(`${pm} run test`);
  let verifyCmd = verifyParts.length > 0 ? verifyParts.join(' && ') : 'TODO';

  if (!skipPrompts) {
    console.log('');
    console.log(chalk.bold('Configure repo.md (shared across all teams):'));
    console.log(chalk.dim('  Press Enter to accept detected values.'));
    console.log('');

    const response = await prompts([
      {
        type: 'text',
        name: 'installCmd',
        message: 'Install dependencies command',
        initial: installCmd,
      },
      {
        type: 'text',
        name: 'buildCmd',
        message: 'Build command',
        initial: buildCmd,
      },
      {
        type: 'text',
        name: 'typecheckCmd',
        message: 'Typecheck command',
        initial: typecheckCmd,
      },
      {
        type: 'text',
        name: 'testCmd',
        message: 'Test command',
        initial: testCmd,
      },
      {
        type: 'text',
        name: 'lintCmd',
        message: 'Lint command',
        initial: lintCmd,
      },
      {
        type: 'text',
        name: 'verifyCmd',
        message: 'Verification command (run before PRs)',
        initial: verifyCmd,
      },
    ]);

    installCmd = response.installCmd || installCmd;
    buildCmd = response.buildCmd || buildCmd;
    typecheckCmd = response.typecheckCmd || typecheckCmd;
    testCmd = response.testCmd || testCmd;
    lintCmd = response.lintCmd || lintCmd;
    verifyCmd = response.verifyCmd || verifyCmd;
  }

  return `# Repo Configuration

> This file contains repo-level settings shared across all nightshift teams.
> Generated by \`npx nightshift init\`. Customize for your project.

## Commands

| Action | Command |
|--------|---------|
| Install dependencies | \`${installCmd}\` |
| Build | \`${buildCmd}\` |
| Typecheck | \`${typecheckCmd}\` |
| Test | \`${testCmd}\` |
| Lint | \`${lintCmd}\` |

## Verification Command

Run this before creating PRs or reporting test results:

\`\`\`bash
${verifyCmd}
\`\`\`

## Branch Naming

Pattern: \`issue-{number}-{slug}\`

Example: \`issue-27-add-user-settings\`

The slug is 2-3 words from the issue title, kebab-case.

## Commit Messages

Pattern: \`{type}(issue-{number}): {description}\`

Where \`{type}\` is:
- \`feat\` — new feature
- \`fix\` — bug fix

## Tracker

| Setting | Value |
|---------|-------|
| Type | \`github\` |

## Runner

The command used to start Claude Code in each tmux pane (via \`npx nightshift start\`):

\`\`\`
claude --dangerously-skip-permissions
\`\`\`
`;
}

/**
 * Append or update the nightshift team section in CLAUDE.md.
 * The subsection content is a placeholder — callers should replace it with
 * buildTeamSubsectionFromConfig() output after this structural insert.
 */
export function appendClaudeMd(repoRoot: string, repoName: string, team: string): void {
  const claudeMdPath = join(repoRoot, 'CLAUDE.md');

  // Placeholder subsection (overwritten by caller with dynamic content)
  const teamSubsection = `### ${team}\n_(agents configured via team.yaml)_\n`;

  if (!existsSync(claudeMdPath)) {
    // Create CLAUDE.md from scratch
    const content = `# ${repoName}\n\nProject documentation.\n\n## Nightshift Teams\n\n${teamSubsection}`;
    writeFileSync(claudeMdPath, content);
    return;
  }

  let content = readFileSync(claudeMdPath, 'utf-8');

  if (!content.includes('## Nightshift Teams')) {
    // Append the section
    content = content.trimEnd() + `\n\n## Nightshift Teams\n\n${teamSubsection}`;
    writeFileSync(claudeMdPath, content);
    return;
  }

  // ## Nightshift Teams exists — check for ### <team>
  const teamHeader = `### ${team}`;
  const teamHeaderIdx = content.indexOf(teamHeader);

  if (teamHeaderIdx === -1) {
    // Append the team subsection at the end of the Nightshift Teams section
    // Find the next ## heading after ## Nightshift Teams, or end of file
    const nightshiftIdx = content.indexOf('## Nightshift Teams');
    const afterNightshift = content.indexOf('\n## ', nightshiftIdx + 1);

    if (afterNightshift === -1) {
      // No next section — append at end
      content = content.trimEnd() + `\n\n${teamSubsection}`;
    } else {
      // Insert before the next ## section
      content = content.slice(0, afterNightshift).trimEnd() + `\n\n${teamSubsection}\n` + content.slice(afterNightshift);
    }
    writeFileSync(claudeMdPath, content);
    return;
  }

  // ### <team> exists — replace it
  // Find the end of this team subsection (next ### or ## or end of file)
  const afterTeamHeader = content.indexOf('\n', teamHeaderIdx);
  let endOfTeamSection = content.length;

  // Look for next ### or ## heading
  const nextH3 = content.indexOf('\n### ', afterTeamHeader + 1);
  const nextH2 = content.indexOf('\n## ', afterTeamHeader + 1);

  if (nextH3 !== -1 && (nextH2 === -1 || nextH3 < nextH2)) {
    endOfTeamSection = nextH3;
  } else if (nextH2 !== -1) {
    endOfTeamSection = nextH2;
  }

  content = content.slice(0, teamHeaderIdx) + teamSubsection + content.slice(endOfTeamSection);
  writeFileSync(claudeMdPath, content);
}

/**
 * Run the full nightshift init flow.
 */
export async function init(args: string[]): Promise<void> {
  // 1. Parse flags
  const team = parseFlag(args, '--team');
  const codersFlag = parseFlag(args, '--coders');
  const fromPath = parseFlag(args, '--from');
  const yes = args.includes('--yes');
  const reset = args.includes('--reset');
  const resetRepo = args.includes('--reset-repo');

  // 2. Validate --team required
  if (!team) {
    console.error(chalk.red('Please specify a team: npx nightshift init --team dev'));
    process.exit(1);
  }

  // 3. Validate team name
  if (!validateTeamName(team)) {
    console.error(chalk.red(`Invalid team name "${team}". Must start with a lowercase letter, contain only lowercase letters, digits, and hyphens, and end with a letter or digit.`));
    process.exit(1);
  }

  // 4. Resolve team definition directory.
  //    Lookup chain: --from path → .claude/nightshift/teams/<team>/ → presets/<team>/
  let presetDir: string;
  if (fromPath) {
    if (!existsSync(fromPath) || !existsSync(join(fromPath, 'team.yaml'))) {
      console.error(chalk.red(`Custom team path "${fromPath}" does not exist or has no team.yaml.`));
      process.exit(1);
    }
    presetDir = fromPath;
  } else {
    // Try repo-local first (needs repo root, so detect early)
    let earlyRepoRoot: string | null = null;
    try { earlyRepoRoot = detectRepoRoot(); } catch { /* will fail properly later */ }

    const localDir = earlyRepoRoot ? join(earlyRepoRoot, '.claude', 'nightshift', 'teams', team) : null;
    if (localDir && existsSync(join(localDir, 'team.yaml'))) {
      presetDir = localDir;
    } else {
      presetDir = getPresetDir(team);
      if (!existsSync(presetDir)) {
        const available = listAvailablePresets();
        console.error(chalk.red(`Unknown team: ${team}. Available: ${available.join(', ')}`));
        console.error(chalk.dim('  You can also provide a custom team directory with --from <path>'));
        process.exit(1);
      }
    }
  }

  const teamYamlPath = join(presetDir, 'team.yaml');
  if (!existsSync(teamYamlPath)) {
    console.error(chalk.red(`No team.yaml found in ${presetDir}. Every team requires a team.yaml.`));
    process.exit(1);
  }

  const teamConfig = parseTeamConfig(teamYamlPath);
  const validation = validateTeamConfig(teamConfig);
  if (!validation.valid) {
    console.error(chalk.red(`Invalid team.yaml: ${validation.errors.map(e => e.message).join(', ')}`));
    process.exit(1);
  }

  // Validate that every agent has a behavior template
  const agentsDir = join(presetDir, 'agents');
  for (const role of Object.keys(teamConfig.agents)) {
    const templatePath = join(agentsDir, `${role}.md`);
    const legacyPath = join(agentsDir, `ns-${team}-${role}.md`);
    if (!existsSync(templatePath) && !existsSync(legacyPath)) {
      console.error(chalk.red(`Missing behavior template for agent "${role}" in ${agentsDir}/`));
      console.error(chalk.dim(`  Expected: ${role}.md`));
      process.exit(1);
    }
  }

  // 5. Print banner
  printBanner();

  // 6. Check prerequisites
  console.log(chalk.bold('Checking prerequisites...'));

  const prerequisites = [
    { cmd: 'git', label: 'git', install: 'https://git-scm.com/downloads' },
    { cmd: 'gh', label: 'GitHub CLI (gh)', install: 'https://cli.github.com/' },
    { cmd: 'claude', label: 'Claude Code', install: 'https://docs.anthropic.com/claude-code' },
  ];

  let missingPrereqs = false;
  for (const prereq of prerequisites) {
    if (isAvailable(prereq.cmd)) {
      console.log(`  ${chalk.green('v')} ${prereq.label}`);
    } else {
      console.log(`  ${chalk.red('x')} ${prereq.label} — install: ${prereq.install}`);
      missingPrereqs = true;
    }
  }

  if (missingPrereqs) {
    console.log('');
    console.error(chalk.red('Missing prerequisites. Install them and try again.'));
    process.exit(1);
  }

  // 7. Validate repository
  console.log('');
  console.log(chalk.bold('Validating repository...'));
  let repoRoot: string;
  try {
    repoRoot = detectRepoRoot();
    console.log(`  ${chalk.green('v')} Git repository found`);
  } catch (err) {
    console.log(`  ${chalk.red('x')} ${(err as Error).message}`);
    process.exit(1);
  }

  try {
    detectRemote();
    console.log(`  ${chalk.green('v')} Remote origin configured`);
  } catch (err) {
    console.log(`  ${chalk.red('x')} ${(err as Error).message}`);
    process.exit(1);
  }

  // 8. Detect project
  console.log('');
  console.log(chalk.bold('Detecting project...'));
  const repoName = detectRepoName();
  const mainBranch = detectMainBranch();
  const packageManager = detectPackageManager(repoRoot);
  const language = detectLanguage(repoRoot);
  const scripts = detectScripts(repoRoot);
  console.log(`  ${chalk.green('v')} Repository: ${repoName}`);
  console.log(`  ${chalk.green('v')} Main branch: ${mainBranch}`);
  console.log(`  ${chalk.green('v')} Package manager: ${packageManager}`);
  console.log(`  ${chalk.green('v')} Language: ${language}`);

  // 8b. Short-circuit if this team is already fully initialized for this repo.
  //     `nightshift init` is meant to run once per (repo, team). Running it
  //     again — especially by accident from a linked worktree — would race
  //     against the existing `_ns/<team>/*` branches in git and surface a raw
  //     `git worktree add` failure. Exit cleanly with guidance instead.
  if (!reset) {
    const missing = checkTeamInitialized(teamConfig, repoName);
    if (missing.length === 0) {
      const teamDir = getTeamDir(repoName, team);
      console.log('');
      console.log(chalk.yellow(`Team "${team}" is already initialized for ${repoName}.`));
      console.log('');
      console.log(chalk.dim(`  Agent profiles: ~/.claude/agents/ns-${team}-*.md`));
      console.log(chalk.dim(`  Worktrees:      ${teamDir}/worktrees/`));
      console.log('');
      console.log(chalk.bold('Next steps:'));
      console.log(`  Start agents:    ${chalk.cyan(`npx nightshift start --team ${team}`)}`);
      console.log(`  Regen profiles:  ${chalk.cyan(`npx nightshift reinit --team ${team}`)}`);
      console.log(`  Remove team:     ${chalk.cyan(`npx nightshift teardown --team ${team}`)}`);
      console.log('');
      console.log(chalk.dim(`  (Use --reset to rewrite team config files without touching worktrees.)`));
      console.log('');
      return;
    }
  }

  // 9. Setup repo.md (only on first init or --reset-repo)
  console.log('');
  console.log(chalk.bold('Setting up repo.md...'));
  const repoMdPath = join(repoRoot, '.claude', 'nightshift', 'repo.md');
  if (!existsSync(repoMdPath) || resetRepo) {
    if (resetRepo && existsSync(repoMdPath) && !args.includes('--force')) {
      const confirm = await prompts({
        type: 'confirm',
        name: 'value',
        message: 'This will reset repo.md which affects all teams. Continue?',
        initial: false,
      });
      if (!confirm.value) {
        console.log(`  ${chalk.dim('  repo.md reset skipped')}`);
      } else {
        const content = await generateRepoMd(packageManager, language, scripts, mainBranch, yes);
        mkdirSync(join(repoRoot, '.claude', 'nightshift'), { recursive: true });
        writeFileSync(repoMdPath, content);
        console.log(`  ${chalk.green('v')} repo.md created`);
      }
    } else {
      const content = await generateRepoMd(packageManager, language, scripts, mainBranch, yes);
      mkdirSync(join(repoRoot, '.claude', 'nightshift'), { recursive: true });
      writeFileSync(repoMdPath, content);
      console.log(`  ${chalk.green('v')} repo.md created`);
    }
  } else {
    console.log(`  ${chalk.dim('  repo.md already exists (skipped)')}`);
  }

  // 10. Setup team config — scalable agent counts
  console.log('');
  console.log(chalk.bold(`Setting up ${team} team...`));

  // Build scalable agent overrides from --coders flag
  let scalableOverrides: Record<string, number> | undefined;

  const scalableAgents = getScalableAgents(teamConfig);
  const primaryScalable = scalableAgents[0]; // first scalable agent from team.yaml

  if (codersFlag && primaryScalable) {
    const count = parseInt(codersFlag, 10);
    const agentDef = teamConfig.agents[primaryScalable];
    const maxInstances = agentDef.max_instances ?? 4;
    if (isNaN(count) || count < 1 || count > maxInstances) {
      console.error(chalk.red(`Invalid --coders value. Must be between 1 and ${maxInstances}.`));
      process.exit(1);
    }
    scalableOverrides = { [primaryScalable]: count };
  } else if (!codersFlag && !yes && primaryScalable) {
    const agentDef = teamConfig.agents[primaryScalable];
    const defaultInstances = agentDef.instances ?? 1;
    const maxInstances = agentDef.max_instances ?? 4;
    const response = await prompts({
      type: 'number',
      name: 'count',
      message: `Number of ${primaryScalable} agents (1-${maxInstances})`,
      initial: defaultInstances,
      min: 1,
      max: maxInstances,
    });
    const count = response.count || defaultInstances;
    if (count !== defaultInstances) {
      scalableOverrides = { [primaryScalable]: count };
    }
  }

  // 11. Copy team extension files (if not exist or --reset)
  console.log('');
  console.log(chalk.bold('Setting up team config...'));
  if (reset) {
    // Remove existing ns-<team>-*.md extension files before copying fresh.
    // IMPORTANT: Never touch .claude/nightshift/agents/ — those are user
    // behavior overrides that must survive --reset.
    const nightshiftExtDir = join(repoRoot, '.claude', 'nightshift');
    if (existsSync(nightshiftExtDir)) {
      const existingFiles = readdirSync(nightshiftExtDir, { withFileTypes: true })
        .filter(
          (entry) => entry.isFile() && entry.name.startsWith(`ns-${team}-`) && entry.name.endsWith('.md')
        )
        .map(entry => entry.name);
      for (const file of existingFiles) {
        unlinkSync(join(nightshiftExtDir, file));
      }
    }
  }
  const { copied, skipped } = copyExtensionFiles(repoRoot, team);
  console.log(
    `  ${chalk.green('v')} ${copied.length} extension files created in .claude/nightshift/`
  );
  if (skipped.length > 0) {
    console.log(
      `  ${chalk.dim(`  ${skipped.length} files skipped (already exist)`)}`
    );
  }

  // 11b. Copy scaffold files to repo root (if preset has a scaffold/ directory)
  const scaffold = copyScaffoldFiles(repoRoot, presetDir);
  if (scaffold.copied.length > 0 || scaffold.skipped.length > 0) {
    console.log(
      `  ${chalk.green('v')} ${scaffold.copied.length} scaffold files created in repo root`
    );
    if (scaffold.skipped.length > 0) {
      console.log(
        `  ${chalk.dim(`  ${scaffold.skipped.length} scaffold files skipped (already exist)`)}`
      );
    }
  }

  // 12. Create labels from team.yaml stages
  console.log('');
  console.log(chalk.bold('Creating GitHub labels...'));
  try {
    const labelsCreated = createLabelsFromConfig(teamConfig);
    console.log(
      `  ${chalk.green('v')} ${labelsCreated} labels created`
    );
  } catch (err) {
    console.log(`  ${chalk.red('x')} Failed to create labels: ${(err as Error).message}`);
    console.log(
      `  ${chalk.dim('  Make sure you are authenticated with gh: gh auth login')}`
    );
    process.exit(1);
  }

  // 13. Build roles array for worktrees
  const expanded = expandAgentInstances(teamConfig, scalableOverrides);
  // Only agents with worktree !== false get worktrees
  const roles = expanded
    .filter(a => a.definition.worktree !== false)
    .map(a => a.role);

  // 14. Create worktrees
  console.log('');
  console.log(chalk.bold('Creating agent worktrees...'));
  const teamDir = getTeamDir(repoName, team);
  try {
    createWorktrees(repoName, team, roles, mainBranch);
    console.log(`  ${chalk.green('v')} Worktrees created at ${teamDir}/worktrees/`);
  } catch (err) {
    console.log(`  ${chalk.red('x')} Failed to create worktrees: ${(err as Error).message}`);
    process.exit(1);
  }

  // 15. Install deps in worktrees
  console.log('');
  console.log(chalk.bold('Installing dependencies in worktrees...'));
  for (const role of roles) {
    const wtPath = join(teamDir, 'worktrees', role);
    try {
      execSync(`${packageManager} install`, {
        cwd: wtPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000,
      });
      console.log(`  ${chalk.green('v')} ${role}`);
    } catch {
      console.log(`  ${chalk.yellow('~')} ${role} — install may need manual run`);
    }
  }

  // 16. Install agent profiles
  console.log('');
  console.log(chalk.bold('Installing agent profiles...'));
  try {
    const installed = generateAndInstallProfiles(
      teamConfig, presetDir, repoName, mainBranch, scalableOverrides, repoRoot,
    );
    console.log(
      `  ${chalk.green('v')} ${installed.length} profiles generated to ~/.claude/agents/`
    );
  } catch (err) {
    console.log(`  ${chalk.red('x')} Failed to install profiles: ${(err as Error).message}`);
    process.exit(1);
  }

  // 17. Update .gitignore with Claude Code runtime artifacts
  console.log('');
  console.log(chalk.bold('Updating .gitignore...'));
  try {
    const gitignorePath = join(repoRoot, '.gitignore');
    const marker = '# Claude Code runtime (added by nightshift)';
    const entries = `\n${marker}\n.claude/agent-memory/\n.claude/scheduled_tasks.lock\n`;
    let content = '';
    if (existsSync(gitignorePath)) {
      content = readFileSync(gitignorePath, 'utf-8');
    }
    if (!content.includes(marker)) {
      writeFileSync(gitignorePath, content.trimEnd() + '\n' + entries);
      console.log(`  ${chalk.green('v')} .gitignore updated`);
    } else {
      console.log(`  ${chalk.dim('  .gitignore already configured (skipped)')}`);
    }
  } catch (err) {
    console.log(`  ${chalk.yellow('~')} Failed to update .gitignore: ${(err as Error).message}`);
  }

  // 18. Update CLAUDE.md
  console.log('');
  console.log(chalk.bold('Updating CLAUDE.md...'));
  try {
    const teamSubsection = buildTeamSubsectionFromConfig(teamConfig, repoName, scalableOverrides);
    const claudeMdPath = join(repoRoot, 'CLAUDE.md');
    if (!existsSync(claudeMdPath)) {
      writeFileSync(claudeMdPath, `# ${repoName}\n\nProject documentation.\n\n## Nightshift Teams\n\n${teamSubsection}`);
    } else {
      // Use existing appendClaudeMd for the structural insert, then patch subsection
      appendClaudeMd(repoRoot, repoName, team);
      // Re-read and replace the team subsection with the dynamic one
      let claudeContent = readFileSync(claudeMdPath, 'utf-8');
      const teamHeader = `### ${team}`;
      const teamIdx = claudeContent.indexOf(teamHeader);
      if (teamIdx !== -1) {
        const afterHeader = claudeContent.indexOf('\n', teamIdx);
        let endOfSection = claudeContent.length;
        const nextH3 = claudeContent.indexOf('\n### ', afterHeader + 1);
        const nextH2 = claudeContent.indexOf('\n## ', afterHeader + 1);
        if (nextH3 !== -1 && (nextH2 === -1 || nextH3 < nextH2)) {
          endOfSection = nextH3;
        } else if (nextH2 !== -1) {
          endOfSection = nextH2;
        }
        claudeContent = claudeContent.slice(0, teamIdx) + teamSubsection + claudeContent.slice(endOfSection);
        writeFileSync(claudeMdPath, claudeContent);
      }
    }
    console.log(`  ${chalk.green('v')} Team section added to CLAUDE.md`);
  } catch (err) {
    console.log(`  ${chalk.red('x')} Failed to update CLAUDE.md: ${(err as Error).message}`);
  }

  // 19. Print next steps
  console.log('');
  console.log(chalk.green.bold('Done! nightshift is set up.'));
  console.log('');

  const agentList = expanded.map(a => a.agent);

  console.log(chalk.bold('Agents:'));
  for (const agent of agentList) {
    console.log(`  @${agent}`);
  }
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log('');
  console.log('  1. Customize your team config:');
  console.log(`     ${chalk.dim('.claude/nightshift/repo.md')}      — commands and settings (shared)`);
  console.log(`     ${chalk.dim(`.claude/nightshift/ns-${team}-*.md`)} — team-specific config`);
  console.log('');
  console.log('  2. Commit the pipeline files:');
  console.log(`     ${chalk.cyan(`git add .gitignore .claude/nightshift/ CLAUDE.md && git commit -m "chore: set up nightshift ${team} team"`)}`);
  console.log('');
  console.log('  3. Start the agents:');
  console.log(`     ${chalk.cyan(`npx nightshift start --team ${team}`)}`);
  console.log('');
  console.log(chalk.dim('     Or start individually in separate terminals:'));
  for (const agent of agentList) {
    console.log(`     ${chalk.dim(`/loop 15m @${agent}`)}`);
  }
  console.log('');
}
