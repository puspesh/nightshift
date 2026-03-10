import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Load label definitions from a preset directory's labels.json.
 * @param {string} presetDir - Path to the preset directory containing labels.json
 * @returns {Array<{status: string, color: string, description: string}>} Labels array
 */
export function loadLabels(presetDir) {
  const labelsPath = join(presetDir, 'labels.json');
  const data = JSON.parse(readFileSync(labelsPath, 'utf-8'));
  return data.labels;
}

/**
 * Create team-scoped labels (<team>:<status>) on the GitHub repository.
 * Idempotent — existing labels are left unchanged.
 * @param {string} team - Team name prefix for labels
 * @param {string} presetDir - Path to the preset directory containing labels.json
 * @returns {number} Number of labels created
 */
export function createLabels(team, presetDir) {
  const labels = loadLabels(presetDir);
  let created = 0;
  for (const label of labels) {
    const name = `${team}:${label.status}`;
    try {
      execSync(
        `gh label create "${name}" --color "${label.color}" --description "${label.description}"`,
        {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
      created++;
    } catch {
      // Label already exists
    }
  }
  return created;
}

/**
 * Remove all labels matching <team>:* pattern from the GitHub repository.
 * Discovers labels via `gh label list`, then deletes matching ones.
 * @param {string} team - Team name prefix to match
 * @returns {number} Number of labels removed
 */
export function removeLabels(team) {
  let removed = 0;
  try {
    const output = execSync(`gh label list --json name --limit 100`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const allLabels = JSON.parse(output);
    const teamLabels = allLabels.filter((l) => l.name.startsWith(`${team}:`));
    for (const label of teamLabels) {
      try {
        execSync(`gh label delete "${label.name}" --yes`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        removed++;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* gh not available or not in a repo */
  }
  return removed;
}
