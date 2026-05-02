// ─── DOM Parser Utilities ─────────────────────────────────────────────────────
// Extracts readable text from HTML.
// DOMParser / Document APIs are not available in MV3 service workers, so all
// methods that run in the background use regex-based extraction instead.

const MAX_CHARS = parseInt(process.env.PLASMO_PUBLIC_PAGE_TEXT_MAX_CHARS ?? "6000", 10)

// ─── Regex-based extraction (service worker safe) ─────────────────────────────

function extractTextRegex(html: string): string {
  let text = html
  // Drop entire script / style blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "")
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "")
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, " ")
  // Decode common entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&[a-z]+;/gi, " ")
  return cleanText(text)
}

function extractTitleRegex(html: string): string | null {
  // <title> tag
  const title = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)
  if (title?.[1]?.trim()) return title[1].trim()
  // og:title meta (two attribute orderings)
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,200})["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']{1,200})["'][^>]+property=["']og:title["']/i)
  if (og?.[1]?.trim()) return og[1].trim()
  // First <h1>
  const h1 = html.match(/<h1[^>]*>([^<]{1,200})<\/h1>/i)
  if (h1?.[1]?.trim()) return h1[1].trim()
  return null
}

function cleanText(text: string): string {
  text = text.replace(/\t/g, " ")
  text = text.replace(/[ \t]{2,}/g, " ")
  text = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 1)
    .join("\n")
  text = text.replace(/\n{3,}/g, "\n\n")
  return text.trim().substring(0, MAX_CHARS)
}

// ─── DOM-based extraction (content script / side panel only) ─────────────────

function extractTextFromDocument(doc: Document): string {
  // Prefer article/main over body
  const source =
    doc.querySelector("article") ||
    doc.querySelector("main") ||
    doc.querySelector('[role="main"]') ||
    doc.body ||
    doc.documentElement

  // Clone so we never mutate the live document
  const root = source.cloneNode(true) as HTMLElement
  root.querySelectorAll("script, style, noscript").forEach((el) => el.remove())

  return cleanText(root.innerText ?? root.textContent ?? "")
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const domParser = {
  /** Extract text from raw HTML. Safe to call from a service worker. */
  extractText(html: string): string {
    if (typeof DOMParser !== "undefined") {
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, "text/html")
        return extractTextFromDocument(doc)
      } catch { /* fall through */ }
    }
    return extractTextRegex(html)
  },

  /** Extract title from raw HTML. Safe to call from a service worker. */
  extractTitle(html: string): string | null {
    if (typeof DOMParser !== "undefined") {
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, "text/html")
        return (
          doc.querySelector("title")?.textContent?.trim() ||
          doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
          doc.querySelector("h1")?.textContent?.trim() ||
          null
        )
      } catch { /* fall through */ }
    }
    return extractTitleRegex(html)
  },

  /** Extract text from a live Document (content script use only). */
  extractTextFromDocument(doc: Document): string {
    return extractTextFromDocument(doc)
  },

  isRestrictedPage(url: string): boolean {
    return ["chrome://", "chrome-extension://", "about:", "blob:", "data:", "file://"].some(
      (p) => url.startsWith(p)
    )
  }
}
