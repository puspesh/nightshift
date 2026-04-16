import type { TeamConfig, AgentDefinition } from './team-config.js';
import { renderTemplate } from './template.js';

export interface GenerateOptions {
  teamConfig: TeamConfig;
  agentName: string;         // role name from team.yaml (e.g., "producer")
  behaviorTemplate: string;  // raw behavior markdown with {{mustache}} vars
  templateVars: Record<string, string>;
  instanceNumber?: number;   // for scalable agents
}

/**
 * Generate a complete, self-contained agent .md file by merging
 * behavior template + team.yaml config.
 */
export function generateAgentFile(options: GenerateOptions): string {
  const { teamConfig, agentName, behaviorTemplate, templateVars, instanceNumber } = options;
  const agent = teamConfig.agents[agentName];
  if (!agent) {
    throw new Error(`Agent "${agentName}" not found in team config "${teamConfig.name}".`);
  }

  const fullName = instanceNumber
    ? `ns-${teamConfig.name}-${agentName}-${instanceNumber}`
    : `ns-${teamConfig.name}-${agentName}`;

  const role = instanceNumber ? `${agentName}-${instanceNumber}` : agentName;

  // Build all template vars including generated ones
  const allVars: Record<string, string> = {
    ...templateVars,
    agent_name: fullName,
    agent_role: role,
    agent_base_role: agentName,
    team_name: teamConfig.name,
    instance_number: instanceNumber ? String(instanceNumber) : '',
  };

  // Render behavior template
  const renderedBehavior = renderTemplate(behaviorTemplate, allVars);

  // Assemble the complete file. Frontmatter MUST be on line 1 — Claude Code
  // silently ignores agent files where `---` isn't the first line, so the
  // "managed by nightshift" note goes after the frontmatter as an HTML comment.
  const parts: string[] = [];
  parts.push(generateFrontmatter(agent, fullName));
  parts.push(generateHeader());
  parts.push(generatePipelineAgentBlock(teamConfig, agentName, fullName, role));
  parts.push(renderedBehavior);
  parts.push(generateTeamProtocol(teamConfig, agentName, fullName, role));

  return parts.join('\n');
}

function generateHeader(): string {
  return `<!-- This file is managed by nightshift. Do not edit directly.
     To customize behavior, create an override at .claude/nightshift/agents/ -->
`;
}

/**
 * Generate YAML frontmatter from agent definition.
 */
export function generateFrontmatter(agent: AgentDefinition, fullName: string): string {
  const tools = (agent.tools ?? []).join(', ');
  const model = agent.model ?? 'claude-sonnet-4-20250514';
  return `---
name: ${fullName}
description: >
  ${agent.description}
tools: ${tools}
model: ${model}
memory: project
---
`;
}

/**
 * Generate the PIPELINE-AGENT block with the initial bash command.
 */
function generatePipelineAgentBlock(
  config: TeamConfig,
  agentName: string,
  fullName: string,
  role: string,
): string {
  const agent = config.agents[agentName];
  const hasWorktree = agent.worktree !== false; // default true
  const team = config.name;

  // Build the initial bash command
  let initialCmd: string;
  if (!hasWorktree) {
    // No worktree agent (e.g., producer): status write + gh issue list
    initialCmd =
      `REPO_NAME=$(basename "$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\\.git$||')"); ` +
      `echo "working|$(date +%s)|" > ~/.nightshift/\${REPO_NAME}/${team}/status/${role}; ` +
      `gh issue list --state open --json number,title,labels,updatedAt`;
  } else {
    // Worktree agent: status write + lock check
    initialCmd =
      `REPO_NAME=$(basename "$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\\.git$||')"); ` +
      `echo "working|$(date +%s)|" > ~/.nightshift/\${REPO_NAME}/${team}/status/${role}; ` +
      `cat ~/.nightshift/\${REPO_NAME}/${team}/locks/${fullName}.lock 2>/dev/null`;
  }

  // Build skills instruction based on agent type
  const skillsInstruction = !hasWorktree
    ? 'Skills are NEVER needed for this agent. Do not invoke any.'
    : `Only invoke skills AFTER you have:
1. Found a specific issue via GitHub label query
2. Claimed it with the \`${team}:wip\` label
3. Checked out its feature branch`;

  return `<PIPELINE-AGENT>
STOP. Do NOT check for skills, brainstorm, or explore. You are a pipeline agent.

${skillsInstruction}

Your FIRST action must be this EXACT bash command — nothing else comes before it, do not modify it:
\`\`\`bash
${initialCmd}
\`\`\`

Then follow the Workflow section step by step. If no work is found, output
"No work found. Sleeping." and STOP (the idle status is written automatically at the end — see Status Reporting). Do nothing else.
</PIPELINE-AGENT>
`;
}

/**
 * Generate the Team Protocol section with finding work, transitions,
 * locking, branch protocol, and status reporting commands.
 */
export function generateTeamProtocol(
  config: TeamConfig,
  agentName: string,
  fullName: string,
  role: string,
): string {
  const agent = config.agents[agentName];
  const team = config.name;
  const hasWorktree = agent.worktree !== false;
  const homeBranch = `_ns/${team}/${role}`;

  const sections: string[] = [];
  sections.push('## Team Protocol (Generated)\n');

  // --- Finding Work ---
  sections.push('### Finding Work\n');
  const watchLabels = agent.watches
    .filter(w => w !== 'unlabeled')
    .map(w => `\`${team}:${w}\``);
  const watchesUnlabeled = agent.watches.includes('unlabeled');

  if (watchesUnlabeled) {
    sections.push(`Watch for: issues with no \`${team}:*\` label (unlabeled)`);
    if (watchLabels.length > 0) {
      sections.push(`, and issues labeled ${watchLabels.join(', ')}`);
    }
    sections.push('\n');
  } else {
    sections.push(`Watch for issues labeled: ${watchLabels.join(', ')}\n`);
  }

  for (const watch of agent.watches) {
    if (watch === 'unlabeled') continue;
    sections.push(`\`\`\`bash
# Find ${watch} issues (oldest first, exclude ${team}:wip)
gh issue list --state open --label "${team}:${watch}" --json number,title,createdAt,labels \\
  --jq '[.[] | select(any(.labels[]; .name == "${team}:wip" or .name == "on-hold") | not)] | sort_by(.createdAt) | .[0]'
\`\`\`\n`);
  }

  // --- Claiming ---
  if (hasWorktree) {
    sections.push('### Claiming Work\n');
    sections.push(`\`\`\`bash
REPO_NAME=$(basename "$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\\.git$||')")
gh issue edit <number> --add-label "${team}:wip"
echo '{"issue": <number>, "agent": "${fullName}", "started": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > ~/.nightshift/\${REPO_NAME}/${team}/locks/${fullName}.lock
\`\`\`\n`);
  }

  // --- Transitions ---
  sections.push('### Transitions\n');
  sections.push('| Action | Command |');
  sections.push('|--------|---------|');
  for (const [name, target] of Object.entries(agent.transitions)) {
    // Remove watched labels and wip mutex label, then add target label
    const removeLabels = agent.watches
      .filter(w => w !== 'unlabeled')
      .map(w => `--remove-label "${team}:${w}"`)
      .join(' ');
    sections.push(`| ${name} | \`gh issue edit $ISSUE ${removeLabels} --remove-label "${team}:wip" --add-label "${team}:${target}"\` |`);
  }
  sections.push('');

  // --- Locking ---
  if (hasWorktree) {
    sections.push('### Locking\n');
    sections.push(`\`\`\`bash
REPO_NAME=$(basename "$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\\.git$||')")

# Check lock
cat ~/.nightshift/\${REPO_NAME}/${team}/locks/${fullName}.lock 2>/dev/null
# If exists and started < 60 min ago → skip cycle
# If exists and started >= 60 min ago → stale, remove it
# If no file → proceed

# Create lock
echo '{"issue": <number>, "agent": "${fullName}", "started": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > ~/.nightshift/\${REPO_NAME}/${team}/locks/${fullName}.lock

# Remove lock
rm -f ~/.nightshift/\${REPO_NAME}/${team}/locks/${fullName}.lock
\`\`\`\n`);
  }

  // --- Branch Protocol ---
  if (hasWorktree) {
    sections.push('### Branch Protocol\n');
    sections.push(`Home branch: \`${homeBranch}\`\n`);
    sections.push(`\`\`\`bash
# Start of cycle: sync and checkout the feature branch
git fetch origin
git checkout issue-<number>-<slug>
git pull origin issue-<number>-<slug>

# End of cycle: return to home branch (MANDATORY)
git checkout ${homeBranch}
\`\`\`\n`);
    sections.push(`**Always return to \`${homeBranch}\` at the end of every cycle** — this frees the feature branch for other agents.\n`);
  }

  // --- Status Reporting ---
  sections.push('### Status Reporting\n');
  sections.push(`\`\`\`bash
REPO_NAME=$(basename "$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\\.git$||')")

# Set working status (start of cycle)
echo "working|$(date +%s)|" > ~/.nightshift/\${REPO_NAME}/${team}/status/${role}

# Set idle status (end of cycle)
echo "idle|$(date +%s)|" > ~/.nightshift/\${REPO_NAME}/${team}/status/${role}
\`\`\`\n`);

  return sections.join('\n');
}

/**
 * Build the standard set of template variables for an agent.
 */
export function buildTemplateVars(
  teamConfig: TeamConfig,
  agentName: string,
  repoName: string,
  mainBranch: string,
  instanceNumber?: number,
): Record<string, string> {
  const role = instanceNumber ? `${agentName}-${instanceNumber}` : agentName;
  const fullName = instanceNumber
    ? `ns-${teamConfig.name}-${agentName}-${instanceNumber}`
    : `ns-${teamConfig.name}-${agentName}`;

  return {
    agent_name: fullName,
    agent_role: role,
    agent_base_role: agentName,
    team_name: teamConfig.name,
    repo_name: repoName,
    main_branch: mainBranch,
    team_dir: `~/.nightshift/${repoName}/${teamConfig.name}`,
    home_branch: `_ns/${teamConfig.name}/${role}`,
    instance_number: instanceNumber ? String(instanceNumber) : '',
  };
}
