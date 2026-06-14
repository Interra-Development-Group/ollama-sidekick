---
layout: default
title: Privacy Policy
permalink: /privacy/
---

# Privacy Policy

**Effective date:** 2026-06-04
**Last updated:** 2026-06-13
**Publisher:** Interra Development Group, LLC
**Product:** LocalMind by Interra (Chrome Extension)

This policy explains what data LocalMind by Interra handles, where it lives, and what we
do (and don't do) with it. The short version: nothing you do in this extension
leaves your machine.

---

## What we collect and transmit

**Nothing.** LocalMind by Interra is a fully local extension. We do not operate any
servers, do not run analytics, and do not transmit any personal data, browsing
activity, chat history, page content, embeddings, or telemetry off your machine.

We have no ability to see what you chat about, what pages you favorite, or how you
use the extension.

---

## What is stored locally

All of the following is stored on your machine, in your browser's local storage and
IndexedDB. It never leaves your machine unless **you** copy it elsewhere.

| Data | Where | Purpose |
|------|-------|---------|
| Chat history | Browser session / IndexedDB | Display conversation continuity within the side panel |
| List of favorited URLs | `chrome.storage.local` | Drives the periodic crawler |
| Crawled page text and titles | IndexedDB | Powers the Knowledge tab and semantic search |
| Embedding vectors | IndexedDB | Powers semantic search |
| Extension settings | `chrome.storage.sync` (if signed into Chrome sync) or `chrome.storage.local` | Remember your preferred chat model, Ollama URL, schedule, etc. |

If you have Chrome sync enabled, your **settings** (chat model preference,
configured MCP server URLs, crawl schedule) may sync across your own signed-in
Chrome instances through Google's sync infrastructure, the same as any other
extension setting. Chat history and crawled page data are **not** synced — they stay
on the device where they were created.

To erase all stored data, uninstall the extension via `chrome://extensions`, or use
the "Clear all snapshots" / "Clear chat" actions inside the extension's UI.

---

## Inference

The AI models that power chat and embeddings run on your machine via
[Ollama](https://ollama.com), which you install and run separately. The extension
communicates with Ollama over your local network (`http://localhost:11434` by
default).

We do not operate the Ollama service, do not see queries you send to it, and have
no relationship with Ollama, Inc.

---

## Page content extraction

When the side panel is open, the extension reads the visible text of the active tab
to provide page-aware chat. This happens entirely in your browser. Page text is
included as context in the prompts sent to your **local** Ollama instance and is
also stored in IndexedDB for favorited pages (see "What is stored locally"). It is
never transmitted to us.

The extension's content script runs on `<all_urls>` because the user can ask
questions about any page they visit. The script does not exfiltrate page contents
anywhere; it only sends the extracted text to the extension's background worker on
the same machine in response to user actions (opening the side panel, asking a
question, refreshing context).

---

## Crawler

You can mark pages as **favorites**. The extension runs a periodic background
crawler (default: once per hour while the browser is running) that fetches each
favorited URL via plain HTTP. The crawler:

- Only fetches URLs you have explicitly favorited
- May follow one level of same-domain links from each favorite for related-page
  discovery
- Does **not** send your browser cookies, authentication headers, or session
  state — pages requiring login will not crawl correctly (by design, for privacy)
- Does not transmit any of the fetched content off your machine — fetched text and
  embeddings stay in your local IndexedDB

You can change the crawl schedule, disable auto-crawl, or remove favorites at any
time in the extension's Settings.

---

## MCP servers

If you configure local Model Context Protocol (MCP) servers in the extension's
options page, the AI may invoke their tools during chat. These calls go directly
from the extension's background worker to whichever local server URL you
configured — typically `localhost`. We do not see these calls or their responses.

The privacy practices of any MCP server you configure are governed by that server,
not by this extension.

---

## Permissions and what they're used for

The extension requests the following Chrome permissions. Each is used only for the
purpose listed:

| Permission | Why we need it |
|------------|----------------|
| `sidePanel` | Render the side panel UI |
| `storage` | Save settings, favorites, and snapshots locally |
| `alarms` | Wake the service worker on a schedule to run the crawler |
| `tabs`, `activeTab` | Read the active tab's URL and title to associate page context with chat |
| `<all_urls>` host permission | The content script must be able to run on any page you visit, since you can chat about any page |
| `http://localhost/*`, `https://localhost/*` host permissions | Connect to your local Ollama instance and local MCP servers |

We do not request any permission for the purpose of tracking, analytics, advertising,
or data collection.

---

## Third parties

We do not embed third-party analytics, advertising, fingerprinting, or telemetry
SDKs. We do not share any user data with third parties, because we do not collect
any user data to share.

The extension communicates with:
- Your local Ollama installation (on your machine)
- Local MCP servers you've configured (on your machine)
- The websites you ask it to crawl (only for URLs you've favorited)

That's it.

---

## Children

This extension does not target children and does not knowingly collect data from
anyone, regardless of age.

---

## Changes to this policy

If this policy changes, the updated version will replace this page at the same URL
and the "Last updated" date will reflect the change. Material changes will also be
called out in the extension's release notes.

---

## Contact

Questions or concerns about this policy:

- Open an issue on
  [the GitHub repository](https://github.com/Interra-Development-Group/localmind/issues)
- For sensitive matters, contact a maintainer privately via the contact information
  listed on the
  [Interra Development Group GitHub organization page](https://github.com/Interra-Development-Group)
