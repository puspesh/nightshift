import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CitizenOverrides } from './types.js';

/** Built-in default colors, matching the original hardcoded values. */
export const DEFAULT_ROLE_COLORS: Record<string, string> = {
  producer: '#00cccc',
  planner:  '#cccc00',
  reviewer: '#cc00cc',
  tester:   '#00cc00',
};
export const DEFAULT_CODER_COLOR = '#0066cc';

/**
 * Load citizen overrides from `.claude/nightshift/ns-{team}-citizens.json`.
 * Returns empty object if the file doesn't exist or contains invalid JSON.
 */
export function loadCitizenConfig(repoRoot: string, team: string): CitizenOverrides {
  const configPath = join(repoRoot, '.claude', 'nightshift', `ns-${team}-citizens.json`);
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as CitizenOverrides;
  } catch {
    console.warn(`Warning: Could not parse ${configPath}, using defaults`);
    return {};
  }
}

/**
 * Resolve display name and color for a role.
 * Resolution order:
 *   1. Exact role match in overrides (e.g. "coder-1")
 *   2. Base role "coder" wildcard for coder-N roles
 *   3. Built-in defaults
 */
export function resolveCitizenProps(
  role: string,
  overrides: CitizenOverrides,
): { displayName: string; color: string } {
  // Try exact match first
  const exact = overrides[role];
  if (exact) {
    return {
      displayName: exact.displayName ?? role,
      color: exact.color ?? getDefaultColor(role),
    };
  }

  // Try "coder" wildcard for coder-N roles
  if (role.startsWith('coder-') && overrides['coder']) {
    const wildcard = overrides['coder'];
    return {
      displayName: wildcard.displayName ?? role,
      color: wildcard.color ?? DEFAULT_CODER_COLOR,
    };
  }

  // Built-in defaults
  return {
    displayName: role,
    color: getDefaultColor(role),
  };
}

function getDefaultColor(role: string): string {
  if (role.startsWith('coder-') || role === 'coder') {
    return DEFAULT_CODER_COLOR;
  }
  return DEFAULT_ROLE_COLORS[role] ?? DEFAULT_CODER_COLOR;
}

/**
 * Convert a hex color to a tmux-compatible style string with appropriate
 * foreground color based on background luminance.
 */
export function hexToTmuxStyle(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Relative luminance (ITU-R BT.709)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const fg = luminance > 0.5 ? 'black' : 'white';
  return `fg=${fg},bg=${hex}`;
}
