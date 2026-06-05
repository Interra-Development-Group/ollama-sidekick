// ─── Message Bubble Component ─────────────────────────────────────────────────

import type { ReactNode } from "react"
import type { ChatMessage } from "~/types/chat"

interface MessageBubbleProps {
  message: ChatMessage
  isLatest: boolean
}

// ─── Inline formatting: **bold**, `code` ──────────────────────────────────────
function renderInline(text: string, isUser: boolean, key: string): ReactNode {
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g
  const parts: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let idx = 0

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<span key={`${key}-t${idx++}`}>{text.slice(last, match.index)}</span>)
    }
    const raw = match[0]
    if (raw.startsWith("**")) {
      parts.push(<strong key={`${key}-b${idx++}`} className="font-semibold">{raw.slice(2, -2)}</strong>)
    } else {
      parts.push(
        <code key={`${key}-c${idx++}`}
          className={`px-1 py-0.5 rounded text-[11px] font-mono ${isUser ? "bg-white/20" : "bg-slate-100 text-slate-700"}`}>
          {raw.slice(1, -1)}
        </code>
      )
    }
    last = match.index + raw.length
  }
  if (last < text.length) parts.push(<span key={`${key}-t${idx}`}>{text.slice(last)}</span>)
  return <>{parts}</>
}

// ─── Block renderer: lists, paragraphs ────────────────────────────────────────
function renderBlock(text: string, isUser: boolean, keyPrefix: string): ReactNode {
  const lines = text.split("\n")
  const nodes: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Numbered list — collect consecutive `N. ...` lines
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""))
        i++
      }
      nodes.push(
        <ol key={`${keyPrefix}-ol-${i}`} className="list-decimal list-outside ml-5 space-y-1 my-1">
          {items.map((item, j) => (
            <li key={j} className="leading-relaxed pl-1">
              {renderInline(item, isUser, `${keyPrefix}-ol-${i}-${j}`)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Bullet list — collect consecutive `- ...` or `* ...` lines
    if (/^[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s+/, ""))
        i++
      }
      nodes.push(
        <ul key={`${keyPrefix}-ul-${i}`} className="list-disc list-outside ml-5 space-y-1 my-1">
          {items.map((item, j) => (
            <li key={j} className="leading-relaxed pl-1">
              {renderInline(item, isUser, `${keyPrefix}-ul-${i}-${j}`)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Non-empty line → paragraph
    if (line.trim()) {
      nodes.push(
        <p key={`${keyPrefix}-p-${i}`} className="leading-relaxed">
          {renderInline(line, isUser, `${keyPrefix}-p-${i}`)}
        </p>
      )
    } else if (nodes.length > 0) {
      // Blank line between blocks → small gap
      nodes.push(<div key={`${keyPrefix}-gap-${i}`} className="h-1.5" />)
    }

    i++
  }

  return <>{nodes}</>
}

// ─── Top-level renderer: splits out code blocks first ─────────────────────────
function renderContent(text: string, isUser: boolean): ReactNode {
  const codeRe = /```([\w]*)\n?([\s\S]*?)```/g
  const nodes: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null

  while ((match = codeRe.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(
        <span key={`pre-${match.index}`}>
          {renderBlock(text.slice(last, match.index), isUser, `pre-${match.index}`)}
        </span>
      )
    }
    const lang = match[1]
    const code = match[2].replace(/^\n/, "").replace(/\n$/, "")
    nodes.push(
      <pre key={`code-${match.index}`}
        className="bg-slate-900 text-slate-100 rounded-lg px-3 py-2.5 text-xs font-mono overflow-x-auto my-2 leading-relaxed">
        {lang && (
          <div className="text-slate-500 text-[10px] mb-1.5 font-sans uppercase tracking-wider select-none">{lang}</div>
        )}
        <code>{code}</code>
      </pre>
    )
    last = match.index + match[0].length
  }

  if (last < text.length) {
    nodes.push(
      <span key={`post-${last}`}>
        {renderBlock(text.slice(last), isUser, `post-${last}`)}
      </span>
    )
  }

  return <>{nodes}</>
}

// ─── Component ────────────────────────────────────────────────────────────────
export function MessageBubble({ message, isLatest }: MessageBubbleProps) {
  const isUser = message.role === "user"
  const isAssistant = message.role === "assistant"
  const isTool = message.role === "tool"

  if (message.role === "system") return null

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && !isTool && (
        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-sm shrink-0 mt-1 mr-2 select-none">
          🦙
        </div>
      )}

      <div className="max-w-[85%] min-w-0">
        {isTool && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <div className="font-medium uppercase tracking-wider text-amber-600 mb-1 text-[10px]">Tool Result</div>
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed overflow-x-auto">
              {message.content}
            </pre>
          </div>
        )}

        {(isUser || isAssistant) && (
          <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${
            isUser
              ? "bg-indigo-600 text-white rounded-br-sm"
              : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm"
          }`}>
            {renderContent(message.content, isUser)}

            <div className={`text-[10px] mt-1.5 select-none ${isUser ? "text-indigo-300" : "text-slate-400"}`}>
              {time}
              {isLatest && isAssistant && (
                <span className="ml-1 animate-pulse">●</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
