import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface CopyResult {
  copied: string[];
  skipped: string[];
}

/**
 * Get the path to a team's preset directory.
 */
export function getPresetDir(team: string): string {
  return join(__dirname, '..', 'presets', team);
}

/**
 * Get the path to a team's preset agents directory.
 */
export function getPresetAgentsDir(team: string): string {
  return join(getPresetDir(team), 'agents');
}

/**
 * Get the path to a team's preset defaults directory.
 */
export function getPresetDefaultsDir(team: string): string {
  return join(getPresetDir(team), 'defaults');
}

/**
 * Get the path to the nightshift package's shared defaults directory.
 */
export function getDefaultsDir(): string {
  return join(__dirname, '..', 'defaults');
}

/**
 * Get the path to the global Claude agents directory.
 */
export function getGlobalAgentsDir(): string {
  return join(homedir(), '.claude', 'agents');
}

/**
 * Copy agent profiles to the global ~/.claude/agents/ directory.
 */
export function copyAgentProfiles(team: string, coderCount: number): string[] {
  const agentsDir = getPresetAgentsDir(team);
  const targetDir = getGlobalAgentsDir();
  const copied: string[] = [];
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
 */
export function copyExtensionFiles(repoRoot: string, team: string): CopyResult {
  const defaultsDir = getPresetDefaultsDir(team);
  const targetDir = join(repoRoot, '.claude', 'nightshift');
  const copied: string[] = [];
  const skipped: string[] = [];

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
 */
export function copyRepoMd(repoRoot: string, content: string): boolean {
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
 */
export function removeAgentProfiles(team: string): string[] {
  const targetDir = getGlobalAgentsDir();
  const removed: string[] = [];
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
 */
export function removeExtensionFiles(repoRoot: string, team: string): string[] {
  const targetDir = join(repoRoot, '.claude', 'nightshift');
  const removed: string[] = [];
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
 */
export function removeRepoMd(repoRoot: string): boolean {
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
