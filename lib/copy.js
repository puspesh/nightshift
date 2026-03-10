import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the path to a team's preset directory.
 * @param {string} team - Team name (e.g. 'dev')
 * @returns {string} Path to nightshift/presets/<team>/
 */
export function getPresetDir(team) {
  return join(__dirname, '..', 'presets', team);
}

/**
 * Get the path to a team's preset agents directory.
 * @param {string} team - Team name (e.g. 'dev')
 * @returns {string} Path to nightshift/presets/<team>/agents/
 */
export function getPresetAgentsDir(team) {
  return join(getPresetDir(team), 'agents');
}

/**
 * Get the path to a team's preset defaults directory.
 * @param {string} team - Team name (e.g. 'dev')
 * @returns {string} Path to nightshift/presets/<team>/defaults/
 */
export function getPresetDefaultsDir(team) {
  return join(getPresetDir(team), 'defaults');
}

/**
 * Get the path to the nightshift package's shared defaults directory.
 * Contains repo.md template shared across all presets.
 * @returns {string} Path to nightshift/defaults/
 */
export function getDefaultsDir() {
  return join(__dirname, '..', 'defaults');
}

/**
 * Get the path to the global Claude agents directory.
 * @returns {string} Path to ~/.claude/agents/
 */
export function getGlobalAgentsDir() {
  return join(homedir(), '.claude', 'agents');
}

/**
 * Copy agent profiles to the global ~/.claude/agents/ directory.
 * For the coder template (ns-<team>-coder.md), stamps N copies with numbered
 * names (ns-<team>-coder-1.md through ns-<team>-coder-<N>.md), replacing
 * occurrences of `ns-<team>-coder` with `ns-<team>-coder-<N>` in the content.
 * Non-coder agents are copied directly.
 *
 * @param {string} team - Team name (e.g. 'dev')
 * @param {number} coderCount - Number of coder instances to stamp
 * @returns {string[]} List of copied file names
 */
export function copyAgentProfiles(team, coderCount) {
  const agentsDir = getPresetAgentsDir(team);
  const targetDir = getGlobalAgentsDir();
  const copied = [];
  const prefix = `ns-${team}-`;
  const coderBaseName = `ns-${team}-coder`;

  mkdirSync(targetDir, { recursive: true });

  const files = readdirSync(agentsDir).filter(
    (f) => f.startsWith(prefix) && f.endsWith('.md'),
  );

  for (const file of files) {
    const nameWithoutExt = basename(file, '.md');

    if (nameWithoutExt === coderBaseName) {
      // Stamp N copies of the coder template
      const templateContent = readFileSync(join(agentsDir, file), 'utf8');
      for (let i = 1; i <= coderCount; i++) {
        const stampedName = `${coderBaseName}-${i}`;
        const stampedFile = `${stampedName}.md`;
        const stampedContent = templateContent.replaceAll(
          coderBaseName,
          stampedName,
        );
        writeFileSync(join(targetDir, stampedFile), stampedContent);
        copied.push(stampedFile);
      }
    } else {
      // Non-coder agent — copy directly
      copyFileSync(join(agentsDir, file), join(targetDir, file));
      copied.push(file);
    }
  }

  return copied;
}

/**
 * Copy default extension files to the repo's .claude/nightshift/ directory.
 * Copies from the team's preset defaults. Skips files that already exist
 * to preserve user customizations.
 *
 * @param {string} repoRoot - Path to the repository root
 * @param {string} team - Team name (e.g. 'dev')
 * @returns {{ copied: string[], skipped: string[] }} Lists of copied and skipped files
 */
export function copyExtensionFiles(repoRoot, team) {
  const defaultsDir = getPresetDefaultsDir(team);
  const targetDir = join(repoRoot, '.claude', 'nightshift');
  const copied = [];
  const skipped = [];

  mkdirSync(targetDir, { recursive: true });

  const files = readdirSync(defaultsDir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const targetPath = join(targetDir, file);
    if (existsSync(targetPath)) {
      skipped.push(file);
    } else {
      copyFileSync(join(defaultsDir, file), targetPath);
      copied.push(file);
    }
  }

  return { copied, skipped };
}

/**
 * Write repo.md content to the repo's .claude/nightshift/ directory.
 * Only writes if the file does not already exist.
 *
 * @param {string} repoRoot - Path to the repository root
 * @param {string} content - Content to write to repo.md
 * @returns {boolean} Whether the file was written
 */
export function copyRepoMd(repoRoot, content) {
  const targetDir = join(repoRoot, '.claude', 'nightshift');
  const targetPath = join(targetDir, 'repo.md');

  if (existsSync(targetPath)) {
    return false;
  }

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(targetPath, content);
  return true;
}

/**
 * Remove nightshift agent profiles for a team from ~/.claude/agents/.
 * Removes files matching ns-<team>-*.md.
 *
 * @param {string} team - Team name (e.g. 'dev')
 * @returns {string[]} List of removed file names
 */
export function removeAgentProfiles(team) {
  const targetDir = getGlobalAgentsDir();
  const removed = [];
  const prefix = `ns-${team}-`;

  if (!existsSync(targetDir)) {
    return removed;
  }

  const files = readdirSync(targetDir).filter(
    (f) => f.startsWith(prefix) && f.endsWith('.md'),
  );

  for (const file of files) {
    try {
      unlinkSync(join(targetDir, file));
      removed.push(file);
    } catch {
      // File may already be removed
    }
  }

  return removed;
}

/**
 * Remove team-specific extension files from .claude/nightshift/.
 * Removes files matching ns-<team>-*.md. Does NOT remove repo.md
 * or other teams' files.
 *
 * @param {string} repoRoot - Path to the repository root
 * @param {string} team - Team name (e.g. 'dev')
 * @returns {string[]} List of removed file names
 */
export function removeExtensionFiles(repoRoot, team) {
  const targetDir = join(repoRoot, '.claude', 'nightshift');
  const removed = [];
  const prefix = `ns-${team}-`;

  if (!existsSync(targetDir)) {
    return removed;
  }

  const files = readdirSync(targetDir).filter(
    (f) => f.startsWith(prefix) && f.endsWith('.md'),
  );

  for (const file of files) {
    try {
      unlinkSync(join(targetDir, file));
      removed.push(file);
    } catch {
      // File may already be removed
    }
  }

  return removed;
}

/**
 * Remove .claude/nightshift/repo.md from the repository.
 *
 * @param {string} repoRoot - Path to the repository root
 * @returns {boolean} Whether the file was removed
 */
export function removeRepoMd(repoRoot) {
  const targetPath = join(repoRoot, '.claude', 'nightshift', 'repo.md');

  if (!existsSync(targetPath)) {
    return false;
  }

  try {
    unlinkSync(targetPath);
    return true;
  } catch {
    return false;
  }
}
