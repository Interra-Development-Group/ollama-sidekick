// ─── Tool Call Card Component ─────────────────────────────────────────────────
// Displays tool invocations and results

import { useState } from "react"

interface ToolCallCardProps {
  toolName: string
  args: unknown
  result?: unknown
  error?: string
  onRetry?: () => void
}

export function ToolCallCard({
  toolName,
  args,
  result,
  error,
  onRetry
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)

  const hasArgs = Boolean(args && typeof args === "object" && Object.keys(args as object).length > 0)
  const hasResult = result !== null && result !== undefined && typeof result === "object"

  return (
    <div className="my-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      {/* Tool header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 bg-amber-500 rounded-full" />
        <span className="font-medium text-amber-800 text-sm">Tool Call: {toolName}</span>
      </div>

      {/* Args */}
      {hasArgs && (
        <div className="mb-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-amber-700 hover:underline"
          >
            {expanded ? "Hide arguments" : "Show arguments"}
          </button>
          {expanded && (
            <pre className="mt-2 p-2 bg-amber-100 rounded text-xs text-amber-900 overflow-x-auto">
              {JSON.stringify(args, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Result or Error */}
      {error ? (
        <div className="text-sm text-red-700 bg-red-100 p-2 rounded">
          <div className="flex items-center gap-2 mb-1">
            <span>❌</span>
            <span className="font-medium">Error</span>
          </div>
          <p className="text-sm">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
            >
              Retry
            </button>
          )}
        </div>
      ) : hasResult ? (
        <div className="text-sm">
          <div className="flex items-center gap-2 mb-1">
            <span>✅</span>
            <span className="font-medium text-amber-800">Result</span>
          </div>
          <pre className="p-2 bg-amber-100 rounded text-xs text-amber-900 overflow-x-auto">
            {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="text-sm text-amber-700 italic">No result returned</div>
      )}
    </div>
  )
}
