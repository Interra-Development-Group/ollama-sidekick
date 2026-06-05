// ─── Chat Message Types ───────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant" | "system" | "tool"

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  timestamp: number
  tool_call_id?: string
  name?: string
}

export interface ToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export interface ChatCompletionChunk {
  id: string
  object: "chat.completion.chunk"
  created: number
  model: string
  choices: {
    index: number
    delta: {
      role?: "assistant"
      content?: string
      tool_calls?: ToolCall[]
    }
    finish_reason?: string
  }[]
}
