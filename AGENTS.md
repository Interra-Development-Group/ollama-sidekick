# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this project is

LocalMind by Interra is a privacy-first Chrome extension (Manifest V3) that provides a
persistent side panel for AI-assisted browsing, backed by a local Ollama instance
and optional local MCP servers. Nothing leaves the user's machine.

- Product orientation: see [STRATEGY.md](STRATEGY.md)
- User-facing description: see [README.md](README.md)
- Architecture summary: see [ARCHITECTURE.md](ARCHITECTURE.md)
- Full architectural spec (the deep reference): see [CLAUDE.md](CLAUDE.md)
- Dev environment + PR conventions: see [CONTRIBUTING.md](CONTRIBUTING.md)

If you are Claude, also load CLAUDE.md — it contains Claude-specific deep context
that complements this file.

## Compound Engineering workflow

For non-trivial features, use the Compound Engineering loop rather than freehand
edits:

| Stage | Command | Artifact produced |
|-------|---------|-------------------|
| Scope a feature | `/ce-brainstorm` | `docs/brainstorms/<topic>-requirements.md` |
| Plan implementation | `/ce-plan` | `docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md` |
| Execute plan | `/ce-work` | Commits + PR |
| Capture learning | `/ce-learn` | `docs/solutions/<name>.md` |

For very small, well-bounded changes (a typo fix, a one-file rename, a
straightforward bug fix with an obvious root cause), going straight to `/ce-work`
or making the edit directly is fine.

## Brainstorm seeds vs requirements docs

Files in `docs/brainstorms/` ending in `-seed.md` are **starting points**, not
requirements docs. They contain a problem statement, a "why it matters" framing,
and pointers into the codebase. Running `/ce-brainstorm` against a seed produces
the actual requirements doc (`<topic>-requirements.md`) that `/ce-plan` consumes.

Seeds should be treated as TODO items for the brainstorm workflow — they are not
ready for `/ce-plan` directly.

## Where things live

| What | Where |
|------|-------|
| Product strategy and roadmap tracks | [STRATEGY.md](STRATEGY.md) |
| Deep architecture spec | [CLAUDE.md](CLAUDE.md) |
| Human-facing architecture summary | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Contributor dev setup | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Brainstorm seeds and requirements docs | `docs/brainstorms/` |
| Implementation plans | `docs/plans/` |
| Captured solutions / institutional learnings | `docs/solutions/` (created on first use) |
| Public-facing privacy policy and landing page | `docs/privacy.md`, `docs/index.md` |
| Jekyll config for GitHub Pages | `docs/_config.yml` |

The `brainstorms/`, `plans/`, and `solutions/` directories under `docs/` are
**excluded** from the published GitHub Pages site via `docs/_config.yml`. If you
add a new working-artifact directory under `docs/`, add it to the exclude list.

## Conventions that affect agent behavior

- **Message contracts.** All cross-context communication (background ↔ side panel ↔
  content script) goes through the discriminated union in
  [src/types/messages.ts](src/types/messages.ts). When adding a new feature that
  needs cross-context communication, define the message type first, then
  implement.
- **Service worker is non-persistent.** Do not store state in module-level
  variables in `src/background/index.ts`. Use `chrome.storage.session`,
  `chrome.storage.local`, or IndexedDB. See CLAUDE.md "Service Worker Lifecycle"
  for the full rationale.
- **Streaming uses ports.** For multi-message responses (chat tokens), use
  long-lived ports (`chrome.runtime.connect`), not one-shot `sendMessage`. See
  CLAUDE.md "Streaming Tokens to the UI".
- **Layout rules:**
  - Business logic → `src/lib/`
  - Chrome runtime API access → `src/background/` or `src/hooks/`
  - React components → `src/components/`
  - Components do not call `chrome.runtime.*` directly; go through a hook
- **Commit messages:** concise, lowercase leading verb, present tense. See
  `git log --oneline -20` for the existing style.

## Things to refuse or push back on

- **Adding cloud inference fallback.** Even as opt-in. The product's core promise
  is "fully local"; opt-in cloud creates a drift path.
- **Adding analytics, telemetry, or fingerprinting.** Same reasoning.
- **Sending session cookies in the background crawler.** This is intentionally not
  done — the crawler is a public-content fetcher, not an authenticated client.

If a user asks for one of these, raise the strategic concern (point at STRATEGY.md
"Explicitly not doing") and ask whether the product positioning is changing before
implementing.
