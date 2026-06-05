// ─── Favorites Panel Component ────────────────────────────────────────────────

import { useState, useEffect } from "react"
import type { FavoriteEntry } from "~/types/messages"
import { ALARM_NAME } from "~/lib/crawler/scheduler"

interface FavoritesPanelProps {
  favorites: FavoriteEntry[]
  onAdd: (url: string, title: string) => Promise<void>
  onRemove: (url: string) => Promise<void>
  onToggleCrawl: (url: string, crawl: boolean) => Promise<void>
  onCrawl: () => void
  isCrawling: boolean
  currentPage: { url: string; title: string; text: string; selection: string } | null
}

export function FavoritesPanel({
  favorites,
  onAdd,
  onRemove,
  onToggleCrawl,
  onCrawl,
  isCrawling,
  currentPage
}: FavoritesPanelProps) {
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [nextCrawl, setNextCrawl] = useState<string | null>(null)

  useEffect(() => {
    chrome.alarms.get(ALARM_NAME).then((alarm) => {
      if (!alarm) { setNextCrawl(null); return }
      const ms = alarm.scheduledTime - Date.now()
      if (ms <= 0) { setNextCrawl(null); return }
      const h = Math.floor(ms / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      setNextCrawl(h > 0 ? `${h}h ${m}m` : `${m}m`)
    }).catch(() => setNextCrawl(null))
  }, [])

  useEffect(() => {
    if (status) {
      const t = setTimeout(() => setStatus(null), 2000)
      return () => clearTimeout(t)
    }
  }, [status])

  const handleAddCurrentPage = async () => {
    if (!currentPage?.url) {
      setStatus({ type: "error", message: "No page loaded — click Refresh" })
      return
    }
    if (favorites.some((f) => f.url === currentPage.url)) {
      setStatus({ type: "error", message: "Already in favorites" })
      return
    }
    setAdding(true)
    try {
      await onAdd(currentPage.url, currentPage.title || currentPage.url)
      setStatus({ type: "success", message: "Added to favorites" })
    } catch {
      setStatus({ type: "error", message: "Failed to add" })
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (url: string) => {
    try {
      await onRemove(url)
    } catch {
      setStatus({ type: "error", message: "Failed to remove" })
    }
  }

  const isCurrentPageSaved = currentPage ? favorites.some((f) => f.url === currentPage.url) : false
  const crawlCount = favorites.filter((f) => f.crawl !== false).length

  return (
    <div className="bg-white border-b border-slate-200 shrink-0">
      {/* Add current page */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100">
        <div className="flex-1 min-w-0">
          {currentPage ? (
            <p className="text-xs text-slate-500 truncate" title={currentPage.url}>
              {(() => { try { return new URL(currentPage.url).hostname } catch { return currentPage.url } })()}
            </p>
          ) : (
            <p className="text-xs text-slate-400">No page loaded</p>
          )}
        </div>
        <button
          onClick={handleAddCurrentPage}
          disabled={adding || isCurrentPageSaved || !currentPage}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
            bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300"
        >
          {isCurrentPageSaved ? (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {adding ? "Adding…" : "Save page"}
            </>
          )}
        </button>
      </div>

      {/* Favorites list */}
      {favorites.length > 0 ? (
        <ul className="max-h-36 overflow-y-auto divide-y divide-slate-50">
          {favorites.map((entry) => {
            const label = (() => { try { return new URL(entry.url).hostname } catch { return entry.url } })()
            const crawlEnabled = entry.crawl !== false
            return (
              <li key={entry.url} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 group">
                {/* Crawl toggle dot */}
                <button
                  onClick={() => onToggleCrawl(entry.url, !crawlEnabled)}
                  title={crawlEnabled ? "Auto-crawl on — click to disable" : "Auto-crawl off — click to enable"}
                  className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors border ${
                    crawlEnabled
                      ? "bg-emerald-400 border-emerald-500 hover:bg-emerald-300"
                      : "bg-slate-200 border-slate-300 hover:bg-slate-300"
                  }`}
                />
                <button
                  onClick={() => chrome.tabs.create({ url: entry.url })}
                  className="flex-1 text-xs text-indigo-600 hover:text-indigo-800 hover:underline truncate text-left transition-colors"
                  title={entry.url}
                >
                  {label}
                </button>
                <button
                  onClick={() => handleRemove(entry.url)}
                  className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  title="Remove"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-3 py-2 text-xs text-slate-400">
          No saved pages yet. Save pages to crawl them for semantic search.
        </p>
      )}

      {/* Crawl button + status */}
      <div className="px-3 py-2 flex items-center gap-2 border-t border-slate-100">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          {favorites.length > 0 && crawlCount < favorites.length && (
            <span className="text-[10px] text-slate-400">
              {crawlCount === 0 ? "All disabled" : `${crawlCount} of ${favorites.length} auto-crawl`}
            </span>
          )}
          {nextCrawl && crawlCount > 0 && (
            <span className="text-[10px] text-slate-400">Next auto-crawl in {nextCrawl}</span>
          )}
          {status && (
            <span className={`text-xs ${status.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
              {status.message}
            </span>
          )}
        </div>
        <button
          onClick={onCrawl}
          disabled={favorites.length === 0 || isCrawling}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md
            bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg className={`w-3 h-3 ${isCrawling ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isCrawling ? "Crawling…" : "Crawl all"}
        </button>
      </div>  {/* crawl button row */}
    </div>
  )
}
