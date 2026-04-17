# Content Repository

This repository is managed by the **content creation pipeline** — a multi-agent system
that researches, writes, reviews, and publishes social media content.

## Repository Structure

```
config/
  topics.yaml        # Niche, audience, voice, and topic categories
  platforms.yaml     # Platform handles and posting preferences
knowledge/
  style-guide.md     # Writing style, tone, and formatting rules
  references/        # Source material and reference docs
  past-posts/        # Published posts (committed back by agents)
drafts/              # Work-in-progress content (one file per issue)
content-calendar.md  # Schedule of planned and published posts
```

## Agent Conventions

- **Producer** triages `content:request` issues and manages the calendar
- **Researcher** produces structured research briefs in `drafts/`
- **Writer** turns briefs into platform-ready posts in `drafts/`
- **Reviewer** checks posts for quality, accuracy, and style compliance

## How to Add Content

1. Create a GitHub issue with the `content:request` label
2. The producer picks it up and routes it through the pipeline
3. Or add a row to `content-calendar.md` with status `idea`

## Key Files for Agents

- `config/topics.yaml` — what to write about
- `config/platforms.yaml` — where to publish and format constraints
- `knowledge/style-guide.md` — how to write (voice, tone, rules)
- `knowledge/past-posts/` — what's been published (30-day duplicate window)
