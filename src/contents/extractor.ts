// ─── Content Extractor (Content Script) ───────────────────────────────────────
// Injected into every page to extract content and send to background

import { domParser } from "~/utils/domParser"
import { PAGE_TEXT_MAX_CHARS } from "~/lib/ollama/models"

// ─── Extract content from current page ────────────────────────────────────────

export async function extractPageContent(): Promise<{
  url: string
  title: string
  text: string
  selection: string
}> {
  // Check if we're on a restricted page
  const url = location.href
  if (domParser.isRestrictedPage(url)) {
    throw new Error("Cannot access this page type")
  }

  // Get selected text
  const selection = window.getSelection()?.toString() ?? ""

  // Extract text from document
  let text = domParser.extractTextFromDocument(document)

  // Truncate if needed
  if (text.length > PAGE_TEXT_MAX_CHARS) {
    text = text.substring(0, PAGE_TEXT_MAX_CHARS)
  }

  // Get title
  const title = document.title || new URL(url).hostname

  return { url, title, text, selection }
}

// ─── Listen for messages from background ──────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_PAGE_CONTENT") {
    try {
      const content = extractPageContent()
      content.then(sendResponse).catch((err) => {
        sendResponse({ error: err.message })
      })
      return true // Keep channel open for async response
    } catch (err) {
      sendResponse({ error: err instanceof Error ? err.message : "Unknown error" })
      return true
    }
  }

  return false // No response
})

// ─── Signal ready to background ───────────────────────────────────────────────

chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" }).catch(() => {
  // Ignore errors - tab may be closed
})
