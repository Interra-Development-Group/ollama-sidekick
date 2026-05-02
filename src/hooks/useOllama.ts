// ─── Ollama Chat Hook ─────────────────────────────────────────────────────────
// Handles chat interactions with Ollama via the background worker

import { useState, useRef, useEffect } from "react"
import type { ChatMessage } from "~/types/chat"
import type { MCPToolSchema } from "~/types/messages"

export interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  error: string | null
  model: string
}

export interface UseOllamaReturn {
  state: ChatState
  send: (message: string, pageContext?: string) => Promise<void>
  stop: () => void
  clear: () => void
  setModel: (model: string) => void
  availableModels: string[]
  error: string | null
}

export function useOllama(availableTools: MCPToolSchema[] = []): UseOllamaReturn {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isStreaming: false,
    error: null,
    model: process.env.PLASMO_PUBLIC_CHAT_MODEL || "llama3.2"
  })

  const [availableModels, setAvailableModels] = useState<string[]>([])
  const portRef = useRef<chrome.runtime.Port | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Check health on mount
  useEffect(() => {
    checkHealth()
    return () => {
      if (portRef.current) {
        portRef.current.disconnect()
      }
    }
  }, [])

  async function checkHealth() {
    try {
      const result = await new Promise<unknown>((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "GET_HEALTH" }, (response: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
          } else {
            resolve(response)
          }
        })
      })

      if (result && typeof result === "object" && "ollamaModels" in result) {
        const models = (result as any).ollamaModels as string[]
        if (models.length > 0) {
          setAvailableModels(models)
          const EMBED_PATTERNS = ["embed", "minilm", "arctic-embed", "e5-"]
          const isEmbed = (n: string) => EMBED_PATTERNS.some((p) => n.toLowerCase().includes(p))
          const chatModels = models.filter((m) => !isEmbed(m))
          // Auto-correct: keep current selection only if it's a real chat model that's installed
          setState((prev) => ({
            ...prev,
            model: (!isEmbed(prev.model) && models.includes(prev.model))
              ? prev.model
              : (chatModels[0] ?? models[0])
          }))
        }
      }
    } catch {
      // Leave availableModels empty — ModelSelector falls back to selectedModel
    }
  }

  async function send(message: string, pageContext?: string): Promise<void> {
    if (state.isStreaming) return

    // Add user message
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: message,
      timestamp: Date.now()
    }

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      isStreaming: true,
      error: null
    }))

    // Create port for streaming
    const port = chrome.runtime.connect({ name: "sidekick" })
    portRef.current = port

    abortControllerRef.current = new AbortController()

    port.postMessage({
      type: "CHAT",
      payload: {
        messages: [userMsg],
        pageContext,
        availableTools,
        model: state.model
      }
    })

    // Listen for responses
    let accumulatedContent = ""

    port.onMessage.addListener((msg) => {
      if (msg.type === "CHAT_TOKEN") {
        const { token, done } = msg.payload

        if (done) {
          if (accumulatedContent) {
            setState((prev) => {
              const msgs = [...prev.messages]
              const last = msgs[msgs.length - 1]
              // Replace the streaming placeholder in place rather than appending a duplicate
              if (last?.role === "assistant") {
                msgs[msgs.length - 1] = { ...last, content: accumulatedContent }
              } else {
                msgs.push({ id: `assistant-${Date.now()}`, role: "assistant", content: accumulatedContent, timestamp: Date.now() })
              }
              return { ...prev, messages: msgs, isStreaming: false }
            })
          } else {
            setState((prev) => ({ ...prev, isStreaming: false }))
          }
          accumulatedContent = ""
          port.disconnect()
          portRef.current = null
        } else {
          accumulatedContent += token
          // Update with partial content for streaming effect
          setState((prev) => {
            const updatedMessages = [...prev.messages]
            if (updatedMessages.length > 0 && updatedMessages[updatedMessages.length - 1].role === "assistant") {
              updatedMessages[updatedMessages.length - 1].content = accumulatedContent
            } else {
              updatedMessages.push({
                id: `assistant-${Date.now()}-stream`,
                role: "assistant",
                content: accumulatedContent,
                timestamp: Date.now()
              })
            }
            return { ...prev, messages: updatedMessages }
          })
        }
      } else if (msg.type === "CHAT_ERROR") {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: msg.payload.message
        }))
        port.disconnect()
        portRef.current = null
      }
    })
  }

  function stop(): void {
    abortControllerRef.current?.abort()
    if (portRef.current) {
      portRef.current.disconnect()
      portRef.current = null
    }
    setState((prev) => ({ ...prev, isStreaming: false }))
  }

  function clear(): void {
    setState({
      messages: [],
      isStreaming: false,
      error: null,
      model: state.model
    })
  }

  function setModel(model: string): void {
    setState((prev) => ({ ...prev, model }))
  }

  return {
    state,
    send,
    stop,
    clear,
    setModel,
    availableModels: availableModels.length > 0 ? availableModels : [process.env.PLASMO_PUBLIC_CHAT_MODEL || "llama3.2"],
    error: state.error
  }
}
