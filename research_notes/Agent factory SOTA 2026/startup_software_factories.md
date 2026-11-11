# Startup "Software Factory" Write-ups (state of practice, late 2026)

> **Access caveat that applies to every finding below.** This research session could not fetch any web page directly: the session's network policy rejected `www.gumloop.com`, `x.com` and `api.fxtwitter.com` (proxy 403 / DNS failure), so page fetching was abandoned. Everything here comes from **web-search result summaries and excerpts**, not from reading the full pages. Quotes are as the search tool rendered them; wording should be re-checked against the primary page before being presented as verbatim. Where a figure appeared in one search pass but not in another, that is flagged. Material dated before 2026 is marked "(older)".

## What exactly does https://www.gumloop.com/engineering/software-factory describe?

### Takeaway
Gumloop's "Software Factory" is an internal system in which a Gumloop agent plays engineering manager and dispatches jobs to coding agents; jobs enter from production telemetry or an engineer ping, are tracked as Linear issues, must come back with "proof", and become PRs that a human engineer always reviews and merges ("the Factory never merges its own work"). Only excerpts were readable; sandboxing, model choice and the full lessons list could not be recovered.

### Cited Findings
- Page title is "Software Factory", on Gumloop's engineering blog; a search summary described it as published roughly 12 days before 2026-11-11 (i.e. about end of October 2026), with metrics stated "as of October 28, 2026". — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- Core architecture: "the Factory is built so a Gumloop agent acts as the engineering manager, and coding agents do the work." The manager agent "reads our engineering skills, our conventions, and the line owner's preferences, then hands the job to a coding agent." — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- Gumloop's own product supplies the surrounding infrastructure (scheduled and on-demand triggers); i.e. the company dogfoods its agent/workflow platform as the orchestration layer rather than building a bespoke orchestrator. — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- Work is organised into "lines" (production lines), each with a human "line owner" whose preferences the manager agent reads. — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- Flow of a job (as excerpted): job arrives from **production telemetry** or an **engineer ping** -> **Gumloop trigger** -> **Linear issue** -> **factory worker**; jobs "with proof" become a **pull request**, wait for **review**, then **engineer merges**. — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- Human gate: "The Factory never merges its own work." No work is auto-merged; an engineer reviews and merges. — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- Why Linear: it is the engineers' single central workspace, so putting the Factory there means nobody has to check a second tool to see what it is doing. — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- De-duplication: the worker searches Linear and keeps a "fingerprint" of every problem it has seen so the same job is not picked up twice. — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- Skills as the main lever: the team wrote a library of engineering skills and iterated on the process many times until "eventually it just worked"; the first production line came out of that iteration. — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- Harness: "The Factory started on Cursor cloud agents." "On September 17, a Cursor outage stopped Factory work. Nothing else in the Factory changed." (The excerpt frames this as a single-vendor dependency lesson; what they moved to afterwards was not visible.) — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- Self-improvement example: the Factory flagged that the repo's AGENTS.md files were bloated and stale, and the team cut them by 44%. — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- Reported results (self-reported; surfaced in one search pass, not reproduced in a second pass, so treat as medium-confidence until the page is read): 571 agent-written PRs merged over six weeks; first production line had merged 122 agent-written PRs by October 28; engineers who own Factory lines merge 2.5x as many PRs per week; their own non-Factory PRs rose 33%; agent start time at P99 fell from 24.9 s to 4.5 s; the Factory "fixed three of our most expensive database queries". — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- Context on the company: Gumloop is an AI agent / workflow automation platform that raised a $50M Series B. — [Gumloop Series B post](https://www.gumloop.com/blog/series-b)

### Inferences
- Gumloop sits at the conservative end of the autonomy spectrum: autonomous intake and implementation, mandatory human merge. It is a "manager agent + commodity coding agents" design, not a many-specialised-roles design.
- The "proof" requirement (a job only becomes a PR if it carries evidence) plus Linear fingerprinting suggest the team's main engineering effort went into intake quality and verification evidence, not into the coding step itself.
- The Cursor outage anecdote implies the coding harness is treated as a swappable component behind the manager agent; "nothing else changed" suggests harness portability was a deliberate lesson.
- The P99 start-time metric (24.9 s to 4.5 s) implies pre-warmed or snapshotted environments, similar to Ramp and Stripe, but this is not confirmed.

### Gaps
- The page could not be fetched (`www.gumloop.com` is outside the session's allowed network domains). Not recovered: author, exact publication date, which models are used, sandbox/environment design, what "proof" concretely consists of, the list of lines, the full lessons section, cost figures, and what replaced or supplemented Cursor cloud agents.
- The numeric results above need verification against the page itself.

## What does the X post https://x.com/DeepSeekHarness/status/2116857257245987236 say?

### Takeaway
The post could not be read. Its contents are unknown and are not guessed at here.

### Cited Findings
- Direct fetch of x.com and of the fxtwitter mirror both failed at the network layer in this session (hosts not allowed); after those failures no further mirrors were tried. Web search for the status ID and the account name returned no page containing the post's text. — [X post URL (unreadable)](https://x.com/DeepSeekHarness/status/2116857257245987236)
- Context only, not the post's content: "DeepSeek Harness" (dsh) is an MIT-licensed, open-source agent runtime from DeepSeek, released as a developer preview in mid-August 2026, built on the Cordis meta-framework with a micro-kernel "everything is a plugin" design (model adapters, tool registries, sandboxing, session state, event dispatch and UIs load as independent extensions). — [InfoQ](https://www.infoq.com/news/2026/08/deep-seek-harness/); [The New Stack](https://thenewstack.io/deepseek-harness-open-source-plugins/)
- The repository is `deepseek-ai/deepseek-harness`; one source reports about 197K GitHub stars within eight days of release. — [amplifying.ai](https://amplifying.ai/coding-agents/deepseek-harness)
- It is described as still in developer preview with breaking changes possible. — [Verdent guide](https://fenji.verdent.ai/guides/agent/deepseek-harness-evaluation-checklist)

### Inferences
- The handle suggests the post is from an account associated with (or named after) the DeepSeek Harness project, and the user paired it with a software-factory article, so it plausibly concerns running a software factory on that harness. This is speculation from the handle alone.

### Gaps
- Full text, author identity (official vs fan account), date, and any linked thread are unknown. To read it, `x.com` (or a mirror such as `fxtwitter.com` / `xcancel.com`) must be allowed in the session's network settings, or the user can paste the text.

## What other startups/scaleups have published software factory / dark factory / background agent write-ups in 2025-2026, and what does each do differently?

### Takeaway
By late 2026 there is a recognisable genre. The poles are StrongDM (no human writes or reviews code; scenario-based validation against digital twins) and the "human merges everything" camp (Gumloop, Stripe, Warp). In between, Ramp, PostHog, Uber and others report agents producing the majority of merged PRs with thinning human review.

### Cited Findings
**StrongDM - Software Factory (Feb 2026)**
- Three-person team; charter rules: "Code must not be written by humans" and "Code must not be reviewed by humans." Humans write specifications, design scenarios and architect systems. — [Stanford CodeX](https://law.stanford.edu/2026/02/08/built-by-agents-tested-by-agents-trusted-by-whom/)
- Validation replaces review: hidden "holdout" scenarios plus a "Digital Twin Universe" of behavioural clones of external services (Okta, Jira, Slack, Google Docs) so tests run without touching production APIs. — [Stanford CodeX](https://law.stanford.edu/2026/02/08/built-by-agents-tested-by-agents-trusted-by-whom/)
- Cost heuristic attributed to StrongDM's CTO: if you haven't spent at least $1,000 on tokens today per human engineer, your software factory has room for improvement. — [The Pragmatic CTO](https://www.thepragmaticcto.com/p/the-software-factory-when-no-human)
- Simon Willison published an analysis on 7 February 2026. Critics question "no human review" for security-critical software and note that maintaining the twins remains human work. — [rywalker.com research note](https://rywalker.com/research/strongdm-factory)

**OpenAI - "Harness engineering" (11 Feb 2026, Ryan Lopopolo)**
- Internal beta product of about one million lines built over five months with zero manually written lines, across roughly 1,500 PRs; some Codex runs lasted six hours on one task. — [OpenAI](https://openai.com/index/harness-engineering/)
- Engineers' job became to "design environments, specify intent, and build feedback loops"; architectural invariants enforced mechanically by linters rather than by code review; human QA capacity became the bottleneck. — [OpenAI](https://openai.com/index/harness-engineering/)

**Cursor - "Scaling long-running autonomous coding" and "Towards self-driving codebases" (early 2026)**
- Planner/worker hierarchy: "Planners continuously explore the codebase and create tasks. They can spawn sub-planners for specific areas, making planning itself parallel and recursive." "Workers pick up tasks and focus entirely on completing them. They don't coordinate with other workers or worry about the big picture." — [Cursor](https://cursor.com/blog/scaling-agents)
- First post: a judge agent decided at the end of each cycle whether to continue. Second post: "We found agents were reasonably good at following instructions to completion, so the judge was removed to keep the system simple." — [Cursor scaling-agents](https://cursor.com/blog/scaling-agents); [Cursor self-driving-codebases](https://cursor.com/blog/self-driving-codebases)
- Reported about 1,000 commits per hour over a week-long run with hundreds of concurrent workers on one branch; bottleneck moved from compute to disk I/O; lessons include accepting a small error rate for throughput and avoiding over-synchronisation. GPT-5.2-class models were found better at extended autonomous work. — [ZenML summary of Cursor](https://www.zenml.io/llmops-database/scaling-multi-agent-autonomous-coding-systems)

**Ramp - Inspect (Jan 2026 onward)**
- Each session runs in a Modal Sandbox with OpenCode as the agent, plus a VS Code server, web terminal and a VNC stack with Chromium for visual verification of frontend changes. Every 30 minutes a Modal cron job clones all repos, installs dependencies and snapshots them so sessions start warm. — [Modal](https://modal.com/blog/how-ramp-built-a-full-context-background-coding-agent-on-modal)
- Share of merged PRs over time: about 30% (Jan 2026) — [InfoQ](https://infoq.com/news/2026/01/ramp-coding-agent-platform/); "over half" (Modal case study) — [Modal](https://modal.com/blog/how-ramp-built-a-full-context-background-coding-agent-on-modal); "three of every four PRs Ramp merges" (later Linear customer story) — [Linear](https://linear.app/customers/ramp)

**Stripe - Minions (Feb 2026)**
- "Minions are Stripe's homegrown coding agents, responsible for more than a thousand pull requests merged each week. Though humans review the code, minions write it from start to finish." — [Stripe](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents)
- Slack message in, CI-passing PR out; isolated pre-warmed devboxes; a fork of Block's Goose agent; 400+ internal MCP tools via a central "Toolshed" server; local fast feedback before CI and a maximum of two CI rounds. — [daily.dev summary of Stripe post](https://daily.dev/posts/minions-stripe-s-one-shot-end-to-end-coding-agents-dd6lznw0q)
- A later podcast puts volume at about 1,300 PRs per week, triggered from Slack reactions. — [Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-stripe-built-minionsai-coding)

**Spotify - Honk (older: late 2025, with 2026 follow-ups; secondary sources only)**
- Background agent built on Claude Code / Claude Agent SDK in Kubernetes pods, with a planning / coding / review pipeline aimed at fleet-wide migrations; 1,500+ merged PRs claimed. — [Grind Engineer Substack](https://grindengineer.substack.com/p/how-spotify-uses-ai-agents-to-rewrite-its-entire-codebase)

**Uber**
- More than 70% of PRs reportedly come from local or cloud agents; platform consists of a context graph, an MCP gateway, an LLM gateway, an execution environment and governance. — [Port newsletter](https://newsletter.port.io/p/how-uber-built-a-software-factory)

**PostHog**
- Agent-opened share of monorepo PRs rose from about 20% to 70% in four months; merged PRs went from 1,441 (January) to 4,869 (August) with 10% engineering headcount growth. — [PostHog newsletter, "Can software factories actually work?"](https://newsletter.posthog.com/p/software-factories)
- A critique reports that in one day's ~200 merged PRs, 40% merged with no human review, and gives a different monthly figure (4,725 for June). — [Medium, "Nobody Has Actually Built a Software Factory"](https://medium.com/@NMitchem/nobody-has-actually-built-a-software-factory-77ffdc0c3efc)

**Warp**
- Published a guide on moving from coding agents to a software factory; per a critique, its core factory metric (27 Aug 2026 post) is "average human touchpoints per PR", and self-improvement patches to config and skills go to a human review inbox before merging. Keeps human checkpoints on specs and code. — [Warp](https://www.warp.dev/articles/coding-agents-to-software-factory); [Medium critique](https://medium.com/@NMitchem/nobody-has-actually-built-a-software-factory-77ffdc0c3efc)

**Strike**
- "Building the Strike Software Factory": an "agent council" runs a multi-agent pass (spec, correctness, security) before a human sees a PR. — [Strike](https://strike.me/int/en/blog/strike-software-factory/)

**Intercom**
- Set a goal to double merged PRs per R&D employee and reportedly tripled it in 16 months. — [DEV Community roundup](https://dev.to/dehemi_fabio/software-factories-why-every-engineering-blog-is-suddenly-talking-about-them-17p0)

### Inferences
- Entry points differ by company: Slack (Stripe, Ramp), ticket tracker (Gumloop via Linear), telemetry-driven self-intake (Gumloop), specs and scenarios (StrongDM), long-horizon goal statements (Cursor experiments).
- Almost every production system converges on the same infrastructure trio: pre-warmed isolated sandboxes, a central tool gateway (MCP), and reuse of existing CI as the verification backbone.
- Build-vs-buy splits: Stripe, Ramp, Spotify built harness wrappers around open agents (Goose, OpenCode, Claude Agent SDK); Gumloop rented Cursor cloud agents and felt the outage risk.

### Gaps
- No primary-source material was found in this pass for Factory.ai (Droids), Cognition/Devin, Sourcegraph Amp, Replit, Vercel, Linear's own agents, or incident.io; they are omitted rather than described from memory.
- Spotify, Uber, Intercom and Warp details rest on secondary summaries. PostHog's figures conflict between sources.

## What is the common vocabulary and maturity model?

### Takeaway
The shared ladder is Dan Shapiro's five levels (Jan 2026), topping out at the "dark factory"; the shared craft terms are "harness engineering", "background agents", "skills", and spec/scenario-driven development.

### Cited Findings
- Dan Shapiro (Glowforge CEO) published "The Five Levels: from Spicy Autocomplete to the Dark Factory" on 23 January 2026, modelled on NHTSA driving-automation levels: Level 0 "spicy autocomplete", Level 1 "coding intern", up to Level 5 "dark factory", a black box that turns specs into software where no human writes or reviews code. The name comes from Fanuc's lights-out factory. — [Simon Willison link blog](https://simonwillison.net/2026/Jan/28/the-five-levels/)
- Level 4 is described as humans writing detailed specs and validating outcomes while AI builds. — [infralovers](https://www.infralovers.com/blog/2026-02-22-architektur-patterns-dark-factory/)
- A common gloss: reaching Level 5 "is a statement about your test and rollback infrastructure, not your model"; the levels are "gated by verification, not intelligence". — [understandingdata.com](https://understandingdata.com/posts/five-levels-gated-by-verification/)
- "Harness engineering" was popularised by OpenAI's February 2026 post: the work is designing environments, intent and feedback loops for agents. — [OpenAI](https://openai.com/index/harness-engineering/)
- "Background agent" is the term for asynchronous, sandboxed agents that return a PR (Ramp Inspect, Stripe Minions). — [Modal on Ramp](https://modal.com/blog/how-ramp-built-a-full-context-background-coding-agent-on-modal)
- A generic definition in 2026 guides: an automated loop that takes issues from a backlog, assigns them to coding agents, verifies fixes independently, and leaves the merge decision to a human; "the factory ends at a merged pull request". — [MindStudio](https://www.mindstudio.ai/blog/how-to-build-ai-software-factory)
- Gumloop adds factory-floor vocabulary: "lines", "line owners", "factory worker", "proof". — [Gumloop](https://www.gumloop.com/engineering/software-factory)

### Inferences
- "Software factory" is used loosely for anything from Level 3-4 (human-merged, agent-written) to Level 5; only StrongDM and OpenAI's internal experiment claim the top rung.

### Gaps
- Exact wording of Shapiro's Levels 2 and 3 was not recovered; his original post was not read directly.

## Where do these write-ups agree and disagree?

### Takeaway
Agreement: verification and human review, not code generation, are the constraint; context/skills and warm sandboxes matter more than clever orchestration. Disagreement: whether humans must review code at all, and how many agent roles are worth having.

### Cited Findings
- Review is the bottleneck: OpenAI says human QA capacity became the limit — [OpenAI](https://openai.com/index/harness-engineering/); HumanLayer's "Why Software Factories Fail" argues the same and cites rising unreviewed merges and incident rates — [HumanLayer on GitHub](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md)
- Industry benchmark (LinearB, via secondary summaries): agentic PRs wait about 5.25x longer for pickup and merge at 32.7% vs 84.4% for human PRs; merge rate ranges 37% (less mature orgs) to 79% (stronger orgs). — [LinearB podcast](https://linearb.io/dev-interrupted/podcast/why-software-factories-fail-humanlayer-warp-linearb)
- Human review, yes: Gumloop ("never merges its own work") — [Gumloop](https://www.gumloop.com/engineering/software-factory); Stripe (every Minion PR is human-reviewed) — [Stripe](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents). Human review, no: StrongDM — [Stanford CodeX](https://law.stanford.edu/2026/02/08/built-by-agents-tested-by-agents-trusted-by-whom/). Drifting in practice: PostHog, with a large share of PRs merged without human review — [Medium critique](https://medium.com/@NMitchem/nobody-has-actually-built-a-software-factory-77ffdc0c3efc)
- Role count: Cursor removed its judge role "to keep the system simple" and found the planner overloaded when given too many roles — [Cursor](https://cursor.com/blog/self-driving-codebases); Strike adds a multi-agent review council — [Strike](https://strike.me/int/en/blog/strike-software-factory/); Gumloop uses one manager agent plus coding agents — [Gumloop](https://www.gumloop.com/engineering/software-factory)
- Sceptical view: a critique titled "Nobody Has Actually Built a Software Factory" disputes that published systems meet the term. — [Medium](https://medium.com/@NMitchem/nobody-has-actually-built-a-software-factory-77ffdc0c3efc)
- An arXiv survey names durable state, structured coordination, adversarial verification and bounded permissions as open requirements for autonomous factories. — [arXiv 2609.04630](https://arxiv.org/pdf/2609.04630)

### Inferences
- The trend through 2026 is toward fewer, stronger agents with rich context (skills, AGENTS.md hygiene, tool gateways) and away from elaborate role hierarchies, except at the review stage where extra agents are added.
- Reported metrics are not comparable: share of merged PRs (Ramp, PostHog, Uber), PRs per week (Stripe, Gumloop), PRs per engineer (Intercom, Gumloop), human touchpoints per PR (Warp), token spend per engineer (StrongDM). None of the sources found reports defect or incident rates for agent-written code alongside throughput.

### Gaps
- No controlled comparison of single-agent vs multi-agent designs was found; evidence is practitioner claims.
- LinearB numbers come from secondary summaries and a podcast transcript, not the original report.
