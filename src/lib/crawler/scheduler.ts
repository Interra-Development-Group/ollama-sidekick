import { getAllFavorites } from "~/lib/storage/favorites"
import { getSnapshot, saveSnapshot } from "~/lib/storage/snapshots"
import { createSnapshotFromHtml, fetchPageContent, checkLastModified, extractLinks, fetchRobotsTxt, isAllowedByRobots } from "./fetcher"
import { generateSnapshotEmbeddings } from "~/lib/embeddings/index"
import { chat } from "~/lib/ollama/client"
import { CHAT_MODEL } from "~/lib/ollama/models"
import { log, warn, error } from "~/lib/utils/logger"

const DEFAULT_INTERVAL_MINUTES = 1440  // once per day
const MAX_CHILD_LINKS = 10
export const ALARM_NAME = "ollama-crawler"

type StatusFn = (url: string, status: "running" | "done" | "error", message?: string) => void

// ─── Read user-configured interval from storage ───────────────────────────────

async function getCrawlIntervalMinutes(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.sync.get("crawlIntervalMinutes", (r) => {
      const stored = r.crawlIntervalMinutes as number | undefined
      resolve(stored != null && stored > 0 ? stored : DEFAULT_INTERVAL_MINUTES)
    })
  })
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export async function initCrawlSchedule(): Promise<void> {
  const intervalMinutes = await getCrawlIntervalMinutes()
  const alarms = await chrome.alarms.getAll()
  if (!alarms.find((a) => a.name === ALARM_NAME)) {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: intervalMinutes,
      delayInMinutes: 1
    })
  }
}

export async function handleCrawlAlarm(
  alarm: chrome.alarms.Alarm,
  onStatus?: StatusFn
): Promise<void> {
  if (alarm.name === ALARM_NAME) await runCrawl(onStatus)
}

// ─── Main crawl entry point ───────────────────────────────────────────────────

export async function runCrawl(onStatus?: StatusFn): Promise<void> {
  const allEntries = await getAllFavorites()
  const favorites = allEntries.filter((e) => e.crawl !== false)

  if (favorites.length === 0) {
    const reason = allEntries.length > 0 ? "All crawling disabled" : "Nothing to crawl"
    log(`[Crawler] No favorites to crawl (${reason})`)
    onStatus?.("No favorites", "done", reason)
    return
  }

  log(`[Crawler] Starting crawl: ${favorites.length} of ${allEntries.length} favorites`)
  onStatus?.(`Crawling ${favorites.length} pages`, "running")

  let saved = 0
  let failed = 0
  let skipped = 0

  for (const entry of favorites) {
    const url = entry.url
    try {
      // Check last-modified before downloading the full page
      const existing = await getSnapshot(url)
      if (existing) {
        const modified = await checkLastModified(url, existing.crawledAt)
        if (!modified) {
          log(`[Crawler] Skipping ${url} (not modified since last crawl)`)
          onStatus?.(url, "done", "not modified")
          skipped++
          continue
        }
      }

      onStatus?.(url, "running")
      log(`[Crawler] Fetching ${url}`)

      const html = await fetchPageContent(url)
      if (!html) {
        warn(`[Crawler] Failed to fetch ${url}`)
        onStatus?.(url, "error", "Failed to fetch")
        failed++
        continue
      }

      const snapshot = await createSnapshotFromHtml(url, html)
      log(`[Crawler] Parsed ${url}: ${snapshot.wordCount} words, ${snapshot.chunks.length} chunks`)

      if (snapshot.chunks.length === 0) {
        warn(`[Crawler] No content extracted from ${url}`)
        onStatus?.(url, "error", "No content found")
        failed++
        continue
      }

      const withEmbeddings = await generateSnapshotEmbeddings({ ...snapshot, depth: 0 })
      const hasEmbeddings = withEmbeddings.embeddings.length > 0
      log(`[Crawler] Embeddings for ${url}: ${hasEmbeddings ? withEmbeddings.embeddings.length : "NONE (will retry next crawl)"}`)

      await saveSnapshot(withEmbeddings)
      saved++
      onStatus?.(url, "done", `${withEmbeddings.wordCount} words${hasEmbeddings ? "" : " (no embeddings)"}`)

      const withSummary = await attachSummary(withEmbeddings)
      if (withSummary.summary) {
        await saveSnapshot(withSummary)
        log(`[Crawler] Summary saved for ${url}`)
      }

      // Depth-1: crawl same-origin links
      const links = extractLinks(html, url).slice(0, MAX_CHILD_LINKS)
      log(`[Crawler] Found ${links.length} child links on ${url}`)
      if (links.length === 0) continue

      const origin = new URL(url).origin
      const robotsTxt = await fetchRobotsTxt(origin)

      for (const childUrl of links) {
        const childPath = new URL(childUrl).pathname
        if (!isAllowedByRobots(robotsTxt, childPath)) {
          log(`[Crawler] Blocked by robots.txt: ${childUrl}`)
          continue
        }

        const childExisting = await getSnapshot(childUrl)
        if (childExisting && Date.now() - childExisting.crawledAt < 86_400_000) {
          log(`[Crawler] Skipping (fresh): ${childUrl}`)
          continue
        }

        try {
          onStatus?.(childUrl, "running")
          log(`[Crawler] Fetching child ${childUrl}`)
          const childHtml = await fetchPageContent(childUrl)
          if (!childHtml) { warn(`[Crawler] Failed to fetch child ${childUrl}`); continue }

          const childSnap = await createSnapshotFromHtml(childUrl, childHtml)
          log(`[Crawler] Child ${childUrl}: ${childSnap.wordCount} words, ${childSnap.chunks.length} chunks`)
          if (childSnap.chunks.length === 0) { warn(`[Crawler] No content for child ${childUrl}`); continue }

          const childWithEmbed = await generateSnapshotEmbeddings({ ...childSnap, depth: 1, parentUrl: url })
          await saveSnapshot(childWithEmbed)
          saved++
          onStatus?.(childUrl, "done", "discovered")

          const childWithSummary = await attachSummary(childWithEmbed)
          if (childWithSummary.summary) await saveSnapshot(childWithSummary)

          log(`[Crawler] Saved child ${childUrl}`)
        } catch (childErr) {
          error(`[Crawler] Error on child ${childUrl}:`, childErr)
        }
      }
    } catch (err) {
      error(`[Crawler] Error on ${url}:`, err)
      onStatus?.(url, "error", err instanceof Error ? err.message : "Unknown error")
      failed++
    }
  }

  const summary = [
    saved > 0 ? `${saved} saved` : null,
    skipped > 0 ? `${skipped} unchanged` : null,
    failed > 0 ? `${failed} failed` : null
  ].filter(Boolean).join(", ") || "nothing to do"
  log(`[Crawler] Complete: ${summary}`)
  onStatus?.("Done crawling", "done", summary)
}

// ─── Summary generation ───────────────────────────────────────────────────────

async function attachSummary(snapshot: import("~/types/page").PageSnapshot): Promise<import("~/types/page").PageSnapshot> {
  if (snapshot.summary) return snapshot
  if (snapshot.wordCount < 50) {
    return {
      ...snapshot,
      summary: `⚠ Limited content (${snapshot.wordCount} words) — this page likely requires JavaScript to render.`
    }
  }
  try {
    log(`[Crawler] Generating summary for ${snapshot.url}`)
    const response = await chat(CHAT_MODEL, [{
      role: "user",
      content: `In 2-3 sentences, summarize the key topic and information from this web page content. Be concise and factual.\n\n${snapshot.text.substring(0, 1500)}`
    }])
    log(`[Crawler] Summary generated for ${snapshot.url}`)
    return { ...snapshot, summary: response.content.trim() }
  } catch (err) {
    warn(`[Crawler] Summary failed for ${snapshot.url}:`, err)
    return snapshot
  }
}
