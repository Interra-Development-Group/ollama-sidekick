// ─── Status Bar Component ─────────────────────────────────────────────────────

import { useEffect, useState } from "react"

interface Status {
  ollama: "connected" | "disconnected" | "cors_error" | "not_found"
  ollamaModels: string[]
  mcpServers: { url: string; status: "connected" | "disconnected" }[]
}

export function StatusBar() {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  async function checkStatus() {
    try {
      const result = await new Promise<Status>((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "GET_HEALTH" }, (response) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
          else resolve(response as Status)
        })
      })
      setStatus(result)
    } catch { /* keep previous */ }
  }

  const dotColor = status == null
    ? "bg-slate-400"
    : status.ollama === "connected"
    ? "bg-emerald-400"
    : status.ollama === "cors_error"
    ? "bg-amber-400"
    : "bg-red-400"

  const label = status == null
    ? "Checking…"
    : status.ollama === "connected"
    ? "Ollama connected"
    : status.ollama === "cors_error"
    ? "CORS error — restart Ollama with OLLAMA_ORIGINS set"
    : "Ollama not running"

  const connectedMcp = status?.mcpServers.filter((s) => s.status === "connected").length ?? 0

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-t border-slate-700 shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span className="text-[11px] text-slate-400 flex-1 truncate">{label}</span>
      {connectedMcp > 0 && (
        <span className="text-[10px] text-indigo-400 shrink-0">
          {connectedMcp} MCP
        </span>
      )}
      {status?.ollama === "cors_error" && (
        <a
          href="https://github.com/ollama/ollama/blob/main/docs/faq.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-amber-400 hover:text-amber-300 shrink-0"
        >
          Fix →
        </a>
      )}
    </div>
  )
}
