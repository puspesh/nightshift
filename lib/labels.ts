import { execSync } from 'node:child_process';
import type { TeamConfig } from './team-config.js';
import { getLabelsFromConfig } from './team-config.js';

export interface Label {
  status: string;
  color: string;
  description: string;
}

/**
 * Create team-scoped labels from a TeamConfig (team.yaml).
 * Idempotent — existing labels are left unchanged.
 */
export function createLabelsFromConfig(config: TeamConfig): number {
  const labels = getLabelsFromConfig(config);
  let created = 0;
  for (const label of labels) {
    const name = `${config.name}:${label.status}`;
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
 */
export function removeLabels(team: string): number {
  let removed = 0;
  try {
    const output = execSync(`gh label list --json name --limit 100`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const allLabels: { name: string }[] = JSON.parse(output);
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
