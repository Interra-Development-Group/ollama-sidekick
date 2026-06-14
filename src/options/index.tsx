// ─── Options Page ─────────────────────────────────────────────────────────────

import "~/style.css"
import { useState, useEffect } from "react"
import { getAllSnapshots, clearAllSnapshots } from "~/lib/storage/snapshots"
import { ALARM_NAME } from "~/lib/crawler/scheduler"

const DEFAULT_OLLAMA_URL = "http://localhost:11434"
const INTERVAL_OPTIONS = [
  { label: "Once a day", value: 1440 },
  { label: "Every 12 hours", value: 720 },
  { label: "Every 6 hours", value: 360 },
  { label: "Manual only", value: 0 },
]

interface MCPConfig {
  url: string
  status: "idle" | "connecting" | "connected" | "error"
}

interface StorageInfo {
  snapshotCount: number
  searchableCount: number
  usageBytes: number
  quotaBytes: number
}

// ─── CORS hint with live extension ID ────────────────────────────────────────

function CorsHint() {
  const id = chrome.runtime.id
  const [copied, setCopied] = useState(false)

  const cmd = `OLLAMA_ORIGINS="chrome-extension://${id}" ollama serve`

  function copyCmd() {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-500">
        Ollama must be started with your extension's origin allowed.
        During development use <code className="bg-slate-100 px-1 rounded text-[11px]">chrome-extension://*</code>.
        Once published to the Chrome Web Store, use the specific ID below (it becomes permanent for all users).
      </p>
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        <code className="flex-1 text-[11px] text-slate-700 font-mono break-all">{cmd}</code>
        <button
          onClick={copyCmd}
          className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 transition-colors font-medium"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="text-[10px] text-slate-400">
        Extension ID: <span className="font-mono">{id}</span>
        {" · "}This ID is unique to your local install. The Web Store ID is permanent.
      </p>
    </div>
  )
}

export default function OptionsPage() {
  // ── Ollama URL ──────────────────────────────────────────────────────────────
  const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_OLLAMA_URL)
  const [urlSaved, setUrlSaved] = useState(false)
  const [urlStatus, setUrlStatus] = useState<"idle" | "testing" | "ok" | "cors" | "error">("idle")

  // ── Crawl interval ──────────────────────────────────────────────────────────
  const [crawlInterval, setCrawlInterval] = useState(1440)
  const [nextCrawl, setNextCrawl] = useState<string | null>(null)

  // ── Storage ─────────────────────────────────────────────────────────────────
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [clearing, setClearing] = useState(false)
  const [clearStatus, setClearStatus] = useState<string | null>(null)

  // ── MCP servers ─────────────────────────────────────────────────────────────
  const [mcpServers, setMcpServers] = useState<MCPConfig[]>([])
  const [newServerUrl, setNewServerUrl] = useState("")
  const [mcpStatus, setMcpStatus] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
    loadStorageInfo()
    loadMcpServers()
    loadNextCrawl()
  }, [])

  async function loadSettings() {
    chrome.storage.sync.get(["ollamaBaseUrl", "crawlIntervalMinutes"], (r) => {
      if (r.ollamaBaseUrl) setOllamaUrl(r.ollamaBaseUrl as string)
      if (r.crawlIntervalMinutes != null) setCrawlInterval(r.crawlIntervalMinutes as number)
    })
  }

  async function loadStorageInfo() {
    try {
      const [snapshots, estimate] = await Promise.all([
        getAllSnapshots(),
        navigator.storage.estimate()
      ])
      setStorageInfo({
        snapshotCount: snapshots.length,
        searchableCount: snapshots.filter((s) => s.embeddings.length > 0).length,
        usageBytes: estimate.usage ?? 0,
        quotaBytes: estimate.quota ?? 0
      })
    } catch {
      // ignore
    }
  }

  async function loadNextCrawl() {
    try {
      const alarm = await chrome.alarms.get(ALARM_NAME)
      if (alarm) {
        const ms = alarm.scheduledTime - Date.now()
        if (ms > 0) {
          const h = Math.floor(ms / 3_600_000)
          const m = Math.floor((ms % 3_600_000) / 60_000)
          setNextCrawl(h > 0 ? `${h}h ${m}m` : `${m}m`)
        }
      } else {
        setNextCrawl(null)
      }
    } catch {
      setNextCrawl(null)
    }
  }

  async function loadMcpServers() {
    try {
      const servers = await new Promise<string[]>((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "LIST_MCP_SERVERS" }, (response) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
          else resolve(response?.payload?.servers ?? [])
        })
      })
      setMcpServers(servers.map((url) => ({ url, status: "idle" })))
    } catch {
      setMcpServers([])
    }
  }

  // ── Ollama URL ──────────────────────────────────────────────────────────────

  async function saveOllamaUrl() {
    chrome.storage.sync.set({ ollamaBaseUrl: ollamaUrl })
    setUrlSaved(true)
    setTimeout(() => setUrlSaved(false), 2000)
  }

  async function testOllamaUrl() {
    setUrlStatus("testing")
    try {
      const res = await fetch(`${ollamaUrl}/api/tags`, { method: "HEAD" })
      if (res.status === 403) setUrlStatus("cors")
      else setUrlStatus(res.ok ? "ok" : "error")
    } catch {
      setUrlStatus("error")
    }
    setTimeout(() => setUrlStatus("idle"), 3000)
  }

  // ── Crawl interval ──────────────────────────────────────────────────────────

  async function saveCrawlInterval(minutes: number) {
    setCrawlInterval(minutes)
    chrome.storage.sync.set({ crawlIntervalMinutes: minutes })

    // Recreate the alarm with the new interval
    await chrome.alarms.clear(ALARM_NAME)
    if (minutes > 0) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: minutes, delayInMinutes: 1 })
    }
    loadNextCrawl()
  }

  // ── Storage ─────────────────────────────────────────────────────────────────

  async function handleClearSnapshots() {
    if (!confirm("Delete all crawled pages and embeddings? This cannot be undone.")) return
    setClearing(true)
    try {
      await clearAllSnapshots()
      setClearStatus("All snapshots cleared.")
      await loadStorageInfo()
    } catch {
      setClearStatus("Failed to clear snapshots.")
    } finally {
      setClearing(false)
      setTimeout(() => setClearStatus(null), 3000)
    }
  }

  // ── MCP ─────────────────────────────────────────────────────────────────────

  async function addMcpServer(e: React.FormEvent) {
    e.preventDefault()
    const url = newServerUrl.trim().replace(/\/$/, "")
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setMcpStatus("URL must start with http:// or https://")
      setTimeout(() => setMcpStatus(null), 3000)
      return
    }
    if (mcpServers.some((s) => s.url === url)) {
      setMcpStatus("Already added")
      setTimeout(() => setMcpStatus(null), 3000)
      return
    }

    setMcpServers((prev) => [...prev, { url, status: "connecting" }])
    setNewServerUrl("")

    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      chrome.runtime.sendMessage({ type: "ADD_MCP_SERVER", payload: { url } }, (r) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message })
        } else if (r?.error) {
          resolve({ ok: false, error: r.error })
        } else {
          resolve({ ok: true })
        }
      })
    })

    setMcpServers((prev) =>
      prev.map((s) => s.url === url ? { ...s, status: result.ok ? "connected" : "error" } : s)
    )
    if (!result.ok) setMcpServers((prev) => prev.filter((s) => s.url !== url))
    setMcpStatus(result.ok ? `Connected to ${url}` : (result.error ?? `Could not connect to ${url}`))
    setTimeout(() => setMcpStatus(null), 5000)
  }

  async function removeMcpServer(url: string) {
    await new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ type: "REMOVE_MCP_SERVER", payload: { url } }, () => resolve())
    })
    setMcpServers((prev) => prev.filter((s) => s.url !== url))
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1_048_576).toFixed(1)} MB`
  }

  const usagePct = storageInfo && storageInfo.quotaBytes > 0
    ? Math.round((storageInfo.usageBytes / storageInfo.quotaBytes) * 100)
    : 0

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <h1 className="text-xl font-bold text-slate-900">LocalMind by Interra — Settings</h1>

      {/* ── Ollama Connection ─────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Ollama Connection</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            onClick={testOllamaUrl}
            disabled={urlStatus === "testing"}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {urlStatus === "testing" ? "Testing…" : urlStatus === "ok" ? "✓ Connected" : urlStatus === "cors" ? "✗ CORS error" : urlStatus === "error" ? "✗ Not reachable" : "Test"}
          </button>
          <button
            onClick={saveOllamaUrl}
            className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {urlSaved ? "Saved ✓" : "Save"}
          </button>
        </div>
        <CorsHint />
      </section>

      {/* ── Crawl Schedule ────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Crawl Schedule</h2>
        <div className="flex flex-wrap gap-2">
          {INTERVAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => saveCrawlInterval(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                crawlInterval === opt.value
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          {crawlInterval === 0
            ? "Auto-crawl disabled — use the Crawl button in the side panel."
            : nextCrawl
              ? `Next crawl in ${nextCrawl}.`
              : "No alarm scheduled — reload the extension to apply."}
        </p>
      </section>

      {/* ── Storage ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Storage</h2>
        {storageInfo ? (
          <>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>{storageInfo.snapshotCount} pages indexed ({storageInfo.searchableCount} searchable)</span>
              <span className="text-slate-400">{formatBytes(storageInfo.usageBytes)} / {formatBytes(storageInfo.quotaBytes)}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${usagePct > 80 ? "bg-red-500" : usagePct > 50 ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(usagePct, 100)}%` }}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClearSnapshots}
                disabled={clearing || storageInfo.snapshotCount === 0}
                className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {clearing ? "Clearing…" : "Clear all snapshots"}
              </button>
              {clearStatus && <span className="text-xs text-slate-500">{clearStatus}</span>}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">Loading storage info…</p>
        )}
      </section>

      {/* ── MCP Servers ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">MCP Servers</h2>
        <form onSubmit={addMcpServer} className="flex gap-2">
          <input
            type="text"
            value={newServerUrl}
            onChange={(e) => setNewServerUrl(e.target.value)}
            placeholder="http://localhost:3000"
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!newServerUrl.trim()}
            className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </form>

        {mcpServers.length > 0 && (
          <ul className="space-y-1.5">
            {mcpServers.map((server) => (
              <li key={server.url} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  server.status === "connected" ? "bg-emerald-500"
                  : server.status === "error" ? "bg-red-500"
                  : server.status === "connecting" ? "bg-amber-400 animate-pulse"
                  : "bg-slate-300"
                }`} />
                <span className="flex-1 text-sm text-slate-700 truncate">{server.url}</span>
                <button
                  onClick={() => removeMcpServer(server.url)}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors shrink-0"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {mcpServers.length === 0 && (
          <p className="text-sm text-slate-400">No MCP servers configured. MCP servers enable tool calling during chat.</p>
        )}

        {mcpStatus && (
          <p className={`text-xs ${mcpStatus.startsWith("Connected") ? "text-emerald-600" : "text-red-500"}`}>
            {mcpStatus}
          </p>
        )}

        <p className="text-xs text-slate-400">
          Local MCP servers must expose an HTTP/SSE interface. See the{" "}
          <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer" className="underline">
            MCP documentation
          </a>{" "}
          for setup instructions.
        </p>
      </section>

      {/* ── About ─────────────────────────────────────────────── */}
      <section className="space-y-5 border-t border-slate-200 pt-8">

        {/* Extension blurb */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">🦙</span>
            <h2 className="text-base font-bold text-slate-900">LocalMind by Interra</h2>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            A Chrome extension that connects your browser to a local Ollama instance — giving you a
            private AI assistant, a personal web index, and a chat interface that never touches a cloud.
          </p>
          <ul className="space-y-1 text-sm text-slate-500">
            {[
              ["Local inference", "Routes requests directly to your running Ollama instance. No API keys. No subscriptions."],
              ["Personal web index", "Crawl and search the pages that matter to you — privately, on your own machine."],
              ["Zero data egress", "Your conversations, your index, your models. Nothing leaves."],
            ].map(([label, desc]) => (
              <li key={label} className="flex gap-2">
                <span className="text-indigo-400 shrink-0">·</span>
                <span><span className="font-medium text-slate-700">{label}</span> — {desc}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Built by */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Built by</p>
          <p className="text-sm font-semibold text-slate-800">Tony Piazza</p>
          <p className="text-sm text-slate-600 leading-relaxed">
            Software architect with over 30 years of experience. LocalMind by Interra
            grew out of work building local-first AI tooling and MCP integrations — a practical tool
            for anyone who wants powerful AI assistance without surrendering their data to the cloud.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            {[
              { label: "LinkedIn", href: "https://www.linkedin.com/in/tony-piazza-a3034b5/" },
              { label: "frogteam.ai", href: "https://frogteam.ai" },
              { label: "spiderink.net", href: "https://spiderink.net" },
              { label: "Etsy shop", href: "https://www.etsy.com/shop/VibrantHangs" },
              { label: "Instagram", href: "https://www.instagram.com/reddoverises/" },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
              >
                {label} ↗
              </a>
            ))}
          </div>
        </div>

        {/* Apps */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Other apps</p>
          <div className="space-y-2">
            {[
              {
                name: "Vibrant Frog Collab",
                tagline: "AI writing assistant — a collaborator, not a ghost writer",
                href: "https://apps.apple.com/us/app/vibrant-frog-collab/id6756248063",
              },
              {
                name: "SimpleKeysVoice",
                tagline: "Communication helper for people with difficulty speaking · iPad",
                href: "https://apps.apple.com/us/app/simplekeysvoice/id6761789259",
              },
              {
                name: "Tomorrow Box",
                tagline: "Worried tonight? Record it and deal with it tomorrow",
                href: "https://apps.apple.com/us/app/tomorrow-box/id6757824258",
              },
            ].map(({ name, tagline, href }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-200
                  hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 group-hover:text-indigo-700 transition-colors">
                    {name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{tagline}</p>
                </div>
                <span className="text-slate-300 group-hover:text-indigo-400 shrink-0 text-sm transition-colors">↗</span>
              </a>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center pb-2">
          LocalMind by Interra is built for people who believe your AI assistant should work for you —
          not report back to someone else.
        </p>
      </section>
    </div>
  )
}
