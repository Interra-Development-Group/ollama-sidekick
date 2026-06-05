// ─── Page Context Component ───────────────────────────────────────────────────

import { useState } from "react"

interface PageContextProps {
  content: { url: string; title: string; text: string; selection: string } | null
  onRefresh: () => void
}

export function PageContext({ content, onRefresh }: PageContextProps) {
  const [expanded, setExpanded] = useState(false)

  const domain = content?.url
    ? (() => { try { return new URL(content.url).hostname } catch { return content.url } })()
    : null

  return (
    <div className="border-b border-slate-200 shrink-0">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-xs">
        <span className="text-slate-400 shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </span>

        {content ? (
          <>
            <span className="text-slate-700 font-medium truncate flex-1" title={content.title}>
              {content.title || domain}
            </span>
            <span className="text-slate-400 shrink-0 hidden sm:block truncate max-w-[100px]" title={content.url}>
              {domain}
            </span>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-slate-400 hover:text-slate-600 shrink-0 transition-colors"
              title={expanded ? "Collapse" : "Preview page text"}
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </>
        ) : (
          <span className="text-slate-400 flex-1">No page loaded</span>
        )}

        <button
          onClick={onRefresh}
          className="text-indigo-500 hover:text-indigo-700 shrink-0 transition-colors"
          title="Refresh page content"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {expanded && content && (
        <div className="px-3 py-2 bg-white border-t border-slate-100 max-h-28 overflow-y-auto">
          {content.selection ? (
            <p className="text-xs text-slate-600 italic leading-relaxed">
              Selected: &ldquo;{content.selection.substring(0, 400)}&rdquo;
            </p>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed">
              {content.text.substring(0, 500)}{content.text.length > 500 ? "…" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
