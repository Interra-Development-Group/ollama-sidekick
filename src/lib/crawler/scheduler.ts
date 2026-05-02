import { getFavorites } from "~/lib/storage/favorites"
import { getSnapshot, saveSnapshot } from "~/lib/storage/snapshots"
import { createSnapshotFromHtml, fetchPageContent, extractLinks, fetchRobotsTxt, isAllowedByRobots } from "./fetcher"
import { generateSnapshotEmbeddings } from "~/lib/embeddings/index"
import { chat } from "~/lib/ollama/client"
import { CHAT_MODEL } from "~/lib/ollama/models"
import { getEnv } from "~/lib/utils/env"

const CRAWL_INTERVAL_MINUTES = parseInt(getEnv("CRAWL_INTERVAL_MINUTES", "60"), 10)
const MAX_CHILD_LINKS = 10
const ALARM_NAME = "ollama-crawler"

type StatusFn = (url: string, status: "running" | "done" | "error", message?: string) => void

// ─── Schedule ─────────────────────────────────────────────────────────────────

export async function initCrawlSchedule(): Promise<void> {
  const alarms = await chrome.alarms.getAll()
  if (!alarms.find((a) => a.name === ALARM_NAME)) {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: CRAWL_INTERVAL_MINUTES,
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
  const favorites = await getFavorites()

  if (favorites.length === 0) {
    onStatus?.("No favorites", "done", "Nothing to crawl")
    return
  }

  onStatus?.(`Crawling ${favorites.length} pages`, "running")

  for (const url of favorites) {
    try {
      onStatus?.(url, "running")
      const html = await fetchPageContent(url)
      if (!html) { onStatus?.(url, "error", "Failed to fetch"); continue }

      const snapshot = await createSnapshotFromHtml(url, html)
      if (snapshot.chunks.length === 0) { onStatus?.(url, "error", "No content"); continue }

      const withEmbeddings = await generateSnapshotEmbeddings({ ...snapshot, depth: 0 })
      const withSummary = await attachSummary(withEmbeddings)
      await saveSnapshot(withSummary)

      onStatus?.(url, "done", `${withSummary.wordCount} words`)

      // ── Depth-1: crawl linked pages ────────────────────────────────────────
      const links = extractLinks(html, url).slice(0, MAX_CHILD_LINKS)
      if (links.length === 0) continue

      const origin = new URL(url).origin
      const robotsTxt = await fetchRobotsTxt(origin)

      for (const childUrl of links) {
        const childPath = new URL(childUrl).pathname
        if (!isAllowedByRobots(robotsTxt, childPath)) continue

        // Skip if already indexed and recent (< 24h)
        const existing = await getSnapshot(childUrl)
        if (existing && Date.now() - existing.crawledAt < 86_400_000) continue

        try {
          onStatus?.(childUrl, "running")
          const childHtml = await fetchPageContent(childUrl)
          if (!childHtml) continue

          const childSnap = await createSnapshotFromHtml(childUrl, childHtml)
          if (childSnap.chunks.length === 0) continue

          const childWithEmbed = await generateSnapshotEmbeddings({
            ...childSnap,
            depth: 1,
            parentUrl: url
          })
          const childWithSummary = await attachSummary(childWithEmbed)
          await saveSnapshot(childWithSummary)

          onStatus?.(childUrl, "done", `discovered`)
        } catch {
          // Non-fatal — continue with next child
        }
      }
    } catch (err) {
      onStatus?.(url, "error", err instanceof Error ? err.message : "Unknown error")
    }
  }

  onStatus?.("Done crawling", "done", "")
}

// ─── Summary generation ───────────────────────────────────────────────────────

async function attachSummary(snapshot: import("~/types/page").PageSnapshot): Promise<import("~/types/page").PageSnapshot> {
  if (snapshot.summary) return snapshot
  // Not enough content to summarize — likely a SPA or asset page
  if (snapshot.wordCount < 50) {
    return { ...snapshot, summary: `⚠ Limited content extracted (${snapshot.wordCount} words). This page may be a single-page app that requires JavaScript to render.` }
  }
  try {
    const response = await chat(CHAT_MODEL, [
      {
        role: "user",
        content: `In 2-3 sentences, summarize the key topic and information from this web page content. Be concise and factual.\n\n${snapshot.text.substring(0, 1500)}`
      }
    ])
    return { ...snapshot, summary: response.content.trim() }
  } catch {
    return snapshot
  }
}
