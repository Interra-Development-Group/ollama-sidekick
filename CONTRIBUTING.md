# Contributing

Thanks for your interest in Ollama Sidekick. This project is a privacy-first, fully
local Chrome extension — every contribution that keeps it that way is welcome.

## Quick start

### Prerequisites

- **Node.js 20+** and **npm**
- **[Ollama](https://ollama.com)** installed locally
- **Chrome 114+** (any Chromium browser with side panel support also works)

### Set up Ollama with CORS for the extension

Chrome extensions run on a different origin than `localhost`. Ollama blocks
cross-origin requests by default, so you must start it with the extension origin
allowed.

For unpacked development builds the extension ID changes per machine, so use the
wildcard:

```bash
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
```

For testing the production-build extension, lock it to the specific extension ID
shown in `chrome://extensions`.

### Pull the required models

```bash
# Chat model (any tool-calling model works; this is the default)
ollama pull llama3.1

# Embeddings model (required for favorites search)
ollama pull nomic-embed-text
```

### Install and run

```bash
npm install
npm run dev
```

This starts the Plasmo dev server with hot reload. Load the unpacked extension:

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `build/chrome-mv3-dev`

The side panel icon appears in the toolbar. Click it to open the panel.

## Code conventions

- **TypeScript** throughout. Run `npm run typecheck` before opening a PR.
- **Tailwind CSS** for styling — no separate CSS files for components.
- **Layout rules** (enforced by review, not lint):
  - Business logic in `src/lib/`
  - React hooks for browser/extension APIs in `src/hooks/`
  - UI components in `src/components/`
  - Chrome runtime message handlers in `src/background/index.ts`
  - Components do **not** call `chrome.runtime.*` directly — always go through a hook
- **Message contracts** live in [src/types/messages.ts](src/types/messages.ts) as a
  discriminated union. Adding a new cross-context message means adding to that union
  first.
- **No raw string message types** anywhere else in the codebase.

## Adding a feature

The workflow, in order:

1. Define the message types in [src/types/messages.ts](src/types/messages.ts)
2. Implement the business logic in the appropriate `src/lib/` module
3. Wire the background handler in [src/background/index.ts](src/background/index.ts)
4. Add a hook in `src/hooks/` for the React side
5. Build the UI component in `src/components/`
6. Compose it into the side panel in [src/sidepanel/index.tsx](src/sidepanel/index.tsx)

The full architectural rationale lives in [CLAUDE.md](CLAUDE.md) "Adding a New
Feature".

## Compound Engineering workflow

For non-trivial features, use the Compound Engineering workflow rather than freehand
edits:

- `/ce-brainstorm` to scope a new feature — produces `docs/brainstorms/<topic>-requirements.md`
- `/ce-plan` to plan the implementation — produces `docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md`
- `/ce-work` to execute the plan — produces commits and a PR

Seed topics for upcoming features live in [docs/brainstorms/](docs/brainstorms/) as
`*-seed.md` files. Running `/ce-brainstorm` against a seed turns it into a
requirements doc.

See [AGENTS.md](AGENTS.md) for the full convention.

## PR conventions

- **Branch naming:** `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`,
  `docs/<short-name>`, `refactor/<short-name>`. Match the convention used by the
  recent commits in `git log`.
- **Commit messages:** concise, lowercase leading verb, present tense. Look at
  `git log --oneline -20` for the existing style.
- **Atomic commits:** one logical change per commit; keep refactors separate from
  feature work so reviews stay scannable.
- **Before pushing:**
  - `npm run typecheck` passes
  - `npm run lint` passes
  - `npm run build` produces a working extension you've manually loaded and clicked
    around in
- **PR descriptions:** what changed, why, how to verify. Reference the relevant
  brainstorm or plan doc if there is one.

## Docs we'd love help with

If you're looking for a self-contained contribution, any of these doc gaps would
help future contributors and users:

- **In-app MCP configuration walkthrough** — the Options page surfaces MCP server
  settings but does not explain the model. A short walkthrough (with screenshots)
  added to README or a `docs/mcp.md` would help. The corresponding feature work is
  tracked in [docs/brainstorms/options-page-mcp-docs-seed.md](docs/brainstorms/options-page-mcp-docs-seed.md).
- **Per-extension-ID CORS command surfaced in the UI** — the README explains the
  `OLLAMA_ORIGINS=chrome-extension://<id>` lockdown, but the Options page could show
  a one-click copy of the user's actual extension ID. Small feature plus a docs
  update.
- **Tool-calling model compatibility notes** — not every Ollama model supports tool
  calling reliably. A short matrix in CONTRIBUTING.md or README listing tested models
  and known-broken ones would save people time.
- **`chrome://` and Chrome Web Store pages** — document the expected "cannot access
  this page" UX so users don't think it's a bug.

## A note on the code of conduct

By contributing you agree to be respectful and constructive. A formal Code of
Conduct (Contributor Covenant) will be added if and when the project's contributor
base warrants it.

## Where to ask questions

Open an issue on
[the GitHub repo](https://github.com/Interra-Development-Group/ollama-sidekick/issues).
For sensitive matters (e.g., security disclosures), email a maintainer directly
rather than opening a public issue.
