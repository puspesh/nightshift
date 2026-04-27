# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in nightshift, please report it responsibly.

**Preferred**: Use [GitHub Security Advisories](https://github.com/puspesh/nightshift/security/advisories/new) to report vulnerabilities privately.

**Fallback**: Email the maintainer directly. Do not open a public issue for security vulnerabilities.

## Scope

Security concerns for nightshift include:

- **Dependency vulnerabilities** -- outdated or compromised npm packages
- **Agent prompt-injection risks** -- malicious issue content that could manipulate agent behavior
- **Permission escalation** -- the `--dangerously-skip-permissions` flag bypasses Claude Code's permission system; misuse could allow unintended file or system access
- **GitHub token exposure** -- agent workflows use `gh` CLI authentication; leaking tokens could compromise repository access
- **Worktree isolation failures** -- agents should not be able to affect each other's working directories

## Response Timeline

- **Acknowledge**: within 72 hours of report
- **Initial assessment**: within 1 week
- **Fix for critical issues**: within 30 days
- **Fix for non-critical issues**: best effort, typically within 90 days

## Supported Versions

Only the latest minor release is actively supported with security fixes.

| Version | Supported |
|---------|-----------|
| 0.2.x   | Yes       |
| < 0.2   | No        |

## Disclosure Policy

We follow coordinated disclosure:

1. Reporter submits vulnerability privately
2. We acknowledge and begin investigation
3. We develop and test a fix
4. We publish the fix and a security advisory simultaneously
5. Reporter is credited (unless they prefer anonymity)

Please do not disclose vulnerabilities publicly until a fix has been published.

## Best Practices for Users

- Keep nightshift and its dependencies up to date
- Review agent-generated PRs before merging -- agents can make mistakes
- Use `gh auth login` with the minimum required scopes
- Be cautious with `--dangerously-skip-permissions` -- understand what it allows
- Run agents in repositories you trust -- agent behavior is influenced by repository content
