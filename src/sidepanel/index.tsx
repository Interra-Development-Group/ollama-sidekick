// ─── Side Panel Entry Point ───────────────────────────────────────────────────

import "~/style.css"
import { useState, useEffect, useCallback, useRef } from "react"
import { ChatPanel } from "~/components/ChatPanel"
import { ModelSelector } from "~/components/ModelSelector"
import { FavoritesPanel } from "~/components/FavoritesPanel"
import { PageContext } from "~/components/PageContext"
import { SearchPanel } from "~/components/SearchPanel"
import { KnowledgePanel } from "~/components/KnowledgePanel"
import { SetupGuide } from "~/components/SetupGuide"
import { useOllama } from "~/hooks/useOllama"
import { usePageContent } from "~/hooks/usePageContent"
import { useFavorites } from "~/hooks/useFavorites"
import { useMCP } from "~/hooks/useMCP"
import { StatusBar } from "~/components/StatusBar"

type Tab = "chat" | "search" | "knowledge"

export default function App() {
  const [pageContext, setPageContext] = useState<{ url: string; title: string; text: string; selection: string } | null>(null)
  const [showFavorites, setShowFavorites] = useState(false)
  const [crawlStatus, setCrawlStatus] = useState<{ text: string; type: "running" | "done" | "error" } | null>(null)
  const [isCrawling, setIsCrawling] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>("chat")
  const crawlPortRef = useRef<chrome.runtime.Port | null>(null)

  const { state: mcpState } = useMCP()
  const { state: ollamaState, send, clear, setModel, availableModels, modelAutoChanged, recheckHealth } = useOllama(mcpState.tools)
  const { content: pageContent, refresh: refreshPage } = usePageContent()
  const { state: favoritesState, addFavorite, removeFavorite, toggleCrawl } = useFavorites()

  // Auto-fetch page content on mount and tab changes
  useEffect(() => {
    refreshPage()
    const onActivated = () => refreshPage()
    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onActivated)
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onActivated)
    }
  }, [])

  useEffect(() => {
    if (pageContent) setPageContext(pageContent)
  }, [pageContent])

  // Auto-dismiss "done" status after 4s
  useEffect(() => {
    if (crawlStatus?.type === "done") {
      const t = setTimeout(() => setCrawlStatus(null), 4000)
      return () => clearTimeout(t)
    }
  }, [crawlStatus])

  const handleCrawl = useCallback(() => {
    if (isCrawling) return
    setIsCrawling(true)
    setCrawlStatus({ text: "Starting crawl…", type: "running" })

    // Use a port so we get CRAWL_STATUS callbacks from the background
    const port = chrome.runtime.connect({ name: "sidekick" })
    crawlPortRef.current = port

    port.onMessage.addListener((msg: any) => {
      if (msg.type !== "CRAWL_STATUS") return
      const { url, status, message } = msg.payload

      if (status === "done" && url.startsWith("Done")) {
        setCrawlStatus({ text: message ? `Crawl done — ${message}` : "Crawl complete", type: "done" })
        setIsCrawling(false)
        port.disconnect()
        crawlPortRef.current = null
      } else if (status === "running") {
        const label = (() => { try { return new URL(url).hostname } catch { return url } })()
        setCrawlStatus({ text: `Crawling ${label}…`, type: "running" })
      } else if (status === "error") {
        // Per-URL error — show it but keep crawling; the scheduler continues the loop
        const label = (() => { try { return new URL(url).hostname } catch { return url } })()
        setCrawlStatus({ text: `⚠ ${label}: ${message || "failed"}`, type: "error" })
      }
    })

    port.onDisconnect.addListener(() => {
      setIsCrawling(false)
      crawlPortRef.current = null
    })

    port.postMessage({ type: "CRAWL_NOW" })
  }, [isCrawling])

  const tabs: { id: Tab; label: string }[] = [
    { id: "chat", label: "Chat" },
    { id: "search", label: "Search" },
    { id: "knowledge", label: "Knowledge" },
  ]

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="bg-slate-900 px-3 py-2.5 flex items-center gap-2.5 shrink-0">
        <span className="text-xl leading-none select-none">🦙</span>
        <span className="text-white font-semibold text-sm tracking-tight flex-1">
          Ollama Sidekick
        </span>
        <ModelSelector
          availableModels={availableModels}
          selectedModel={ollamaState.model}
          onSelect={setModel}
          modelAutoChanged={modelAutoChanged}
        />
      </header>

      {/* ── Tab bar ────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200 bg-white shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 -mb-px
              ${activeTab === tab.id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Chat-only chrome ───────────────────────────────── */}
      {activeTab === "chat" && (
        <>
          <PageContext content={pageContext} onRefresh={refreshPage} />

          <button
            onClick={() => setShowFavorites(!showFavorites)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200
              text-xs text-slate-600 hover:bg-slate-100 transition-colors w-full text-left shrink-0"
          >
            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <span className="font-medium">Favorites</span>
            {favoritesState.entries.length > 0 && (
              <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-semibold">
                {favoritesState.entries.length}
              </span>
            )}
            {crawlStatus && (
              <span className={`ml-1 text-[10px] font-medium truncate max-w-[140px] ${
                crawlStatus.type === "done" ? "text-emerald-600"
                : crawlStatus.type === "error" ? "text-red-500"
                : "text-indigo-500"
              }`}>
                {crawlStatus.type === "running" && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse mr-1" />
                )}
                {crawlStatus.text}
              </span>
            )}
            <svg
              className={`w-3 h-3 ml-auto text-slate-400 transition-transform duration-150 shrink-0 ${showFavorites ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showFavorites && (
            <FavoritesPanel
              favorites={favoritesState.entries}
              onAdd={addFavorite}
              onRemove={removeFavorite}
              onToggleCrawl={toggleCrawl}
              onCrawl={handleCrawl}
              isCrawling={isCrawling}
              currentPage={pageContext}
            />
          )}
        </>
      )}

      {/* ── Tab content (fills remaining space) ────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "chat" && ollamaState.healthStatus !== null && ollamaState.healthStatus !== "connected" ? (
          <SetupGuide
            status={ollamaState.healthStatus}
            models={availableModels}
            onRetry={recheckHealth}
          />
        ) : activeTab === "chat" ? (
          <ChatPanel
            messages={ollamaState.messages}
            onSend={send}
            isStreaming={ollamaState.isStreaming}
            error={ollamaState.error}
            pageContent={pageContext}
            onClear={clear}
            availableTools={mcpState.tools}
          />
        ) : activeTab === "search" ? (
          <SearchPanel />
        ) : (
          <KnowledgePanel />
        )}
      </div>

      {/* ── Status bar ─────────────────────────────────────── */}
      <StatusBar />
    </div>
  )
}
