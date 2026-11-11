# Open-source orchestrators, standards and protocols for harness-agnostic, model-agnostic agent "factories" (as of 2026-11-11)

Method notes for the report writer:
- Star counts and repo status were read from the GitHub repo pages on 2026-11-11 unless stated otherwise. GitHub pages did not expose release dates or last-commit dates to the fetcher, so "active" is judged from README notices, issue/PR volume and dated news, not from commit timestamps.
- The research sandbox could not reach agentclientprotocol.com, agentskills.io, simonwillison.net, augmentcode.com or rufuspollock.com (network allowlist). Facts about those come from the corresponding GitHub repos or from search-result summaries, and are marked "(search summary)" where I did not read the page itself. Search summaries are weaker evidence than a page read.
- Many 2026 comparison articles are written by vendors of competing tools. They are flagged where used.

## 1. Which open-source multi-agent orchestrators exist and how are they architected?

### Takeaway
The field has split into four shapes: (a) local "parallel worktree" managers that wrap any CLI (Claude Squad, Paradev/Superset, Emdash, Conductor, Crystal, Sculptor, Vibe Kanban); (b) ticket-driven daemons that poll a tracker and run one agent per issue (OpenAI Symphony and its ports, Composio agent-orchestrator, Multica, Paperclip); (c) role-based "town/factory" systems with their own work ledger (Gas Town, Gas City, on Beads); and (d) vendor control planes (GitHub Agent HQ, Codex app, Claude Code agent teams, Devin). Almost all of them isolate with git worktrees, abstract harnesses with one adapter per CLI, and put the human at the PR/review step. Commercial fragility is high: Vibe Kanban's company shut down (April 2026), Crystal was deprecated (February 2026), coder/agentapi is archived, and Conductor was acquired by Meta (November 2026).

### Cited Findings

#### Comparison table (facts from repo pages unless a different source is given)

| System | Stars (2026-11-11) / licence | Unit of work | State store | Spawn + isolation | Harness abstraction | Human supervision | Status |
|---|---|---|---|---|---|---|---|
| Gas Town (`gastownhall/gastown`) | 18.8k / MIT | Bead (issue), grouped into convoys; molecules = workflow instances from TOML formulas | Beads ledger (Dolt is a required prerequisite) | tmux sessions per role; "hooks" are git worktrees; crew workspaces are separate clones | Built-in agent presets (Claude Code default, Codex, Copilot, Gemini, Cursor, Kiro, Auggie, Amp, OpenCode, Pi, OMP); per-rig `settings/config.json`; `--agent` override | Mayor chat, `gt feed` TUI, `gt dashboard` web UI, escalation beads, Refinery merge queue | Active repo, but author steers new work to Gas City |
| Gas City (`gastownhall/gascity`) | 1.5k / MIT | Bead; formulas run as graphs; "orders" = scheduled/event formulas | Beads via `bd` (Dolt) or file store (`GC_BEADS=file`) | Pluggable session backends: tmux (default), subprocess, ACP, Kubernetes, herdr | Pluggable providers for agent CLIs; "packs" bundle agents + formulas + orders | Dashboard, review gates | Active; 1.0 shipped 2026 |
| Beads (`gastownhall/beads`) | 28.7k / MIT | Issue with dependency graph | Dolt (embedded single-writer, or `dolt sql-server`); synced to `refs/dolt/data` on a git remote | n/a (tracker, not runner) | `bd setup` installs hooks/guidance for Claude Code, Codex, Cursor, Factory, others | JSONL export, GitHub Issues sync | Active (1.1k open issues, 687 open PRs) |
| OpenAI Symphony (`openai/symphony`) | 28.0k / Apache-2.0 | Tracker issue; each execution is a "run attempt" | In memory only; recovery from tracker + preserved workspaces | One directory per issue under a workspace root; shell hooks; `codex app-server` child over stdio | None in spec: written around Codex app-server JSON-RPC | Tracker states (e.g. `Human Review`); edit `WORKFLOW.md` live; optional HTTP status API | "Low-key engineering preview"; 47 commits; OpenAI says it will not maintain it as a product |
| Vibe Kanban (`BloopAI/vibe-kanban`) | 28.6k / Apache-2.0 | Kanban task / workspace | Local DB (sqlx; engine not named on page) | Workspace = branch + terminal + dev server (worktrees) | 10+ executors: Claude Code, Codex, Gemini CLI, Copilot, Amp, Cursor, OpenCode, Droid, CCR, Qwen Code | Diff review with inline comments, built-in browser, PR creation | Sunsetting; community-maintained since April 2026 |
| Claude Squad (`smtg-ai/claude-squad`) | 8.8k / AGPL-3.0 | Session | Local config (`~/.claude-squad/config.json`) | tmux session + git worktree per instance | `-p "<command>"` runs any terminal agent; named profiles | TUI; experimental `--autoyes` | Active repo |
| Crystal (`stravu/crystal`) | 3.1k / MIT | Session | not stated | Git worktrees | Claude Code, Codex | Desktop app | Deprecated February 2026, replaced by Nimbalyst |
| Sculptor (`imbue-ai/sculptor`) | 246 / MIT | Workspace | not stated | "Isolated worktrees of your repo"; container backend (Docker or remote) is experimental | Integrated Pi and Claude Code; can manage any terminal agent | Desktop UI | "Experimental research preview" |
| Paradev, formerly Superset (`superset-sh/superset`) | 16.2k / MIT | Task | not stated | Worktree + branch + terminals per task | 21 "fully supported" CLIs; any other CLI works unconfigured | Diff review, in-app browser, status tracking, iOS app (paid) | "Ships daily" |
| Emdash (`generalaction/emdash`) | 6.2k / Apache-2.0 | Task (can come from a ticket) | Local SQLite | Worktree + branch per task; remote over SSH/SFTP | Auto-detects installed CLIs | Diff review, PR, CI checks, merge | Active; YC W26 |
| Composio agent-orchestrator (`ComposioHQ/agent-orchestrator`) | 14.4k / Apache-2.0 | Task/session tied to a PR | see `docs/architecture.md` (not read) | Agent + branch + worktree per task; hosted "Cloud Agents" option | "35+ coding agents", support varies | Kanban lanes: Working / Needs you / In review / Ready to merge | Active (3,989 commits) |
| Multica (`multica-ai/multica`) | 55.6k / "Multica License" (Apache-2.0 + conditions; source-available) | Issue assigned to an agent "teammate" | PostgreSQL 17 | Local daemon spawns agent CLIs, linked to Go server by WebSocket | 29 agent CLIs | Board, comments, blockers, review hand-back | Active |
| Paperclip (`paperclipai/paperclip`) | 113k / MIT | Issue linked to company, project, goal, parent | PostgreSQL (embedded locally) | Heartbeat wakeups from a DB-backed queue; optional worktrees; sandbox providers | Named adapters + custom process + HTTP/webhook + adapter plugins | Board approvals, budgets with hard stops, pause/terminate | Active |
| OpenHands (`OpenHands/OpenHands`) | 93.2k / MIT | Conversation; automations | Agent Server (REST) | Host, or Docker (one container per conversation) | Own agent plus any ACP agent | Web UI ("Agent Canvas"), Slack/GitHub/Linear integrations | Active (v1.38.0 referenced) |
| Claude Code agent teams | closed source | Task in shared task list | JSON files under `~/.claude/teams/` and `~/.claude/tasks/` | In-process or tmux/iTerm2 panes; no automatic worktree per teammate | Claude Code only | Lead session; hooks; direct messaging | Experimental, off by default |

#### Gas Town, Gas City, Beads
- Gas Town's canonical repo is now `gastownhall/gastown` (18.8k stars, 1.7k forks, MIT, 394 open issues, 129 open PRs). — [GitHub](https://github.com/steveyegge/gastown)
- Roles: Mayor (coordinator), Polecats (workers with persistent identity, ephemeral sessions), Witness (per-rig lifecycle monitor), Deacon (cross-rig supervisor), Dogs (maintenance workers), Refinery (per-rig merge queue that batches, runs gates, bisects failures), Crew (human workspaces). — [GitHub](https://github.com/steveyegge/gastown)
- Polecats never push to main; the Refinery gates all merges. Runtimes with lifecycle hooks (Claude, Copilot) are wired through hook files; runtimes without hooks, such as Codex, get a "startup fallback sequence". OpenTelemetry export is built in. — [GitHub](https://github.com/steveyegge/gastown)
- Yegge open-sourced Gas Town on 1 January 2026 and Beads in October 2025 (search summary). — [Software Engineering Daily, 2026-02-12](https://softwareengineeringdaily.com/2026/02/12/gas-town-beads-and-the-rise-of-agentic-development-with-steve-yegge/)
- Yegge warns Gas Town is expensive to run; agent-count claims in secondary coverage conflict (20–30 vs 50+) and were not verified (search summary). — [ascii.co.uk](https://ascii.co.uk/news/article/news-20260102-190a5f9f/steve-yegge-releases-gas-town-multi-agent-orchestrator-for-c)
- Gas City was announced 24 April 2026 as an MIT orchestration-builder SDK that extracts Gas Town's infrastructure into composable "packs"; Yegge's post says the team is directing creative effort to Gas City (search summary). — [Yegge on Medium](https://steve-yegge.medium.com/gas-town-from-clown-show-to-v1-0-c239d9a407ec); [The New Stack](https://thenewstack.io/steve-yegges-ai-agent-orchestration-project-gas-town-comes-to-the-cloud-and-brings-the-wasteland-with-it/)
- Gas City repo: 1.5k stars, MIT, "stewarded by Gas City, Inc."; session backends tmux, subprocess, ACP, Kubernetes, herdr; beads via Dolt or a file store. — [GitHub](https://github.com/gastownhall/gascity)
- "Gas Town by Kilo" exists as a hosted variant (search result title only; not read). — [SD Times](https://sdtimes.com/softwaredev/gas-town-by-kilo-multi-agent-orchestrator-now-available/)
- Beads now stores data in Dolt, not SQLite+JSONL. `.beads/issues.jsonl` is an export, not the source of truth. Embedded mode is single-writer; multi-writer needs `bd init --server` against `dolt sql-server`. — [GitHub](https://github.com/steveyegge/beads)
- Beads features: `bd ready` (unblocked work), `bd update --claim` (atomic claim), hash IDs to avoid merge collisions, compaction of old closed tasks, a message issue type, `bd github sync`. — [GitHub](https://github.com/steveyegge/beads)

#### OpenAI Symphony and ticket-driven ports
- Symphony exists. OpenAI published it as an Apache-2.0 spec plus an Elixir reference implementation; the announcement coverage is dated 28 April 2026. — [Help Net Security](https://www.helpnetsecurity.com/2026/04/28/openai-symphony-codex-orchestration-linear/); [OpenAI](https://openai.com/index/open-source-codex-orchestration-symphony)
- An earlier third-party article about Symphony is dated 5 March 2026, so the repo predates the April blog post (date from URL only; not read). — [heyuan110.com](https://www.heyuan110.com/posts/ai/2026-03-05-openai-symphony-autonomous-coding/)
- README: "Symphony is a low-key engineering preview for testing in trusted environments." 28.0k stars, 2.9k forks, 47 commits. — [GitHub](https://github.com/openai/symphony)
- Spec components: Workflow Loader, Config Layer, Issue Tracker Adapter, Orchestrator (single owner of scheduling state), Workspace Manager, Agent Runner, status surface. — [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md)
- `WORKFLOW.md` lives in the repo: YAML front matter (`tracker`, `polling` default 30s, `workspace`, `hooks`, `agent` with max 10 concurrent agents and 20 turns by default, `codex`) plus a strict prompt template. Hot reload is required. — [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md)
- No database: scheduler state is in memory; restart recovery relies on the tracker and preserved workspaces. Failure backoff is 10s × 2^(attempt−1), capped (default 5 min); stall timeout default 5 min. — [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md)
- Tracker writes are done by the agent through host-side tools (e.g. `linear_graphql`) so the agent process does not hold tracker secrets. — [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md); [Help Net Security](https://www.helpnetsecurity.com/2026/04/28/openai-symphony-codex-orchestration-linear/)
- OpenAI reported a 500% increase in landed PRs for some internal teams in the first three weeks (company-reported; search summary). — [OpenAI](https://openai.com/index/open-source-codex-orchestration-symphony)
- Community ports add other harnesses and trackers: `qsliu2017/symphony-action` (GitHub Actions + Claude Code + GitHub Issues), `broomva/symphony` (Rust; Linear and GitHub), `cskwork/oh-my-symphony` (Codex, Claude Code, Gemini, Pi), `penso/polyphony` (GitHub Issues tracker, ACP agent backends). All are small repos whose maintenance was not checked (search summary). — [symphony-action](https://awesome.ecosyste.ms/projects/github.com%2Fqsliu2017%2Fsymphony-action); [oh-my-symphony](https://awesome.ecosyste.ms/projects/github.com%2Fcskwork%2Foh-my-symphony); [polyphony](https://awesome.ecosyste.ms/projects/github.com%2Fpenso%2Fpolyphony)

#### Worktree managers
- Vibe Kanban: README says "Vibe Kanban is sunsetting." Bloop's "Goodbye bloop" post is dated 10 April 2026; the project continues as community-maintained open source; cloud features were removed 30 days later, local workspaces keep working (search summary). — [GitHub](https://github.com/BloopAI/vibe-kanban); [vibekanban.com](https://vibekanban.com/blog/shutdown)
- Crystal: "has been deprecated and replaced by Nimbalyst" (February 2026). — [GitHub](https://github.com/stravu/crystal)
- Conductor (closed source, macOS): runs Claude Code, Codex, Cursor and OpenCode in worktrees; launched Conductor Cloud in July 2026; raised a $22M Series A (sources disagree on March vs May 2026) (search summary). — [RuntimeWire](https://runtimewire.com/article/conductor-launches-multiplayer-cloud-workspaces-coding-agents); [SiliconANGLE](https://siliconangle.com/2026/11/04/meta-acquires-ai-coding-startup-conductor-whose-app-runs-several-coding-agents-at-once/)
- Meta acquired Conductor (reports 4–5 November 2026); team joins Meta Superintelligence Labs; Conductor Cloud is shutting down this month and the desktop app gets updates only until early 2027 (search summary; shutdown-vs-read-only detail conflicts between reports). — [Axios](https://axios.com/2026/11/04/meta-acquires-ai-coding-startup-conductor); [InfoWorld](https://www.infoworld.com/article/4245065/meta-acquires-conductor-as-ai-coding-shifts-toward-multi-agent-development.html)
- Paradev README: worktrees "separate working files but do not sandbox processes or prevent merge conflicts". — [GitHub](https://github.com/superset-sh/superset)
- Emdash ticket integrations: Linear, GitHub, Jira, GitLab, Asana, Featurebase, Monday.com, Forgejo, Plain, YouTrack. — [GitHub](https://github.com/generalaction/emdash)
- Composio agent-orchestrator routes failed checks, review comments and merge conflicts back to the worker that owns the branch until the PR is approved. — [GitHub](https://github.com/ComposioHQ/agent-orchestrator)

#### Company-style and platform orchestrators
- Paperclip: Node.js server + React UI; issues with atomic checkout and execution locks; heartbeats via a DB-backed wakeup queue that checks budgets before invoking an adapter; plugins run as out-of-process workers. Roadmap lists "bring-your-own ticket system (Asana/Linear/Jira)" as not started. — [GitHub](https://github.com/paperclipai/paperclip)
- Paperclip was released 4 March 2026 (search summary). Its "zero-human company" tagline is called aspirational by one critic because the demo still needs people to define tasks and approve plans (search summary). — [ZenML LLMOps database](https://www.zenml.io/llmops-database/open-source-agent-orchestration-platform-for-multi-agent-business-automation); [mejba.me](https://www.mejba.me/blog/paperclip-orchestrating-zero-human-ai-companies)
- OpenHands: Agent Server (REST, in the separate software-agent-sdk repo) plus an Automation Server for schedules and webhooks; README warns host execution gives the agent full filesystem access. — [GitHub](https://github.com/OpenHands/OpenHands)
- Multica: Go server, local daemon, Postgres 17; skills are shared playbooks; "autopilots" are scheduled tasks. — [GitHub](https://github.com/multica-ai/multica)

#### Vendor control planes
- Claude Code agent teams: "experimental and disabled by default" (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Team lead + teammates + shared task list + mailbox. Each mailbox is a JSON file at `~/.claude/teams/{team-name}/inboxes/{agent-name}.json`; task claiming uses file locking. — [Claude Code docs](https://code.claude.com/docs/en/agent-teams)
- Agent teams limits: one team per session, no nested teams, no resumption of in-process teammates, lead is fixed, teammates are not spawned in non-interactive (`-p`) or Agent SDK sessions. Docs advise "Two teammates editing the same file leads to overwrites" and recommend 3–5 teammates. — [Claude Code docs](https://code.claude.com/docs/en/agent-teams)
- Agent teams hooks: `TeammateIdle`, `TaskCreated`, `TaskCompleted` (exit code 2 blocks and sends feedback). — [Claude Code docs](https://code.claude.com/docs/en/agent-teams)
- GitHub Agent HQ: announced at Universe 2025; public preview on 4 February 2026 added Claude and Codex next to Copilot, managed from "Mission Control" across GitHub.com, VS Code, CLI and mobile. Reported as limited to Copilot Pro+ and Enterprise, one premium request per session; another outlet says all paid plans (conflict; search summary). — [GitHub blog](https://github.blog/news-insights/company-news/welcome-home-agents/); [ChannelLife](https://channellife.com.au/story/github-adds-claude-codex-agents-to-unified-ai-hub); contradicted on plan scope by [Implicator](https://www.implicator.ai/github-wont-compete-on-agent-quality-its-building-the-layer-beneath-all-of-them/)
- Codex app: macOS app released 2 February 2026; a thread per agent, grouped by project; git worktrees for parallel agents; scheduled "automations" run in background worktrees and land in a review queue (search summary of secondary sources, which disagree on whether cloud execution is the default). — [Daniel Vaughan's Codex notes](https://codex.danielvaughan.com/2026/04/11/codex-app-worktree-lifecycle-local-environments/); [The Neuron](https://theneuron.ai/explainer-articles/openai-codex-app-deep-dive-how-it-works)
- Devin: "managed Devins" (March 2026) let a parent session fan work out to children, "each running in its own isolated VM"; Cognition snapshots and restores full machine state at the hypervisor level and keeps warm VM pools; Devin Outposts (alpha on Modal, July 2026) moves execution onto customer-controlled machines while reasoning stays hosted (search summary). — [Cognition](https://cognition.ai/blog/devin-can-now-manage-devins); [Cognition, 2026-04-20](https://cognition.ai/blog/the-cost-of-building-cloud-agents); [RuntimeWire](https://runtimewire.com/article/devin-multi-vm-cloud-agents-modal-outposts)

### Inferences
- The open-source systems converge on the same five parts: a work ledger, a dispatcher, a per-task workspace, a harness adapter, and a merge/review gate. They differ mostly in where the ledger lives (tracker, Postgres, Dolt, files).
- Symphony is the cleanest small reference for the dispatcher (poll, claim, reconcile, retry, stall detection), but it is Codex-specific and stateless by design. The ports show the spec is easy to re-implement around other harnesses.
- Gas City's session-provider list (tmux, subprocess, ACP, Kubernetes) is the most explicit open-source statement of "the harness and the runtime are both pluggable".
- Star counts reflect attention, not production use. Paperclip (113k) and Multica (55.6k) out-star Gas Town (18.8k) and OpenHands' older lead, yet none of these pages give deployment numbers.
- Vendor-backed GUI managers are a risky dependency: three of the ones named in the brief changed status within 2026.

### Gaps
- No last-commit dates were obtained for any repo; "active" is inferred.
- Paperclip's adapter identifiers and Composio's plugin-slot architecture were not read from their architecture docs.
- Sculptor's "Pairing Mode" and Vibe Kanban's executor trait were not confirmed from primary sources.
- Cursor background/cloud agents, Factory Droid "missions", Warp, Amp and Kilo orchestration features were not researched.
- Claude Code features beyond agent teams (cross-session messaging, cloud sessions, scheduled tasks) are referenced in the docs page but were not researched in depth.
- Whether GitHub Agent HQ has left preview, and which third-party agents beyond Claude and Codex are live, was not verified against GitHub docs.

## 2. Which protocols and standards matter, and what is their adoption?

### Takeaway
Four standards carry real weight: MCP (tools), AGENTS.md (repo instructions), Agent Skills / SKILL.md (packaged procedures) and ACP (driving a coding agent from a client). The ACP registry now lists 46 agents, including adapters for Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Goose, Amp, Pi and Devin, which makes it the nearest thing to a common harness interface. A2A is governed and popular on GitHub but shows little use between coding harnesses. Vendor-specific surfaces (Codex app-server, Claude `stream-json`/Agent SDK, Gemini headless JSONL) remain the richest per-harness interfaces.

### Cited Findings

#### ACP (Agent Client Protocol)
- Repo `agentclientprotocol/agent-client-protocol`: 4.6k stars, 476 forks, Apache-2.0, has a GOVERNANCE.md. Stable protocol version is `1`, negotiated in `initialize`; schemas for `v1` and `v2` are published. SDKs: Rust, TypeScript, Python, Kotlin, Java. — [GitHub](https://github.com/agentclientprotocol/agent-client-protocol)
- Registry repo lists 46 agent directories, including `claude-acp`, `codex-acp`, `gemini`, `cursor`, `github-copilot-cli`, `opencode`, `goose`, `amp-acp`, `pi-acp`, `devin`, `cline`, `kiro`, `junie`, `factory-droid`, `qwen-code`, `mistral-vibe`, `kimi`, `grok-build`, `auggie`, `kilo`, `poolside`. 454 stars. Distribution types checked: npm, PyPI, GitHub releases. — [GitHub](https://github.com/agentclientprotocol/registry)
- JetBrains and Zed launched the registry in beta on 28 January 2026; the project's updates page lists it as released on 9 March 2026; ACP v2 docs are in draft (search summary). — [Zed blog](https://zed.dev/blog/acp-registry); [ACP updates](https://agentclientprotocol.com/updates)
- The registry is curated and only lists agents that support authentication (search summary). — [ACP registry](https://agentclientprotocol.com/registry/index)
- ACP used outside editors: OpenHands works with "any agent supporting the Agent-Client Protocol"; Gas City has an ACP session backend. — [OpenHands](https://github.com/OpenHands/OpenHands); [Gas City](https://github.com/gastownhall/gascity)
- ACP reportedly arrived in Microsoft's terminal in mid-2026 (article title only; not read). — [Daniel Vaughan's Codex notes, 2026-06-10](https://codex.danielvaughan.com/2026/06/10/agent-client-protocol-microsoft-intelligent-terminal-codex-cli-multi-agent-ide-ecosystem/)
- Naming hazard: `penso/polyphony` describes its backends as "ACP / ACPX — Agent Communication Protocol", a different expansion of the acronym (search summary). — [polyphony](https://awesome.ecosyste.ms/projects/github.com%2Fpenso%2Fpolyphony)

#### MCP
- The Linux Foundation announced the Agentic AI Foundation (AAIF) on 9 December 2025 with three founding projects: Anthropic's MCP, OpenAI's AGENTS.md and Block's goose (search summary; one source gives a conflicting May 2026 donation date). — [WorkOS](https://workos.com/blog/the-linux-foundation-launches-the-aaif); [IT Brief](https://itbrief.co.uk/story/linux-foundation-launches-agentic-ai-open-standards-hub)
- MCP spec 2026-07-28 made the protocol stateless: it removes the initialization handshake and protocol-level sessions, moves Tasks into an extension, and adds a versioned extensions framework (search summary). — [MCP blog](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/); [AAIF](https://aaif.io/blog/mcp-2026-07-28-whats-changing-and-how-to-migrate); [Claude blog](https://claude.com/blog/bringing-mcp-2026-07-28-to-claude)
- Adoption numbers vary by method: about 9,652 server records in the official registry on 24 May 2026; "10,000+ active public MCP servers" from Anthropic in December 2025; 950+ servers in Claude's connectors directory; SDK download claims range from 97M to 110M+ per month, with one unverified 400M claim (search summaries; not comparable with each other). — [The New Stack](https://thenewstack.io/mcp-release-candidate-rewrite/); [Claude blog](https://claude.com/blog/bringing-mcp-2026-07-28-to-claude)
- Orchestrators use MCP as an internal control surface too: Vibe Kanban exposes an MCP server (`MCP_HOST`/`MCP_PORT`); Paperclip lists an "MCP tool gateway" as done; Beads ships a `beads-mcp` package. — [Vibe Kanban](https://github.com/BloopAI/vibe-kanban); [Paperclip](https://github.com/paperclipai/paperclip); [Beads](https://github.com/steveyegge/beads)
- Codex deprecated its `codex mcp-server` subcommand in v0.149.1 in favour of the app-server (search summary). — [Daniel Vaughan's Codex notes, 2026-08-25](https://codex.danielvaughan.com/2026/08/25/codex-mcp-server-deprecated-app-server-migration-claude-code-plugin-v0149/)

#### AGENTS.md
- Repo `agentsmd/agents.md`: 25.4k stars, MIT, includes a `Technical_Charter.pdf`. — [GitHub](https://github.com/agentsmd/agents.md)
- Reported as adopted by 60,000+ open-source projects and stewarded by AAIF; a v1.1 proposal was open as of June 2026 (search summary). — [Daniel Vaughan's Codex notes, 2026-06-05](https://codex.danielvaughan.com/2026/06/05/agentic-ai-foundation-agents-md-mcp-linux-foundation-codex-cli-developers/)
- Orchestrators consume it: Paperclip lists "AGENTS.md configs" as done; Beads' `bd setup` installs agent guidance per harness. — [Paperclip](https://github.com/paperclipai/paperclip); [Beads](https://github.com/steveyegge/beads)

#### Agent Skills (SKILL.md)
- Repo `agentskills/agentskills`: 27.2k stars, 2.0k forks; code Apache-2.0, docs CC-BY-4.0; "originally developed by Anthropic" and released as an open standard. A skill is a folder with a required `SKILL.md` (minimum metadata `name`, `description`) and optional `scripts/`, `references/`, `assets/`. — [GitHub](https://github.com/agentskills/agentskills)
- Progressive disclosure in three stages: load name + description at startup, load full `SKILL.md` on match, load referenced files or run bundled code on demand. — [GitHub](https://github.com/agentskills/agentskills)
- Orchestrators layer on it: Multica shares skills across agents; Paperclip lists "skills tooling" as done; Codex app automations combine schedules with skills (last item is a search summary). — [Multica](https://github.com/multica-ai/multica); [Paperclip](https://github.com/paperclipai/paperclip)

#### A2A
- Repo `a2aproject/A2A`: 26.5k stars, Apache-2.0, "an open source project under the Linux Foundation, contributed by Google". JSON-RPC 2.0 over HTTP(S), Agent Cards for discovery, sync, SSE streaming and async push. SDKs: Python, Go, JS/TS, Java, .NET, Rust. — [GitHub](https://github.com/a2aproject/A2A)
- Secondary sources cite 150+ supporting organisations but disagree on the current version (0.3 vs 1.0) (search summary; unverified). — [IntuitionLabs](https://intuitionlabs.ai/articles/agentic-ai-foundation-open-standards)
- None of the orchestrator READMEs read for section 1 name A2A as an integration; the archived coder/agentapi listed A2A only as a roadmap consideration. — [coder/agentapi](https://github.com/coder/agentapi)

#### Vendor SDKs and headless modes
- Codex app-server is "both the JSON-RPC protocol between the client and the server and a long-lived process that hosts the Codex core threads"; runs over stdio (`codex app-server`) or WebSocket (`--listen ws://…`); omits the `"jsonrpc":"2.0"` header; ships schema generation for TypeScript and JSON Schema (search summary). — [OpenAI developers](https://developers.openai.com/codex/app-server); [OpenAI](https://openai.com/index/unlocking-the-codex-harness)
- OpenAI tried and rejected MCP as the client protocol before designing the app-server (search summary). — [InfoQ](https://www.infoq.com/news/2026/02/opanai-codex-app-server)
- `codex exec --json` streams JSONL events (e.g. `thread.started`) and resumes with `codex exec resume` (search summary). — [Daniel Vaughan's Codex notes](https://codex.danielvaughan.com/2026/04/18/codex-cli-headless-batch-mode-automation/)
- Claude Code headless is print mode (`-p`) with `--output-format json|stream-json` and `--permission-mode`; Anthropic frames it as the Agent SDK via the CLI (search summary). — [flaviocopes.com](https://flaviocopes.com/ai-glossary/headless-mode/)
- Gemini CLI enters headless mode with `-p` or a non-TTY and can emit JSONL events ending in a result object with statistics (search summary). — [Gemini CLI docs](https://geminicli.com/docs/cli/headless/)
- Claude Code subagent definitions (frontmatter `tools`, `model`, `effort`, `mcpServers`, `skills`) double as teammate roles; installed "mods" can hook `agent.spawn`. — [Claude Code docs](https://code.claude.com/docs/en/agent-teams)

### Inferences
- Layering that emerges: AGENTS.md and SKILL.md are the portable "what to do" files; MCP is the portable tool plane; ACP is the portable "drive a session" plane; A2A targets cross-organisation agent services and is peripheral to coding factories today.
- ACP's stable v1 with a v2 draft, and MCP's July 2026 stateless rewrite, mean both are still moving. An orchestrator should pin protocol versions.
- Each harness's native surface exposes more than ACP does (Codex threads/turns and approval policy, Claude hooks and permission modes), so ACP gives breadth and native adapters give depth.

### Gaps
- ACP's client list, transport details (stdio vs remote/HTTP) and governance body could not be read: agentclientprotocol.com was unreachable.
- The Agent Skills client showcase (agentskills.io/clients) was unreachable; no adopter count was obtained.
- Google ADK, OpenAI Agents SDK and the Claude Agent SDK were not researched from primary docs; no adoption numbers were found.
- Plugin formats (Claude Code plugins/marketplaces, Codex plugins, Gemini extensions) were not researched.
- A2A's current version and member count are unverified.

## 3. What are the common ways to abstract over harnesses, and what are the tradeoffs?

### Takeaway
Five patterns are in use: (1) run any CLI in a tmux/PTY pane and treat it as opaque; (2) an adapter per CLI over its headless JSONL mode; (3) the harness's native RPC server or SDK; (4) ACP as a common session protocol; (5) one harness with models swapped behind a gateway. Patterns 1 and 2 dominate open-source orchestrators; 4 is growing; 5 gives model-agnosticism without harness-agnosticism.

### Cited Findings
- Pattern 1, opaque terminal: Claude Squad launches whatever command is passed with `-p` inside tmux + a worktree. Paradev says any CLI agent "works without configuration". Sculptor "can run and manage any terminal-based agent". — [Claude Squad](https://github.com/smtg-ai/claude-squad); [Paradev](https://github.com/superset-sh/superset); [Sculptor](https://github.com/imbue-ai/sculptor)
- Pattern 1 failure mode: coder/agentapi turned API calls into keystrokes through an in-memory terminal emulator and parsed the TUI with heuristics; its README warns that TUI changes leak interface elements into messages. The project is now "deprecated and no longer maintained" and archived. — [GitHub](https://github.com/coder/agentapi)
- Pattern 1 with presets: Gas Town keeps per-agent presets (command, args, prompt mode) and compensates for missing lifecycle hooks with a "startup fallback sequence" for runtimes such as Codex. — [GitHub](https://github.com/steveyegge/gastown)
- Pattern 2, adapter per CLI: Claude, Codex and Gemini all emit JSONL in headless mode but with different event schemas, different approval/sandbox flags (`--permission-mode`; `--sandbox`/`--ask-for-approval`; `--yolo`/`--approval-mode`) and different resume mechanics (search summary of third-party guides). — [developersdigest.tech](https://www.developersdigest.tech/blog/headless-ai-coding-agents-ci-comparison-2026); [Gemini CLI docs](https://geminicli.com/docs/cli/headless/)
- Pattern 2 at scale: Vibe Kanban (10+ executors), Paperclip (named adapters plus process and HTTP adapters and adapter plugins), Multica (29 CLIs), Composio ("35+", "support varies by agent"). — [Vibe Kanban](https://github.com/BloopAI/vibe-kanban); [Paperclip](https://github.com/paperclipai/paperclip); [Multica](https://github.com/multica-ai/multica); [Composio](https://github.com/ComposioHQ/agent-orchestrator)
- Pattern 3, native RPC: Symphony's spec is written around the Codex app-server (initialize, create/resume thread, turns, approval and sandbox policy) and "does not describe support for other agent harnesses". — [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md)
- Pattern 3 limit on the Claude side: agent teams do not spawn teammates in `-p` mode or Agent SDK sessions. — [Claude Code docs](https://code.claude.com/docs/en/agent-teams)
- Pattern 4, ACP: 46 registry agents; OpenHands and Gas City accept ACP agents; a third-party `acp-adapter` wraps Codex, Claude Code and Pi behind one ACP surface, with the README noting that the runtime shape is shared while config fields stay backend-specific (last item is a search summary). — [ACP registry](https://github.com/agentclientprotocol/registry); [OpenHands](https://github.com/OpenHands/OpenHands); [acp-adapter](https://awesome.ecosyste.ms/projects/github.com%2Fbeyond5959%2Facp-adapter)
- Pattern 4 via universal HTTP: Rivet's Sandbox Agent lets you "run coding agents in sandboxes and control them over HTTP" (1.6k stars, Apache-2.0; repo topics mention Daytona, E2B, opencode, pi). — [GitHub](https://github.com/rivet-dev/sandbox-agent)
- Pattern 5, gateway: Claude Code talks to a gateway through `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`; the gateway must serve the Anthropic Messages API. OpenRouter can be targeted directly without a local proxy. Gateways that rewrite requests can strip Claude Code's beta headers and cause "Extra inputs are not permitted" errors (search summary; mostly vendor blogs). — [Claude Code docs](https://docs.claude.com/en/docs/claude-code/llm-gateway); [morphllm.com](https://www.morphllm.com/claude-code-litellm)
- Pattern 5 supply-chain note: one source flags a LiteLLM malware advisory for versions 1.82.7 and 1.82.8 (search summary; not verified against the advisory). — [morphllm.com](https://www.morphllm.com/claude-code-litellm)
- Model-agnostic harnesses as an alternative to gateways: OpenHands advertises "Use with any LLM" via LLM profiles; Vibe Kanban lists "CCR" (Claude Code Router) as an executor. — [OpenHands](https://github.com/OpenHands/OpenHands); [Vibe Kanban](https://github.com/BloopAI/vibe-kanban)

### Inferences
Tradeoff summary (my synthesis from the findings above):

| Pattern | Gains | Costs |
|---|---|---|
| Opaque tmux/PTY | Works with every CLI on day one; humans can attach; survives harness updates | No structured events, cost or completion signal; needs hooks or screen heuristics; agentapi's archival shows the parsing variant ages badly |
| Adapter per headless CLI | Structured events, exit codes, resumable sessions, uses the user's subscription login | N parsers to maintain; flags and schemas drift per release; "support varies" |
| Native RPC/SDK | Full fidelity (threads, approvals, sandbox policy, token totals) | Locks the orchestrator core to one vendor unless wrapped |
| ACP | One client for 46 agents; version-negotiated; maintained by the agent vendors or adapter authors | Designed for editor–agent sessions; adapters lag native features; v2 in draft |
| Single harness + gateway | One code path; cheap model swaps; central cost tracking | Not harness-agnostic; non-native models lose harness-specific features; extra infrastructure and a security surface |

- A practical design is a narrow internal interface (start, send, stream events, interrupt, resume, report usage) with ACP as the default implementation and native adapters for the two or three harnesses that matter most. Gas City and OpenHands already ship this mix.
- Subscription billing pushes orchestrators towards driving the vendor CLI on the user's machine (Multica: "drives the CLIs you already have installed and authenticated"; Conductor: users "pay … through their own subscriptions and keys") instead of calling model APIs directly.

### Gaps
- No primary source was found that measures quality loss when a harness runs a non-native model through a gateway.
- claude-code-router was not researched directly.
- Aider's and Goose's headless interfaces were not researched; Goose appears in the ACP registry, Aider does not.
- Terms-of-service limits on driving subscription CLIs from orchestrators were not researched.

## 4. What durable-execution layers and sandbox providers sit under agent pipelines?

### Takeaway
Most open-source orchestrators use no durable-execution engine: they rely on a database or tracker as the source of truth plus an idempotent reconcile loop. Temporal, Restate, Inngest and DBOS are discussed for agent loops mainly in vendor and blog comparisons. For isolation, worktrees are the local default and are explicitly not a sandbox; containers and microVMs (Docker, E2B, Daytona, Modal, Sprites, Vercel, Cloudflare) are the hosted layer, and Devin-class systems use full VMs with snapshots.

### Cited Findings
- Symphony keeps scheduler state in memory and recovers by re-polling the tracker and reusing workspaces; retry timers and live sessions are not restored. — [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md)
- Paperclip uses a DB-backed wakeup queue that coalesces requests and checks budgets before each run; budget stops depend on recorded spend, so reporting delays can postpone a stop. — [GitHub](https://github.com/paperclipai/paperclip)
- Gas City's orchestrator "finishes runs outside your session", retries failures and runs formulas as graphs, with state in beads. — [GitHub](https://github.com/gastownhall/gascity)
- GitHub Actions as the runner: `qsliu2017/symphony-action` implements the Symphony loop as an Actions workflow with Claude Code (search summary). — [symphony-action](https://awesome.ecosyste.ms/projects/github.com%2Fqsliu2017%2Fsymphony-action)
- Cron-style triggers are a common feature: OpenHands Automation Server (schedules and webhooks), Paperclip routines, Multica autopilots, Gas City orders, Codex app automations. — [OpenHands](https://github.com/OpenHands/OpenHands); [Paperclip](https://github.com/paperclipai/paperclip); [Multica](https://github.com/multica-ai/multica); [Gas City](https://github.com/gastownhall/gascity)
- Durable-engine positioning from 2026 comparisons: Temporal for long workflows that must survive worker failure across services and days; Restate for a smaller operational footprint; Inngest event-driven, where many-step agent loops can burn execution quotas; DBOS as a library that checkpoints into existing Postgres (search summary; vendor and blog sources). — [HackerNoon](https://hackernoon.com/durable-execution-for-ai-agents-langgraph-dbos-inngest-and-temporal-compared); [ZenML](https://www.zenml.io/blog/inngest-alternatives)
- One blog estimates a run with 30 model calls and 20 tool calls bills about 51 units on each hosted engine and recommends DBOS as the default on Postgres (single author; search summary). — [beri.net](https://www.beri.net/article/temporal-vs-inngest-vs-restate-vs-dbos-durable-execution-agent-cost)
- One secondary blog says OpenAI Codex uses Temporal for coding-agent requests (single secondary source; unverified). — [youngju.dev](https://www.youngju.dev/blog/culture/2026-05-14-durable-execution-engines-2026-temporal-restate-inngest-trigger-dev-dbos-deep-dive-2026.en)
- Rivet runs agents such as Pi as durable actors: "A durable process per agent, with memory that survives restarts." — [GitHub](https://github.com/rivet-dev/sandbox-agent)
- Worktree limits: worktrees "do not sandbox processes or prevent merge conflicts". — [Paradev](https://github.com/superset-sh/superset)
- Container options in open-source tools: OpenHands can run one Docker container per conversation; Sculptor's container backend is experimental; Gas City has a Kubernetes session backend; Paperclip lists "cloud/sandbox agents" as done. — [OpenHands](https://github.com/OpenHands/OpenHands); [Sculptor](https://github.com/imbue-ai/sculptor); [Gas City](https://github.com/gastownhall/gascity); [Paperclip](https://github.com/paperclipai/paperclip)
- Sandbox isolation classes per one 15-provider comparison: hardware VMs with their own kernel (E2B, Vercel, Sprites, Blaxel and others), gVisor (Modal, Beam), hardened containers (Daytona by default); another source describes Daytona as VM-snapshot based (conflict; search summary). — [Upstash](https://upstash.com/blog/ai-agent-sandbox-providers-compared-2026); contradicted on Daytona by [Novita](https://blogs.novita.ai/best-ai-agent-sandboxes-2026/)
- Reported prices: E2B and Daytona $0.0504 per vCPU-hour; Modal about $0.071; Vercel Sandbox $0.128 per active CPU-hour, billed only while the CPU is active (one comparison; search summary). — [Upstash](https://upstash.com/blog/ai-agent-sandbox-providers-compared-2026)
- Positioning: Modal for in-sandbox GPUs; E2B is CPU-only; Sprites and Daytona emphasise persistent disks; Cloudflare runs containers at the edge (vendor-authored sources; search summary). — [Fly.io](https://fly.io/learn/agent-sandbox-providers/); [Modal](https://modal.com/resources/best-code-execution-sandboxes-ai-agents)
- Devin separates "the brain from the machine": hosted control plane, execution VM with narrowly scoped credentials, hypervisor-level snapshot/suspend/restore, warm VM pools (search summary). — [Cognition](https://cognition.ai/blog/the-cost-of-building-cloud-agents); [ZenML LLMOps database](https://www.zenml.io/llmops-database/building-and-deploying-production-cloud-agents-for-software-engineering)
- Symphony's spec leaves sandbox posture to each implementation and recommends OS-level isolation and narrowed credentials; its hooks are "fully trusted" shell. — [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md)

### Inferences
- The dominant open-source durability pattern is "level-triggered reconciliation": keep desired state in the ledger, make each tick idempotent, and let crashed runs be re-dispatched. This avoids a workflow engine because the agent session, not the pipeline, holds the long-running state.
- A durable engine earns its place when the pipeline has multi-step deterministic stages around the agent (plan, implement, verify, review, merge) that must not repeat side effects, or when many pipelines run on shared infrastructure.
- Agent-step billing is a real cost factor for hosted engines because agent loops create many steps per run.
- Two isolation tiers are standard: worktrees for trusted local work, microVM/container sandboxes for unattended or untrusted work. Credential brokering outside the sandbox (Symphony's host-side tracker tool, Devin's scoped credentials) recurs in both.

### Gaps
- No primary evidence was found of a named open-source orchestrator in section 1 using Temporal, Inngest, Restate, DBOS, LangGraph, Vercel Workflow or Cloudflare Workflows underneath.
- Vercel Workflow and Cloudflare Workflows got only passing mentions; no agent-specific comparison was found.
- Cold-start figures for sandboxes conflict across sources and were left out.
- Daytona's licence and isolation model are disputed between sources; not checked against the repo.
- Firecracker self-hosting and Docker sandbox products were not researched directly.

## 5. What state/coordination substrates are used, and what are their reported pros and cons?

### Takeaway
Five substrates are in use: hosted trackers (Linear, GitHub Issues), git-backed ledgers (Beads on Dolt), application databases (Postgres, SQLite), filesystem mailboxes and task files, and in-memory state with the tracker as truth. Trackers win on human visibility; databases win on atomic claims and budgets; Beads wins on agent-native dependency graphs but has had painful storage migrations; filesystem mailboxes are simple but single-machine and fragile on resume.

### Cited Findings
- Linear as control plane: Symphony polls Linear, filters by active states and required labels, sorts by priority then age, and uses states such as `Human Review` for hand-off. Linear is the only tracker in v1; others are left to the community (search summary for the last point). — [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md); [Help Net Security](https://www.helpnetsecurity.com/2026/04/28/openai-symphony-codex-orchestration-linear/)
- Tracker-as-truth consequences in Symphony: moving an issue to a terminal state stops the run and cleans the workspace; tracker errors skip dispatch for that tick; the agent, not the orchestrator, writes comments and state changes. — [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md)
- GitHub Issues + labels: used by Symphony ports (`zack-nova/symphony` has a "GitHub label-state tracker") and by GitHub Agent HQ, where work is assigned in the GitHub web interface (search summary). — [zack-nova/symphony](https://github.com/zack-nova/symphony); [GitHub blog](https://github.blog/news-insights/company-news/welcome-home-agents/)
- PR/CI state as coordination signal: Composio derives board lanes from agent status plus PR, CI and review state and routes failures back to the owning worker. — [GitHub](https://github.com/ComposioHQ/agent-orchestrator)
- Postgres: Paperclip (atomic checkout with execution locks, blocker dependencies, DB-backed wakeup queue, spend tracking by agent/project/goal/issue/provider/model) and Multica (Postgres 17). — [Paperclip](https://github.com/paperclipai/paperclip); [Multica](https://github.com/multica-ai/multica)
- SQLite: Emdash keeps state in a local SQLite database and says it does not send code or chats to its servers. — [GitHub](https://github.com/generalaction/emdash)
- Beads pros as documented: dependency-aware `bd ready`, atomic `--claim`, hash IDs that avoid merge collisions, compaction to save context, cell-level merge and branching from Dolt, sync over an ordinary git remote. — [GitHub](https://github.com/steveyegge/beads)
- Beads cons as documented: single writer in embedded mode; experimental HTTP backend that is "not a byte-for-byte mirror" of local mode; schema skew between binaries; coordinated upgrades across clones; GitHub sync can mis-link issues across renamed or multiple repos. — [GitHub](https://github.com/steveyegge/beads)
- Beads migration pain: DoltHub wrote that the move to Dolt added friction for solo users used to the SQLite + git model, leading to a "Beads Classic" restoration; a user blog reports losing 9.5 hours when embedded mode moved the database directory; the project publishes a recovery guide for an "accidental 1.2.1 release" (search summary; DoltHub sells Dolt). — [DoltHub, 2026-04-02](https://www.dolthub.com/blog/2026-04-02-restoring-beads-classic/); [Beadbox blog](https://beadbox.pages.dev/en/blog/beads-v1-the-hard-way); [Beads recovery doc](https://beads.gascity.com/recovery/accidental-1-2-1-release)
- Beads server mode evolved further in July 2026 with a "proxied server mode" (title only; not read). — [DoltHub, 2026-07-22](https://dolthub.com/blog/2026-07-22-introducing-beads-proxied-server-mode/)
- Critical sentiment exists but is thin: a nine-comment HN thread includes a commenter calling the Gas Town/Dolt/Beads ecosystem "the absolute nadir of vibecoded slop" (search summary; not representative). — [HN mirror](https://hn.nuxt.dev/item/49516848)
- Gas Town cannot run on a different backend than Beads, per Yegge (search summary). Gas City relaxes this with a file-based bead store. — [Software Engineering Daily](https://softwareengineeringdaily.com/2026/02/12/gas-town-beads-and-the-rise-of-agentic-development-with-steve-yegge/); [Gas City](https://github.com/gastownhall/gascity)
- Filesystem mailboxes: Claude Code agent teams store one JSON inbox per agent and a task directory; claims use file locks; invalid inbox entries are removed on read; documented problems include "Task status can lag", no resumption of in-process teammates, and one team per session. — [Claude Code docs](https://code.claude.com/docs/en/agent-teams)
- Inter-agent messages are treated as untrusted peer input in Claude Code: a teammate "can't approve a permission prompt or supply consent on your behalf". — [Claude Code docs](https://code.claude.com/docs/en/agent-teams)
- Repo files as config substrate: Symphony's `WORKFLOW.md` (hot-reloaded), Gas Town/Gas City TOML formulas, AGENTS.md. — [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md); [Gas Town](https://github.com/steveyegge/gastown)

### Inferences
Pros and cons by substrate (synthesis; only partly stated in sources):

| Substrate | Pros | Cons |
|---|---|---|
| Linear / GitHub Issues + labels | Humans already live there; free audit trail and notifications; no extra infrastructure; restart recovery is trivial | Rate limits and polling latency; weak atomic claim; coarse state machine via labels/states; ties the factory to a SaaS; agents need brokered credentials |
| PR + CI state | Ground truth for "done"; natural review gate | Only covers work that already has a branch |
| Postgres / SQLite queue | Atomic checkout, locks, budgets, queries; easy dashboards | Another system of record to sync with the human tracker; Paperclip itself has not yet shipped bring-your-own tracker |
| Beads (Dolt, git-synced) | Agent-native dependency graph; offline; travels with the repo; branch/merge of issue data | Operational complexity, single-writer default, migration breakage history; humans need extra tooling to see it |
| Filesystem mailboxes / task files | Zero dependencies; inspectable; fine for one machine and one session | No cross-machine story; lagging status; lost on resume; lock contention |
| In-memory + tracker as truth | Simplest dispatcher; nothing to migrate | Loses retry timers and token accounting on restart; all history must be written to the tracker by the agent |

- A common resolution is a hybrid: a human-facing tracker for intake and review states, and a local ledger or database for claims, retries and agent-to-agent messages. Beads' `bd github sync` and Emdash's ten tracker integrations both point this way.

### Gaps
- Rufus Pollock's "issue tracking dilemma" post (2026-02-23), which compares these options directly, could not be read (host unreachable).
- No quantitative data (API rate-limit incidents, claim-race frequency) was found for trackers used as queues.
- `mcp_agent_mail` and other mailbox-over-MCP projects were not researched.
- Jira and Linear agent-native features (agent assignees, Linear's own agent APIs) were not researched.

## 6. Is there an emerging reference architecture or consensus stack?

### Takeaway
No official reference architecture was found. A de facto pattern is visible across independent projects: tracker or ledger as source of truth, a small reconciling dispatcher, one isolated workspace per task, pluggable harness adapters (increasingly ACP), repo-carried instructions (AGENTS.md, SKILL.md, a workflow file), MCP for tools with credentials brokered outside the agent, and a PR/CI/review gate with a merge queue. The "software factory" and "dark factory" labels are in common use, but fully unattended operation remains contested and evidence for it comes from very small teams.

### Cited Findings
- Symphony is published as a language-neutral spec that users are invited to have a coding agent implement "in a programming language of your choice", i.e. the reference is the spec, not the code. — [GitHub](https://github.com/openai/symphony)
- Gas City describes itself as "the open-source platform for building software factories from teams of coding agents", with packs, formulas, orders and pluggable providers. — [GitHub](https://github.com/gastownhall/gascity)
- StrongDM's AI team described a non-interactive "Software Factory" in February 2026: agents write, test and converge without human code review; humans write specs, curate scenarios and watch scores; scenarios act as holdout validation because agents had written `return true` to pass narrow tests (search summary). — [Simon Willison, 2026-02-07](https://simonwillison.net/2026/Feb/7/software-factory); [Infralovers](https://www.infralovers.com/blog/2026-02-22-architektur-patterns-dark-factory/)
- StrongDM's Attractor is a non-interactive coding agent structured as a graph of phases and published as a natural-language spec ("nlspec"), not an implementation (search summary). — [HN discussion mirror](https://hn.nuxt.dev/item/46924426); [rywalker.com](https://rywalker.com/research/strongdm-factory)
- StrongDM suggested that a factory spending at least $1,000 in tokens per human engineer per day "still has room for improvement"; commentators note the credible examples are tiny teams and that long-term outcome data is missing (search summary). — [Simon Willison, 2026-02-07](https://simonwillison.net/2026/Feb/7/software-factory); [rywalker.com](https://rywalker.com/research/strongdm-factory)
- "Dark factory" corresponds to the top level of Dan Shapiro's five-level taxonomy and is described as an aim, not a default (search summary). — [Tessl](https://tessl.io/patterns/agentic-development-workflow/dark-factory/)
- One analysis of Gas Town argues the binding constraints are design and planning, not execution speed (search summary). — [ascii.co.uk](https://ascii.co.uk/news/article/news-20260125-f25263de/steve-yegges-gas-town-reveals-agent-orchestration-design-pat)
- Vendors position themselves as the neutral layer: GitHub Agent HQ hosts third-party agents; Conductor's CEO said its differentiator was sitting above individual coding agents (search summary). — [The New Stack](https://thenewstack.io/github-embraces-the-coding-agent-competition-with-agent-hq/); [SiliconANGLE](https://siliconangle.com/2026/11/04/meta-acquires-ai-coding-startup-conductor-whose-app-runs-several-coding-agents-at-once/)
- Standards governance has consolidated under the Linux Foundation: MCP, AGENTS.md and goose in AAIF; A2A as a Linux Foundation project (search summary for AAIF). — [WorkOS](https://workos.com/blog/the-linux-foundation-launches-the-aaif); [A2A](https://github.com/a2aproject/A2A)
- Merge gating is a shared element: Gas Town's Refinery merge queue with verification gates and bisecting; Composio's CI/review feedback loop; Symphony's `Human Review` state; Claude Code's `TaskCompleted` hook. — [Gas Town](https://github.com/steveyegge/gastown); [Composio](https://github.com/ComposioHQ/agent-orchestrator); [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md); [Claude Code docs](https://code.claude.com/docs/en/agent-teams)

### Inferences
A consensus stack, assembled from the projects above (my synthesis, not a published standard):

1. **Intake and ledger**: a human tracker (Linear or GitHub Issues) for intake and review states, optionally mirrored into a local ledger (Postgres/SQLite, or Beads) for claims, dependencies and retries.
2. **Dispatcher**: a small daemon with a reconcile loop, concurrency caps, backoff and stall detection (Symphony's spec is the clearest template).
3. **Workspace**: git worktree per task locally; container or microVM per task when unattended; setup/teardown hooks.
4. **Harness layer**: a narrow session interface with ACP as the general adapter and native adapters (Claude `stream-json`/SDK, Codex app-server) where depth is needed; tmux as the human-attachable fallback.
5. **Model layer**: per-task harness + model choice; an optional gateway for routing and spend tracking.
6. **Portable context**: AGENTS.md, SKILL.md skills and a workflow/formula file, all in the repo.
7. **Tools**: MCP servers, with secrets held by the host or a gateway instead of the agent process.
8. **Gates**: tests/CI, reviewer agents, a merge queue, then human review of PRs; budgets and hard stops.
9. **Observability**: structured logs, token accounting, a board or dashboard (OpenTelemetry in Gas Town).

- The parts that are settled are the files (AGENTS.md, SKILL.md), MCP, worktrees and the PR gate. The parts still in flux are the ledger (tracker vs database vs Beads), the harness protocol (ACP v1→v2, vendor RPCs) and how much human review can be removed.
- Building against specs and open formats is safer than building against any one GUI orchestrator, given 2026's shutdowns and acquisitions.

### Gaps
- No vendor-neutral, published reference architecture document was found; the stack above is inferred.
- StrongDM's own factory site and Simon Willison's post could not be read directly; the StrongDM details rest on search summaries.
- Latent Space coverage was not retrieved.
- No independent data was found on defect rates, cost per merged PR or human review load for any of these systems; OpenAI's 500% figure is self-reported.
