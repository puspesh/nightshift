import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
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
 * Get the path to the global Claude agents directory.
 */
export function getGlobalAgentsDir(): string {
  return join(homedir(), '.claude', 'agents');
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

  const files = readdirSync(defaultsDir).filter((f) => f.endsWith('.md') || f.endsWith('.json'));

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
    (f) => f.startsWith(prefix) && (f.endsWith('.md') || f.endsWith('.json')),
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
 * Get the path to a team's preset scaffold directory.
 * Takes a resolved presetDir path (not a team name) to support custom
 * --from paths in `ns init`, unlike getPresetAgentsDir/getPresetDefaultsDir
 * which resolve internally via getPresetDir(team).
 */
export function getPresetScaffoldDir(presetDir: string): string {
  return join(presetDir, 'scaffold');
}

/**
 * Copy scaffold files from presets/<team>/scaffold/ to the repo root.
 * Recursively walks the scaffold directory and recreates the directory tree
 * under repoRoot. Skips files that already exist (same pattern as copyExtensionFiles).
 */
export function copyScaffoldFiles(repoRoot: string, presetDir: string): CopyResult {
  const scaffoldDir = getPresetScaffoldDir(presetDir);
  const copied: string[] = [];
  const skipped: string[] = [];

  if (!existsSync(scaffoldDir)) {
    return { copied, skipped };
  }

  const entries = readdirSync(scaffoldDir, { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    // Build the relative path from the scaffold dir
    // parentPath is available in Node 20.12+; fall back to (entry as any).path
    const parentPath: string = entry.parentPath ?? (entry as any).path ?? scaffoldDir;
    const relativePath = join(
      parentPath.slice(scaffoldDir.length + 1),
      entry.name,
    );
    const targetPath = join(repoRoot, relativePath);

    if (existsSync(targetPath)) {
      skipped.push(relativePath);
    } else {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(join(parentPath, entry.name), targetPath);
      copied.push(relativePath);
    }
  }

  return { copied, skipped };
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
