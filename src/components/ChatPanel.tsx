// ─── Chat Panel Component ─────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react"
import type { ChatMessage } from "~/types/chat"
import { MessageBubble } from "./MessageBubble"
import type { MCPToolSchema } from "~/types/messages"

function ToolsDrawer({ tools }: { tools: MCPToolSchema[] }) {
  const [open, setOpen] = useState(false)

  if (tools.length === 0) return null

  return (
    <div className="border-t border-slate-100 shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 transition-colors"
      >
        <svg className="w-3 h-3 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
        </svg>
        <span className="text-[11px] font-medium text-slate-500 flex-1">
          {tools.length} tool{tools.length !== 1 ? "s" : ""} available
        </span>
        <svg
          className={`w-3 h-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul className="max-h-40 overflow-y-auto divide-y divide-slate-50 bg-slate-50">
          {tools.map((tool) => (
            <li key={tool.name} className="px-3 py-2">
              <p className="text-[11px] font-semibold text-indigo-700 font-mono">{tool.name}</p>
              {tool.description && (
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{tool.description}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-0.5">{tool.serverUrl}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface ChatPanelProps {
  messages: ChatMessage[]
  onSend: (message: string, pageContext?: string) => void
  isStreaming: boolean
  error: string | null
  pageContent: { url: string; title: string; text: string; selection: string } | null
  onClear: () => void
  availableTools: MCPToolSchema[]
}

export function ChatPanel({
  messages,
  onSend,
  isStreaming,
  error,
  pageContent,
  onClear,
  availableTools
}: ChatPanelProps) {
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isStreaming])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [input])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    onSend(input.trim(), pageContent?.selection || pageContent?.text || "")
    setInput("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const visibleMessages = messages.filter((m) => m.role !== "system")

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4 bg-slate-50">
        {visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-2xl mb-3">
              🦙
            </div>
            <p className="text-sm font-medium text-slate-700">Ask about this page</p>
            <p className="text-xs text-slate-400 mt-1">
              {pageContent
                ? `Reading: ${(() => { try { return new URL(pageContent.url).hostname } catch { return "this page" } })()}`
                : "Refresh the page context above to get started"}
            </p>
            {availableTools.length > 0 && (
              <p className="text-xs text-indigo-500 mt-2">
                {availableTools.length} tool{availableTools.length !== 1 ? "s" : ""} available
              </p>
            )}
          </div>
        ) : (
          visibleMessages.map((msg, idx) => (
            <MessageBubble
              key={msg.id || idx}
              message={msg}
              isLatest={idx === visibleMessages.length - 1}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mb-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2">
          <span className="text-red-400 text-sm shrink-0">⚠</span>
          <p className="text-xs text-red-700 leading-relaxed">{error}</p>
        </div>
      )}

      <ToolsDrawer tools={availableTools} />

      {/* Input */}
      <div className="px-3 pb-3 pt-2 bg-white border-t border-slate-200 shrink-0">
        <form onSubmit={handleSubmit}>
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? "Thinking…" : "Ask anything about this page…"}
              disabled={isStreaming}
              rows={1}
              className="flex-1 resize-none px-3 py-2 text-sm border border-slate-200 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                disabled:bg-slate-50 disabled:text-slate-400 leading-relaxed transition-shadow
                placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl
                bg-indigo-600 text-white hover:bg-indigo-700 transition-colors
                disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
              title="Send (Enter)"
            >
              {isStreaming ? (
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              )}
            </button>
          </div>

          {visibleMessages.length > 0 && (
            <div className="flex justify-between items-center mt-1.5">
              <span className="text-[10px] text-slate-400">Shift+Enter for new line</span>
              <button
                type="button"
                onClick={onClear}
                className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
              >
                Clear chat
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
