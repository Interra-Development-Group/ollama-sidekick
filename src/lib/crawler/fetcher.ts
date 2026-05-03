// ─── Page Fetcher and Parser ──────────────────────────────────────────────────
// Fetches HTML pages and extracts text content

import { domParser } from "~/utils/domParser"
import { textChunker } from "~/utils/textChunker"
import { PAGE_TEXT_MAX_CHARS } from "~/lib/ollama/models"
import { warn, error } from "~/lib/utils/logger"
import type { PageSnapshot } from "~/types/page"

// ─── Fetch page content ───────────────────────────────────────────────────────

export async function fetchPageContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Ollama-Sidekick-Crawler/1.0",
        "Accept": "text/html,application/xhtml+xml"
      }
    })

    if (!res.ok) {
      warn(`[Fetcher] Failed to fetch ${url}: ${res.status}`)
      return null
    }

    return await res.text()
  } catch (err) {
    error(`[Fetcher] Error fetching ${url}:`, err)
    return null
  }
}

// ─── Check if page has been modified since a given timestamp ──────────────────
// Returns true (fetch needed) or false (skip — not modified).
// Fails open: returns true on any error so we re-crawl rather than miss updates.

export async function checkLastModified(url: string, since: number): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "Ollama-Sidekick-Crawler/1.0",
        "If-Modified-Since": new Date(since).toUTCString()
      }
    })

    if (res.status === 304) return false

    const lastModifiedHeader = res.headers.get("Last-Modified")
    if (lastModifiedHeader) {
      const lastModifiedMs = new Date(lastModifiedHeader).getTime()
      if (!isNaN(lastModifiedMs) && lastModifiedMs <= since) return false
    }

    return true
  } catch {
    return true  // assume modified — fail open
  }
}

// ─── Parse HTML and create snapshot ───────────────────────────────────────────

export async function createSnapshotFromHtml(
  url: string,
  html: string
): Promise<PageSnapshot> {
  // Extract text from HTML
  const text = domParser.extractText(html)

  // Truncate if too long
  const truncatedText =
    text.length > PAGE_TEXT_MAX_CHARS
      ? text.substring(0, PAGE_TEXT_MAX_CHARS)
      : text

  // Get title from document
  const title = domParser.extractTitle(html) || new URL(url).hostname

  // Chunk the text
  const chunks = textChunker.chunk(truncatedText, {
    size: parseInt(process.env.PLASMO_PUBLIC_CHUNK_SIZE ?? "500", 10),
    overlap: parseInt(process.env.PLASMO_PUBLIC_CHUNK_OVERLAP ?? "50", 10)
  })

  // Count words (simple approximation)
  const wordCount = truncatedText.trim().split(/\s+/).length

  return {
    id: url,
    url,
    title,
    text: truncatedText,
    chunks,
    embeddings: [],
    crawledAt: Date.now(),
    wordCount
  }
}

// ─── Parse HTML directly (for content script) ────────────────────────────────

export function parsePageFromDocument(doc: Document): {
  url: string
  title: string
  text: string
} {
  const text = domParser.extractTextFromDocument(doc)
  const title = doc.title || new URL(location.href).hostname

  return {
    url: location.href,
    title,
    text
  }
}

// ─── Link extraction ──────────────────────────────────────────────────────────

// Extensions that are definitely not HTML pages
const ASSET_EXT = /\.(json|png|jpg|jpeg|gif|svg|ico|css|js|jsx|ts|tsx|woff|woff2|ttf|eot|pdf|zip|xml|txt|mp4|mp3|webm|webp|avif)(\?|#|$)/i

export function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl)
  const seen = new Set<string>()
  const links: string[] = []

  // Only match <a href="..."> — not <link>, <script>, <img>, etc.
  const regex = /<a\s[^>]*\bhref=["']([^"']+)["'][^>]*>/gi
  let match

  while ((match = regex.exec(html)) !== null) {
    const raw = match[1].trim()
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue
    try {
      const resolved = new URL(raw, baseUrl)
      if (resolved.origin !== base.origin) continue
      if (!["http:", "https:"].includes(resolved.protocol)) continue
      if (ASSET_EXT.test(resolved.pathname)) continue
      resolved.hash = ""
      const normalized = resolved.toString()
      if (!seen.has(normalized) && normalized !== baseUrl) {
        seen.add(normalized)
        links.push(normalized)
      }
    } catch {
      // Invalid URL — skip
    }
  }

  return links
}

// ─── robots.txt ───────────────────────────────────────────────────────────────

export async function fetchRobotsTxt(origin: string): Promise<string> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": "Ollama-Sidekick-Crawler/1.0" }
    })
    return res.ok ? await res.text() : ""
  } catch {
    return ""
  }
}

export function isAllowedByRobots(robotsTxt: string, path: string): boolean {
  if (!robotsTxt) return true

  const lines = robotsTxt.split(/\r?\n/)
  let inBlock = false

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue

    const [key, ...rest] = line.split(":")
    const value = rest.join(":").trim()

    if (key.toLowerCase() === "user-agent") {
      inBlock = value === "*"
      continue
    }

    if (inBlock && key.toLowerCase() === "disallow" && value) {
      if (path.startsWith(value)) return false
    }
  }

  return true
}
