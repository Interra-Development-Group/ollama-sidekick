# CLAUDE.md — LocalMind by Interra Chrome Extension

## Project Overview

**LocalMind by Interra** is a Chrome Extension (Manifest V3) that provides a persistent side panel
for AI-assisted browsing. It connects to a locally-running Ollama instance for LLM inference
and local embeddings, communicates with local MCP servers over SSE transport, extracts and
understands content from the current browser tab, and runs a scheduled background crawler that
keeps a semantic snapshot of pages the user marks as favorites.

The goal is a privacy-first, fully local AI browsing assistant — no cloud inference, no data
leaving the machine — distributed via the Chrome Web Store.

---

## Tech Stack

| Layer              | Technology                        | Notes                                             |
|--------------------|-----------------------------------|---------------------------------------------------|
| Extension Framework| Plasmo (MV3)                      | Abstracts manifest, HMR, Web Store build pipeline |
| UI                 | React 18 + TypeScript             | Side panel, popup, options page                   |
| Styling            | Tailwind CSS                      | Via Plasmo's built-in Tailwind support            |
| State              | Zustand                           | Works cleanly in extension context                |
| Local Storage      | IndexedDB via `idb`               | Page snapshots, embeddings (10MB limit on chrome.storage) |
| MCP Transport      | SSE over HTTP                     | Only viable transport in browser context (no stdio) |
| LLM + Embeddings   | Ollama REST API (:11434)          | `llama3`, `nomic-embed-text` default models       |
| Scheduling         | Chrome Alarms API                 | Survives service worker sleep cycles              |
| Build / Packaging  | Plasmo CLI → Web Store zip        |                                                   |

---

## Repository Layout

```
ollama-sidekick/
├── CLAUDE.md                        ← You are here
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── .env.development                 ← Local dev overrides (never commit secrets)
├── .env.production
│
├── assets/
│   └── icon.png                    ← 512x512 extension icon
│
├── public/
│   └── sidepanel.html              ← Plasmo copies this automatically
│
└── src/
    ├── background/
    │   └── index.ts                ← Service worker entry point
    │
    ├── contents/
    │   └── extractor.ts            ← Content script injected into every tab
    │
    ├── sidepanel/
    │   └── index.tsx               ← Side panel React root
    │
    ├── components/
    │   ├── ChatPanel.tsx           ← Main chat interface
    │   ├── MessageBubble.tsx       ← Individual chat message
    │   ├── PageContext.tsx         ← Shows current page summary
    │   ├── FavoritesPanel.tsx      ← Manage crawled favorites
    │   ├── ToolCallCard.tsx        ← Renders MCP tool invocations
    │   ├── ModelSelector.tsx       ← Ollama model picker
    │   └── StatusBar.tsx           ← Ollama / MCP server connection status
    │
    ├── hooks/
    │   ├── useOllama.ts            ← Chat + streaming hook
    │   ├── useMCP.ts               ← Tool discovery + invocation hook
    │   ├── usePageContent.ts       ← Requests content from active tab
    │   └── useFavorites.ts         ← CRUD for favorites list
    │
    ├── lib/
    │   ├── ollama/
    │   │   ├── client.ts           ← Typed Ollama REST client
    │   │   └── models.ts           ← Model config constants
    │   │
    │   ├── mcp/
    │   │   ├── client.ts           ← SSE-based MCP client
    │   │   ├── registry.ts         ← Known local MCP server registry
    │   │   └── types.ts            ← MCP protocol types
    │   │
    │   ├── crawler/
    │   │   ├── scheduler.ts        ← Chrome Alarms integration
    │   │   └── fetcher.ts          ← Fetch + parse page snapshots
    │   │
    │   ├── embeddings/
    │   │   ├── index.ts            ← Embedding generation via Ollama
    │   │   └── similarity.ts       ← Cosine similarity + brute-force search
    │   │
    │   └── storage/
    │       ├── db.ts               ← IndexedDB schema + idb setup
    │       ├── snapshots.ts        ← Page snapshot CRUD
    │       └── favorites.ts        ← Favorites list persistence
    │
    ├── types/
    │   ├── messages.ts             ← Chrome runtime message contracts
    │   ├── page.ts                 ← PageContent, PageSnapshot types
    │   └── chat.ts                 ← ChatMessage, Conversation types
    │
    └── utils/
        ├── textChunker.ts          ← Split long text for token budgets
        └── domParser.ts            ← Extract readable text from raw HTML
```

---

## Architecture — How the Pieces Connect

### Message Passing (Critical to Understand)

Chrome extensions have three isolated JavaScript contexts that can only communicate via
`chrome.runtime.sendMessage` / `chrome.runtime.onMessage` or the `chrome.tabs.sendMessage`
variant for content scripts.

```
Side Panel (React)
    │
    │  chrome.runtime.sendMessage({ type: "CHAT", ... })
    ▼
Background Service Worker          ←→  Ollama REST API (localhost:11434)
    │                              ←→  MCP SSE Server (localhost:3000+)
    │  chrome.tabs.sendMessage({ type: "GET_PAGE_CONTENT" })
    ▼
Content Script (extractor.ts)
    │  responds with { url, title, text, selection }
    ▼
Background Service Worker
    │  replies to Side Panel with streaming tokens
    ▼
Side Panel (React)
```

**All message types are defined in `src/types/messages.ts`** as a discriminated union.
Never use raw string literals for message types anywhere else in the codebase.

### Service Worker Lifecycle (MV3 Gotcha)

MV3 service workers are **not persistent** — Chrome will kill them after ~30 seconds of
inactivity. This means:

- **Do not store state in module-level variables** in `background/index.ts`. State will be
  lost when the worker restarts. Use `chrome.storage.session` for ephemeral runtime state
  or `chrome.storage.local` / IndexedDB for anything that must survive.
- The `chrome.alarms` API **will** wake a sleeping service worker when an alarm fires.
  The crawler scheduler relies on this.
- SSE connections (to MCP servers) will be dropped when the worker sleeps. Re-establish
  them lazily on the next message that needs them. Do not assume a persistent SSE stream.
- When sending a response asynchronously from `onMessage`, you **must** `return true` from
  the listener to keep the message channel open.

### Ollama Integration

Base URL: `http://localhost:11434` (configurable via options page → stored in `chrome.storage.sync`)

Key endpoints used:

| Endpoint                     | Purpose                                 |
|------------------------------|-----------------------------------------|
| `GET  /api/tags`             | Health check + list available models    |
| `POST /api/chat`             | Multi-turn chat (streaming)             |
| `POST /api/generate`         | Single-turn generation                  |
| `POST /api/embeddings`       | Generate embedding vectors              |

Streaming chat uses `stream: true` and parses newline-delimited JSON from the response body.
The `useOllama` hook handles this with a `ReadableStream` reader and forwards tokens to the
UI via a Zustand store update.

**CORS requirement**: Ollama blocks cross-origin requests by default. Users must start Ollama
with the extension's origin allowed:

```bash
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
```

Document this prominently in the README and onboarding UI. The `StatusBar` component should
detect the CORS error specifically (vs. Ollama not running) and show the exact env var to set.

### MCP Integration (SSE Transport)

Browser extensions cannot use stdio transport — only HTTP/SSE. Local MCP servers must expose
an HTTP interface. The `MCPClient` in `src/lib/mcp/client.ts` implements:

- `listTools()` → `GET /tools` — returns JSON array of tool schemas
- `callTool(name, args)` → `POST /tools/:name` — returns result JSON
- `streamTool(name, args, onChunk)` → `GET /tools/:name/stream` — SSE stream

**MCP Server Registry** (`src/lib/mcp/registry.ts`): Stores a list of configured local MCP
server URLs in `chrome.storage.local`. The options page lets users add/remove servers. On
startup (and after each alarm wake), the background worker pings each registered server's
`/tools` endpoint to build a unified tool catalog.

**Tool calling flow in chat**:
1. User sends a message
2. Background worker sends message + available tool schemas to Ollama
3. Ollama responds with a `tool_calls` array (if it decides to use a tool)
4. Background worker executes each tool call via the appropriate MCP client
5. Tool results are injected back into the conversation as `tool` role messages
6. Ollama generates a final response
7. All steps stream tokens to the side panel in real time

This requires a model that supports tool/function calling. Default: `llama3.1` or `qwen2.5`.
Do not assume `llama3` (base) supports this — it may not reliably.

### Page Content Extraction

The content script (`src/contents/extractor.ts`) is injected into every page Plasmo matches
(configured as `<all_urls>` in the content script declaration).

Extraction priority order:
1. `article` element
2. `main` or `[role="main"]`
3. `.content`, `#content`, `#main`
4. `document.body` (fallback)

Text is truncated to **6,000 characters** before sending to the background worker to stay
within reasonable token budgets. The background worker may further chunk this for embedding.

User text selection is captured and passed separately — if a selection exists, it is used
as the primary context for the chat message, with the full page text as secondary context.

### Favorites + Crawler

**Favorites** are URLs stored in `chrome.storage.local` as a simple string array. The
`FavoritesPanel` component lets users add the current page, remove entries, and see last-crawl
timestamps.

**Crawler scheduler** uses `chrome.alarms.create` with `periodInMinutes: 60`. The alarm
wakes the service worker, which iterates the favorites list and for each URL:

1. `fetch(url)` — plain HTTP GET, no auth, no cookies (this is a background worker fetch,
   not a tab navigation, so the user's session cookies are **not** sent — by design)
2. Parse HTML with the `domParser` utility (DOMParser is available in service workers in
   Chrome 119+; use a fallback regex stripper if not available)
3. Chunk the text and generate embeddings via Ollama `nomic-embed-text`
4. Store the snapshot in IndexedDB via `src/lib/storage/snapshots.ts`

**Embedding storage schema** (IndexedDB, `snapshots` object store):

```typescript
interface PageSnapshot {
  id: string;          // url (primary key)
  url: string;
  title: string;
  text: string;        // full extracted text
  chunks: string[];    // chunked text segments
  embeddings: number[][];  // one embedding vector per chunk
  crawledAt: number;   // Date.now()
  wordCount: number;
}
```

**Semantic search** at query time:
1. Embed the user's query with `nomic-embed-text`
2. Load all snapshots from IndexedDB
3. Compute cosine similarity between query embedding and each chunk embedding
4. Return top-K chunks above a threshold (default: 0.75 similarity, top 5 chunks)
5. Inject these chunks into the Ollama chat context as a `system` message prefix

---

## Environment Variables

Plasmo uses `.env` files with a `PLASMO_PUBLIC_` prefix for values accessible in extension
code (they are inlined at build time — do not put secrets here).

```bash
# .env.development
PLASMO_PUBLIC_OLLAMA_BASE_URL=http://localhost:11434
PLASMO_PUBLIC_MCP_DEFAULT_PORT=3000
PLASMO_PUBLIC_EMBED_MODEL=nomic-embed-text
PLASMO_PUBLIC_CHAT_MODEL=llama3.1
PLASMO_PUBLIC_CRAWL_INTERVAL_MINUTES=60
PLASMO_PUBLIC_PAGE_TEXT_MAX_CHARS=6000
PLASMO_PUBLIC_CHUNK_SIZE=500
PLASMO_PUBLIC_CHUNK_OVERLAP=50
PLASMO_PUBLIC_MAX_CONTEXT_CHUNKS=5
PLASMO_PUBLIC_SIMILARITY_THRESHOLD=0.75
```

All of these have runtime overrides via the options page, stored in `chrome.storage.sync`,
which takes precedence over the compiled defaults.

---

## Key Implementation Patterns

### Typed Message Passing

All background ↔ side panel ↔ content script communication must use the discriminated union
in `src/types/messages.ts`. Never add a raw `{ type: "SOME_STRING" }` elsewhere.

```typescript
// src/types/messages.ts
export type ExtensionMessage =
  | { type: "GET_PAGE_CONTENT" }
  | { type: "PAGE_CONTENT_RESPONSE"; payload: PageContent }
  | { type: "CHAT"; payload: ChatRequest }
  | { type: "CHAT_TOKEN"; payload: { token: string; done: boolean } }
  | { type: "CHAT_ERROR"; payload: { message: string } }
  | { type: "CALL_MCP_TOOL"; payload: { server: string; tool: string; args: unknown } }
  | { type: "MCP_TOOL_RESULT"; payload: { result: unknown } }
  | { type: "GET_FAVORITES" }
  | { type: "FAVORITES_RESPONSE"; payload: string[] }
  | { type: "ADD_FAVORITE"; payload: { url: string } }
  | { type: "REMOVE_FAVORITE"; payload: { url: string } }
  | { type: "CRAWL_NOW" }
  | { type: "CRAWL_STATUS"; payload: { url: string; status: "running" | "done" | "error" } }
  | { type: "SEARCH_SNAPSHOTS"; payload: { query: string } }
  | { type: "SNAPSHOT_RESULTS"; payload: { chunks: ScoredChunk[] } };
```

### Streaming Tokens to the UI

The background worker cannot push to the side panel unprompted in MV3. Instead:
- Side panel opens a **long-lived port** via `chrome.runtime.connect({ name: "chat" })`
- Background worker posts token messages to this port
- Port is torn down when the response is complete

This is more reliable than `sendMessage` for streaming because ports don't have the 1-response
limit and don't require `return true` gymnastics.

```typescript
// background/index.ts
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "chat") return;
  port.onMessage.addListener(async (msg: ExtensionMessage) => {
    if (msg.type !== "CHAT") return;
    // stream tokens back via port.postMessage
    for await (const token of streamOllamaChat(msg.payload)) {
      port.postMessage({ type: "CHAT_TOKEN", payload: token });
    }
  });
});
```

### Error Handling Strategy

Every async operation in the background worker must be wrapped in try/catch. Errors are
posted back to the side panel via the port as `CHAT_ERROR` messages. The UI renders these
inline in the chat as a dismissible error card — never a raw browser alert.

Specific error cases to handle explicitly:
- Ollama not running → `TypeError: Failed to fetch` on localhost:11434
- Ollama CORS rejection → Response status 403 or CORS error in fetch
- Ollama model not found → 404 on `/api/chat` with model name
- MCP server unreachable → connection refused on configured port
- IndexedDB quota exceeded → catch `DOMException` with name `QuotaExceededError`
- Content script not injected (chrome:// pages, Web Store, PDF) → `chrome.tabs.sendMessage`
  will throw; catch it and show "Cannot access this page" in the UI

---

## Chrome Web Store Requirements

### Permissions Justification (Reviewer-Facing)

The `host_permissions` and `permissions` arrays must be minimal and justifiable. Current set:

```json
{
  "permissions": [
    "sidePanel",
    "storage",
    "alarms",
    "tabs",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "http://localhost/*",
    "https://localhost/*",
    "<all_urls>"
  ]
}
```

- `sidePanel` — core feature: persistent side panel UI
- `storage` — favorites, user settings, session state
- `alarms` — scheduled crawling of favorited pages
- `tabs` + `activeTab` — read current tab URL and title for context
- `scripting` — inject content script to extract page text
- `http://localhost/*` — Ollama API + local MCP servers
- `<all_urls>` — content script must run on any page the user visits (required for page
  extraction feature); justify this explicitly in the Store listing

### Privacy Policy Requirements

A privacy policy URL is **required** for Store listing. It must state:
- All data (chat history, page snapshots, embeddings) is stored locally in IndexedDB
- No user data is transmitted to any remote server
- Ollama inference runs locally on the user's machine
- The crawler only fetches URLs the user explicitly marks as favorites
- No analytics, tracking, or telemetry of any kind

### Single-Purpose Description

The Store listing must have a clear single-purpose description. Do not bury the "local AI"
angle — reviewers will test the extension and expect it to work without cloud connectivity.

---

## Local Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Start Ollama with extension CORS enabled
OLLAMA_ORIGINS="chrome-extension://*" ollama serve

# 3. Pull required models
ollama pull llama3.1
ollama pull nomic-embed-text

# 4. Start an MCP server (optional, for tool calling)
# e.g. your VibrantFrogMCP server with SSE transport enabled
python mcp_server.py --transport sse --port 3000

# 5. Start Plasmo dev server
npm run dev

# 6. Load extension in Chrome
# → chrome://extensions → Developer mode → Load unpacked → select build/chrome-mv3-dev
```

After loading, the extension ID will appear in `chrome://extensions`. Copy it and set:
```bash
OLLAMA_ORIGINS="chrome-extension://YOUR_EXTENSION_ID_HERE" ollama serve
```
Using the specific ID (rather than `*`) is more secure and required for production.

---

## Build + Release

```bash
# Production build
npm run build

# Package for Web Store submission
npm run package
# → produces build/chrome-mv3-prod.zip
```

Pre-submission checklist:
- [ ] All `console.log` debug statements removed or gated behind `process.env.NODE_ENV`
- [ ] `.env.production` values reviewed (no localhost assumptions in prod defaults shown to users)
- [ ] Privacy policy URL live and accessible
- [ ] Extension icon is 128x128 PNG (Store) + 512x512 PNG (Store listing hero)
- [ ] Screenshots prepared: 1280x800 or 640x400, showing side panel in use
- [ ] `manifest.json` version bumped
- [ ] Tested on a clean Chrome profile with no other extensions
- [ ] Tested with Ollama not running (graceful error state)
- [ ] Tested on `chrome://` pages (extension should not crash, show "cannot access this page")
- [ ] Tested on Chrome Web Store pages (content script blocked — handle gracefully)

---

## Adding a New MCP Server

1. In the options page UI, user enters the server's base URL (e.g. `http://localhost:3001`)
2. Extension calls `GET /tools` on that URL to validate and fetch the tool schema
3. URL is saved to `chrome.storage.local` under `mcpServers` array
4. Background worker includes all registered servers' tools in the next Ollama chat system prompt
5. When Ollama returns a `tool_calls` block, background worker routes the call to the correct
   server based on which server's tool schema declared that tool name

---

## Adding a New Feature

1. **Define message types** in `src/types/messages.ts` first
2. **Implement logic** in the appropriate `src/lib/` module
3. **Wire background handler** in `src/background/index.ts`
4. **Add hook** in `src/hooks/` for the React side
5. **Build UI component** in `src/components/`
6. **Compose** into the side panel in `src/sidepanel/index.tsx`

Keep business logic in `src/lib/`, keep React components in `src/components/`, keep
Chrome API calls in `src/background/` and hooks. Components should not call
`chrome.runtime.sendMessage` directly — always go through a hook.

---

## Known Limitations and Future Work

- **No stdio MCP transport**: Browser extensions cannot spawn child processes. All MCP
  servers must expose HTTP/SSE. A companion native host (chrome.runtime.connectNative) 
  could bridge this in a future version but adds installation friction.
- **Service worker sleep**: Long Ollama generations may be interrupted if Chrome kills the
  worker. The port-based streaming helps detect this. Future: investigate `chrome.offscreen`
  documents as a persistent execution context.
- **Crawler auth**: The background fetcher does not send session cookies, so pages behind
  login walls will not crawl correctly. This is intentional for privacy but is a limitation.
- **Embedding model size**: `nomic-embed-text` is ~274MB. First-run setup requires pulling
  this model. The onboarding flow should check for it and prompt the user.
- **IndexedDB size**: Snapshots with embeddings can be large (~50KB per page). Consider
  adding a storage quota display in the settings page and a "clear all snapshots" action.
