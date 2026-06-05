import { useState, useRef, useEffect } from "react"
import type { ChatMessage } from "~/types/chat"
import type { MCPToolSchema } from "~/types/messages"

const MODEL_KEY = "selectedChatModel"
const EMBED_PATTERNS = ["embed", "minilm", "arctic-embed", "e5-"]
const isEmbedModel = (n: string) => EMBED_PATTERNS.some((p) => n.toLowerCase().includes(p))

export type OllamaHealthStatus = "connected" | "disconnected" | "cors_error" | "not_found" | null

export interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  error: string | null
  model: string
  healthStatus: OllamaHealthStatus
}

export interface UseOllamaReturn {
  state: ChatState
  send: (message: string, pageContext?: string) => Promise<void>
  stop: () => void
  clear: () => void
  setModel: (model: string) => void
  availableModels: string[]
  error: string | null
  modelAutoChanged: boolean
  recheckHealth: () => Promise<void>
}

export function useOllama(availableTools: MCPToolSchema[] = []): UseOllamaReturn {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isStreaming: false,
    error: null,
    model: process.env.PLASMO_PUBLIC_CHAT_MODEL || "llama3.2",
    healthStatus: null
  })

  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [modelAutoChanged, setModelAutoChanged] = useState(false)
  const portRef = useRef<chrome.runtime.Port | null>(null)

  useEffect(() => {
    checkHealth()
    return () => {
      portRef.current?.disconnect()
    }
  }, [])

  async function checkHealth() {
    try {
      const [healthResult, storedModel] = await Promise.all([
        new Promise<unknown>((resolve, reject) => {
          chrome.runtime.sendMessage({ type: "GET_HEALTH" }, (response: any) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
            else resolve(response)
          })
        }),
        new Promise<string | undefined>((resolve) => {
          chrome.storage.local.get(MODEL_KEY, (r) => resolve(r[MODEL_KEY] as string | undefined))
        })
      ])

      if (healthResult && typeof healthResult === "object" && "ollamaModels" in healthResult) {
        const result = healthResult as { ollama: OllamaHealthStatus; ollamaModels: string[] }
        setState((prev) => ({ ...prev, healthStatus: result.ollama }))

        const models = result.ollamaModels
        if (models.length > 0) {
          setAvailableModels(models)
          const chatModels = models.filter((m) => !isEmbedModel(m))

          const savedIsValid = storedModel && !isEmbedModel(storedModel) && models.includes(storedModel)

          if (savedIsValid) {
            setState((prev) => ({ ...prev, model: storedModel! }))
          } else {
            const autoModel = chatModels[0] ?? models[0]
            setState((prev) => ({ ...prev, model: autoModel }))
            chrome.storage.local.set({ [MODEL_KEY]: autoModel })

            if (storedModel && !models.includes(storedModel)) {
              console.log(`[Model] Saved model "${storedModel}" no longer available, switched to "${autoModel}"`)
              setModelAutoChanged(true)
              setTimeout(() => setModelAutoChanged(false), 3500)
            }
          }
        }
      }
    } catch {
      setState((prev) => ({ ...prev, healthStatus: "disconnected" }))
    }
  }

  async function send(message: string, pageContext?: string): Promise<void> {
    if (state.isStreaming) return

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

    const port = chrome.runtime.connect({ name: "sidekick" })
    portRef.current = port

    // Send full conversation history so the model has context from prior turns.
    // Filter out system messages — the background rebuilds the system prompt itself.
    const history = state.messages.filter((m) => m.role !== "system")
    port.postMessage({
      type: "CHAT",
      payload: { messages: [...history, userMsg], pageContext, availableTools, model: state.model }
    })

    let accumulatedContent = ""

    port.onMessage.addListener((msg) => {
      if (msg.type === "CHAT_TOKEN") {
        const { token, done } = msg.payload

        if (done) {
          // Capture before clearing — setState updaters are deferred in React 18
          // concurrent mode, so reading accumulatedContent inside the callback
          // would see "" if we cleared it first.
          const finalContent = accumulatedContent
          accumulatedContent = ""
          port.disconnect()
          portRef.current = null

          if (finalContent) {
            setState((prev) => {
              const msgs = [...prev.messages]
              const last = msgs[msgs.length - 1]
              if (last?.role === "assistant") {
                msgs[msgs.length - 1] = { ...last, content: finalContent }
              } else {
                msgs.push({ id: `assistant-${Date.now()}`, role: "assistant", content: finalContent, timestamp: Date.now() })
              }
              return { ...prev, messages: msgs, isStreaming: false }
            })
          } else {
            setState((prev) => ({ ...prev, isStreaming: false }))
          }
        } else {
          accumulatedContent += token
          const snapshot = accumulatedContent  // capture before next async tick
          setState((prev) => {
            const msgs = [...prev.messages]
            if (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") {
              msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: snapshot }
            } else {
              msgs.push({ id: `assistant-${Date.now()}-stream`, role: "assistant", content: snapshot, timestamp: Date.now() })
            }
            return { ...prev, messages: msgs }
          })
        }
      } else if (msg.type === "CHAT_ERROR") {
        setState((prev) => ({ ...prev, isStreaming: false, error: msg.payload.message }))
        port.disconnect()
        portRef.current = null
      }
    })
  }

  function stop(): void {
    if (portRef.current) {
      portRef.current.disconnect()
      portRef.current = null
    }
    setState((prev) => ({ ...prev, isStreaming: false }))
  }

  function clear(): void {
    setState({ messages: [], isStreaming: false, error: null, model: state.model })
  }

  function setModel(model: string): void {
    setState((prev) => ({ ...prev, model }))
    chrome.storage.local.set({ [MODEL_KEY]: model })
  }

  return {
    state,
    send,
    stop,
    clear,
    setModel,
    availableModels: availableModels.length > 0 ? availableModels : [process.env.PLASMO_PUBLIC_CHAT_MODEL || "llama3.2"],
    error: state.error,
    modelAutoChanged,
    recheckHealth: checkHealth
  }
}
