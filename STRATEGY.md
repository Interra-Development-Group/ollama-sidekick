# Product Strategy — LocalMind by Interra

## Target user

Privacy-conscious developers, researchers, and knowledge workers who already run (or
are willing to run) [Ollama](https://ollama.com) locally and want an AI browsing
assistant that respects the same boundary their other local tools do: nothing leaves
the machine.

Secondary: technical users who experiment with MCP servers locally and want a
browser-side surface to invoke them through.

## Problem we solve

Cloud-hosted browser AI assistants force a tradeoff: useful page-aware help in
exchange for sending the page contents (and sometimes the chat) to a remote model
provider. For users who can't or won't make that tradeoff — regulated industries,
research with sensitive sources, anyone with a strong privacy posture — the options
are sparse. Existing local-AI browser tools mostly stop at "chat with a local model"
and don't address the longer-term knowledge workflow (saved pages, semantic
retrieval, tool use).

## Why this product is different

- **Fully local inference.** Every prompt, embedding, and tool call goes to a process
  running on the user's machine. No cloud fallback. No "phone home for analytics."
- **No accounts, no subscriptions, no telemetry.** Install, run Ollama, open the side
  panel.
- **Page context is automatic.** The side panel always knows what tab the user is
  on; chat just works against that page without an extra "summarize this" gesture.
- **A real semantic memory layer.** Favorited pages get crawled, chunked, embedded,
  and stored in IndexedDB. The Search tab is a true semantic search over the user's
  curated knowledge.
- **MCP-native.** Local MCP servers are first-class — tools discovered, surfaced in
  chat, results streamed back.

## Active tracks (shipping today)

These are the four pillars of the current product:

1. **Page-aware chat with local models** — side panel, model selector, multi-turn
   conversation, page text and user selection as context.
2. **Favorites + scheduled crawl** — mark pages, crawl on a schedule, follow
   one-level same-domain links, store snapshots in IndexedDB.
3. **Semantic search + RAG** — query the local snapshot store, inject top-K chunks
   into chat context.
4. **MCP tool calling** — discover tools from configured local MCP servers, expose
   them to the model, stream tool calls and results.

## Candidate tracks (next, in no committed order)

Seed brainstorms exist in `docs/brainstorms/`. Run `/ce-brainstorm` against any of
them to turn the seed into a full requirements doc.

| Track | Seed | Why it matters |
|-------|------|----------------|
| Native messaging host for stdio MCP support | [native-messaging-host-seed](docs/brainstorms/native-messaging-host-seed.md) | Browsers can't spawn child processes, so stdio-only MCP servers are unreachable today. A native messaging host bridges this. |
| Storage quota management UI | [storage-quota-management-seed](docs/brainstorms/storage-quota-management-seed.md) | Snapshots can be ~50KB each; users currently have no visibility into or control over IndexedDB usage. |
| In-app MCP configuration documentation | [options-page-mcp-docs-seed](docs/brainstorms/options-page-mcp-docs-seed.md) | The Options page surfaces MCP server settings but does not explain the model or guide first-time setup. |
| Firefox port | [firefox-port-seed](docs/brainstorms/firefox-port-seed.md) | MV3 is partially Firefox-compatible but the side panel API is Chrome-only. Worth scoping. |

This list is intentionally not exhaustive. New brainstorm seeds can be added to
`docs/brainstorms/` at any time.

## Explicitly not doing (out of product identity)

Decisions that look like "easy wins" but would betray the core positioning:

- **No cloud inference fallback.** Even as an optional, opt-in feature. The promise
  is fully local; an off-by-default cloud option creates a path to drift.
- **No telemetry, analytics, or anonymized usage data.** Same reasoning.
- **No user accounts or maintained-by-Interra backend.** The product is a client
  that talks to local services. We do not operate servers.
- **No SPA rendering in the crawler.** Running headless Chromium or executing page
  JavaScript during crawl is expensive, fragile, and crosses a privacy threshold
  (the crawler would now execute arbitrary author code). Pages that need JS to
  render are not the right use case for this product.
- **No proprietary model APIs as defaults.** Defaults assume Ollama. Other local
  inference servers (vLLM, llama.cpp server, LM Studio) may be supported as
  configurable alternatives, but the product is not OpenAI-API-default.

If the product premise changes such that any of these should be reconsidered, it
should be an explicit STRATEGY.md edit, not a quiet feature flag.

## How decisions flow

For non-trivial work, run the Compound Engineering loop:

1. `/ce-brainstorm` against a seed (or a fresh idea) → `docs/brainstorms/<topic>-requirements.md`
2. `/ce-plan` from the requirements → `docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md`
3. `/ce-work` to execute → commits + PR

See [AGENTS.md](AGENTS.md) for the workflow conventions and [CLAUDE.md](CLAUDE.md)
for the deep architectural context that planning should be grounded in.
