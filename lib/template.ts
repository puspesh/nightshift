/**
 * Simple mustache-style template engine for agent behavior templates.
 * Replaces {{variable}} with values from a vars map.
 * Throws on undefined variables — generated files must be fully self-contained.
 */

const VAR_PATTERN = /\{\{([a-z_][a-z0-9_]*)\}\}/g;

/**
 * Render a template by replacing all {{key}} with vars[key].
 * Throws if any {{key}} has no matching entry in vars.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  const undefined_vars = validateTemplateVars(template, Object.keys(vars));
  if (undefined_vars.length > 0) {
    throw new Error(
      `Undefined template variables: ${undefined_vars.map(v => `{{${v}}}`).join(', ')}. ` +
      `Available variables: ${Object.keys(vars).join(', ')}`
    );
  }

  return template.replace(VAR_PATTERN, (_, key: string) => vars[key]);
}

/**
 * Extract all unique {{variable}} names from a template.
 */
export function extractTemplateVars(template: string): string[] {
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(VAR_PATTERN.source, 'g');
  while ((match = re.exec(template)) !== null) {
    vars.add(match[1]);
  }
  return [...vars];
}

/**
 * Return variable names referenced in template but not in availableVars.
 */
export function validateTemplateVars(template: string, availableVars: string[]): string[] {
  const used = extractTemplateVars(template);
  const available = new Set(availableVars);
  return used.filter(v => !available.has(v));
}
