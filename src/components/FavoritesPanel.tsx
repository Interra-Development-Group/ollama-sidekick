// ─── Favorites Panel Component ────────────────────────────────────────────────

import { useState, useEffect } from "react"

interface FavoritesPanelProps {
  favorites: string[]
  onAdd: (url: string, title: string) => Promise<void>
  onRemove: (url: string) => Promise<void>
  onCrawl: () => void
  isCrawling: boolean
  currentPage: { url: string; title: string; text: string; selection: string } | null
}

export function FavoritesPanel({ favorites, onAdd, onRemove, onCrawl, isCrawling, currentPage }: FavoritesPanelProps) {
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [adding, setAdding] = useState(false)

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
    if (favorites.includes(currentPage.url)) {
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

  const isCurrentPageSaved = currentPage ? favorites.includes(currentPage.url) : false

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
        <ul className="max-h-32 overflow-y-auto divide-y divide-slate-50">
          {favorites.map((url) => {
            const label = (() => { try { return new URL(url).hostname } catch { return url } })()
            return (
              <li key={url} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 group">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                <button
                  onClick={() => chrome.tabs.create({ url })}
                  className="flex-1 text-xs text-indigo-600 hover:text-indigo-800 hover:underline truncate text-left transition-colors"
                  title={url}
                >
                  {label}
                </button>
                <button
                  onClick={() => handleRemove(url)}
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
        {status && (
          <span className={`text-xs ${status.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
            {status.message}
          </span>
        )}
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
      </div>
    </div>
  )
}
