import { useState } from "react"
import { getAllSnapshots } from "~/lib/storage/snapshots"
import { semanticSearch } from "~/lib/embeddings/similarity"
import type { ScoredChunk } from "~/lib/embeddings/similarity"

export function SearchPanel() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ScoredChunk[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    try {
      const snapshots = await getAllSnapshots()
      const hits = await semanticSearch(query, snapshots)
      setResults(hits)
      setSearched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed")
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-slate-200 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search your saved pages…"
            className="flex-1 text-sm border border-slate-300 rounded-md px-3 py-1.5
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-md
              hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {searching ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : "Search"}
          </button>
        </div>
        {searched && !error && (
          <p className="mt-1.5 text-[10px] text-slate-400">
            {results.length === 0 ? "No matching content found." : `${results.length} result${results.length === 1 ? "" : "s"}`}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {error && (
          <p className="text-xs text-red-500 bg-red-50 rounded-md px-3 py-2">{error}</p>
        )}

        {!searched && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6 pb-12">
            <svg className="w-8 h-8 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-xs text-slate-400">Search across your crawled pages using semantic similarity.</p>
          </div>
        )}

        {results.map((r, i) => {
          const domain = (() => { try { return new URL(r.url).hostname } catch { return r.url } })()
          return (
            <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-1.5 hover:border-indigo-200 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-indigo-600 truncate">{r.title || domain}</span>
                <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">
                  {Math.round(r.score * 100)}%
                </span>
              </div>
              <p className="text-[10px] text-slate-400">{domain}</p>
              <p className="text-xs text-slate-600 leading-relaxed">{r.chunk}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
