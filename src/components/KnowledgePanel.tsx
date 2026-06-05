import { useState, useEffect, useRef } from "react"
import { getAllSnapshots } from "~/lib/storage/snapshots"
import type { PageSnapshot } from "~/types/page"

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function host(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

function shortPath(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname === "/" ? u.hostname : u.pathname
  } catch { return url }
}

function openTab(url: string) {
  chrome.tabs.create({ url })
}

// Pull the single most interesting excerpt from a snapshot
function keyExcerpt(snap: PageSnapshot): string {
  const source = snap.summary || snap.chunks[0] || snap.text
  const trimmed = source.trim()
  return trimmed.length > 180 ? trimmed.substring(0, 180).trimEnd() + "…" : trimmed
}

export function KnowledgePanel() {
  const [roots, setRoots] = useState<PageSnapshot[]>([])
  const [childrenMap, setChildrenMap] = useState<Record<string, PageSnapshot[]>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const all = await getAllSnapshots()
      all.sort((a, b) => b.crawledAt - a.crawledAt)

      const rootSnaps = all.filter((s) => (s.depth ?? 0) === 0)
      const discovered = all.filter((s) => (s.depth ?? 0) === 1)

      const byParent: Record<string, PageSnapshot[]> = {}
      for (const snap of discovered) {
        if (!snap.parentUrl) continue
        if (!byParent[snap.parentUrl]) byParent[snap.parentUrl] = []
        byParent[snap.parentUrl].push(snap)
      }

      setRoots(rootSnaps)
      setChildrenMap(byParent)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const scrollTo = (id: string) => {
    const el = sectionRefs.current[id]
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
    // Also expand it
    setExpanded((prev) => new Set([...prev, id]))
  }

  const totalDiscovered = Object.values(childrenMap).flat().length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <svg className="w-5 h-5 animate-spin text-slate-300" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    )
  }

  if (roots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6 pb-12">
        <svg className="w-8 h-8 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <p className="text-sm text-slate-500">No pages indexed yet.</p>
        <p className="text-xs text-slate-400">Save pages to Favorites and hit "Crawl all" to build your knowledge base.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Sticky TOC ──────────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Table of Contents
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-400">
              {roots.length} saved · {totalDiscovered} discovered
            </span>
            <button onClick={load} className="text-[10px] text-indigo-600 hover:text-indigo-800 transition-colors">
              Refresh
            </button>
          </div>
        </div>
        <ol className="px-3 py-1.5 space-y-0.5">
          {roots.map((root, i) => {
            const childCount = (childrenMap[root.url] ?? []).length
            return (
              <li key={root.id}>
                <button
                  onClick={() => scrollTo(root.id)}
                  className="w-full text-left flex items-center gap-1.5 group py-0.5"
                >
                  <span className="text-[10px] text-slate-400 shrink-0 w-4">{i + 1}.</span>
                  <span className="text-xs text-indigo-600 hover:text-indigo-800 group-hover:underline truncate transition-colors">
                    {root.title || host(root.url)}
                  </span>
                  {childCount > 0 && (
                    <span className="shrink-0 text-[10px] text-slate-400">
                      +{childCount}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {/* ── Detail sections ─────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {roots.map((root, i) => {
          const children = childrenMap[root.url] ?? []
          const isOpen = expanded.has(root.id)

          return (
            <div
              key={root.id}
              ref={(el) => { sectionRefs.current[root.id] = el }}
              className="scroll-mt-2"
            >
              {/* Root header */}
              <div className="px-3 pt-3 pb-2">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] text-slate-400 shrink-0">{i + 1}.</span>
                    <h3 className="text-xs font-semibold text-slate-800 truncate">
                      {root.title || host(root.url)}
                    </h3>
                  </div>
                  <button
                    onClick={() => openTab(root.url)}
                    title="Open in new tab"
                    className="shrink-0 p-0.5 text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] text-indigo-500">{host(root.url)}</span>
                  <span className="text-[10px] text-slate-300">·</span>
                  <span className="text-[10px] text-slate-400">{root.wordCount.toLocaleString()} words</span>
                  <span className="text-[10px] text-slate-300">·</span>
                  <span className="text-[10px] text-slate-400">{timeAgo(root.crawledAt)}</span>
                </div>

                {root.summary ? (
                  <p className="text-xs text-slate-600 leading-relaxed">{root.summary}</p>
                ) : (
                  <p className="text-xs text-slate-400 italic">No summary yet — crawl to generate one.</p>
                )}

                {/* Discovered pages toggle */}
                {children.length > 0 && (
                  <button
                    onClick={() => toggle(root.id)}
                    className="mt-2 flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <svg
                      className={`w-2.5 h-2.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {children.length} page{children.length !== 1 ? "s" : ""} discovered and indexed
                  </button>
                )}
              </div>

              {/* Discovered children */}
              {isOpen && children.length > 0 && (
                <div className="mx-3 mb-3 rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100 bg-white">
                  {children.map((child) => (
                    <DiscoveredEntry key={child.id} snap={child} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DiscoveredEntry({ snap }: { snap: PageSnapshot }) {
  const [open, setOpen] = useState(false)
  const excerpt = keyExcerpt(snap)

  return (
    <div className="px-3 py-2">
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <button
          onClick={() => setOpen(!open)}
          className="flex-1 text-left min-w-0"
        >
          <span className="text-xs font-medium text-slate-700 hover:text-indigo-600 transition-colors truncate block">
            {snap.title || shortPath(snap.url)}
          </span>
        </button>
        <button
          onClick={() => openTab(snap.url)}
          title="Open in new tab"
          className="shrink-0 p-0.5 text-slate-300 hover:text-indigo-600 transition-colors"
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-slate-400">{shortPath(snap.url)}</span>
        <span className="text-[10px] text-slate-300">·</span>
        <span className="text-[10px] text-slate-400">{snap.wordCount.toLocaleString()} words</span>
        <span className="text-[10px] text-slate-300">·</span>
        <span className="text-[10px] text-slate-400">{timeAgo(snap.crawledAt)}</span>
      </div>

      {/* Key excerpt — always visible */}
      <div className="pl-2 border-l-2 border-amber-300">
        <p className="text-[10px] text-slate-500 leading-relaxed">{excerpt}</p>
      </div>

      {/* Expanded: full summary */}
      {open && snap.summary && snap.summary !== excerpt && (
        <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{snap.summary}</p>
      )}

      {snap.summary && (
        <button
          onClick={() => setOpen(!open)}
          className="mt-1 text-[10px] text-indigo-500 hover:text-indigo-700 transition-colors"
        >
          {open ? "Show less" : "Full summary →"}
        </button>
      )}
    </div>
  )
}
