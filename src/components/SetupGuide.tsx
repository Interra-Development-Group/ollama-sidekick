// ─── Setup Guide ──────────────────────────────────────────────────────────────
// Shown in place of the chat empty state when Ollama isn't ready.
// Walks through: start Ollama → fix CORS → pull models.

import { useState } from "react"
import type { OllamaHealthStatus } from "~/hooks/useOllama"

const EMBED_PATTERNS = ["embed", "minilm", "arctic-embed", "e5-"]
const isEmbedModel = (n: string) => EMBED_PATTERNS.some((p) => n.toLowerCase().includes(p))

interface SetupGuideProps {
  status: OllamaHealthStatus
  models: string[]
  onRetry: () => Promise<void>
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={copy}
      className="shrink-0 text-[10px] font-medium text-indigo-400 hover:text-indigo-200 transition-colors"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  )
}

function CommandBlock({ command }: { command: string }) {
  return (
    <div className="flex items-start gap-3 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5">
      <code className="flex-1 text-[11px] font-mono text-slate-300 break-all leading-relaxed">{command}</code>
      <CopyButton text={command} />
    </div>
  )
}

function Step({
  n,
  title,
  done,
  children
}: {
  n: number
  title: string
  done: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={`flex gap-3 ${done ? "opacity-50" : ""}`}>
      <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold
        ${done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"}`}
      >
        {done ? "✓" : n}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold mb-1.5 ${done ? "text-slate-400" : "text-slate-800"}`}>{title}</p>
        {!done && children}
      </div>
    </div>
  )
}

export function SetupGuide({ status, models, onRetry }: SetupGuideProps) {
  const [retrying, setRetrying] = useState(false)
  const extensionId = chrome.runtime.id

  const ollamaRunning = status === "connected" || status === "cors_error"
  const corsOk = status === "connected"
  const hasChatModel = models.some((m) => !isEmbedModel(m))
  const hasEmbedModel = models.some((m) => m.includes("nomic-embed-text"))

  const allDone = corsOk && hasChatModel && hasEmbedModel

  const corsCmd = `OLLAMA_ORIGINS="chrome-extension://${extensionId}" ollama serve`

  async function handleRetry() {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  if (allDone) return null

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 bg-slate-50">
      <div>
        <p className="text-sm font-semibold text-slate-800 mb-0.5">Getting started</p>
        <p className="text-xs text-slate-500">Complete these steps to start chatting.</p>
      </div>

      <div className="space-y-4">
        {/* Step 1: Start Ollama */}
        <Step n={1} title="Start Ollama" done={ollamaRunning}>
          <p className="text-xs text-slate-500 mb-2">
            Ollama isn't reachable. Install it from{" "}
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              ollama.com
            </a>
            , then run:
          </p>
          <CommandBlock command="ollama serve" />
        </Step>

        {/* Step 2: Fix CORS */}
        <Step n={2} title="Allow this extension" done={corsOk}>
          {ollamaRunning ? (
            <>
              <p className="text-xs text-slate-500 mb-2">
                Ollama is running but blocking this extension. Stop it, then restart with:
              </p>
              <CommandBlock command={corsCmd} />
              <p className="text-[10px] text-slate-400 mt-1.5">
                Extension ID: <span className="font-mono">{extensionId}</span>
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-400">Complete step 1 first.</p>
          )}
        </Step>

        {/* Step 3: Pull a chat model */}
        <Step n={3} title="Pull a chat model" done={hasChatModel}>
          {corsOk ? (
            <>
              <p className="text-xs text-slate-500 mb-2">
                No chat model found. Pull at least one — <code className="bg-slate-200 px-1 rounded text-[10px]">qwen2.5</code> is fast and capable:
              </p>
              <CommandBlock command="ollama pull qwen2.5" />
            </>
          ) : (
            <p className="text-xs text-slate-400">Complete steps 1–2 first.</p>
          )}
        </Step>

        {/* Step 4: Pull embed model */}
        <Step n={4} title="Pull the embedding model" done={hasEmbedModel}>
          {corsOk ? (
            <>
              <p className="text-xs text-slate-500 mb-2">
                Required for semantic search and the knowledge base:
              </p>
              <CommandBlock command="ollama pull nomic-embed-text" />
            </>
          ) : (
            <p className="text-xs text-slate-400">Complete steps 1–2 first.</p>
          )}
        </Step>
      </div>

      <button
        onClick={handleRetry}
        disabled={retrying}
        className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium
          bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {retrying ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Checking…
          </>
        ) : "Retry connection"}
      </button>

      <p className="text-center text-[10px] text-slate-400">
        More options in{" "}
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="text-indigo-500 hover:underline"
        >
          Settings
        </button>
      </p>
    </div>
  )
}
