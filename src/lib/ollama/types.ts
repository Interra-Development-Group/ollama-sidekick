// ─── Ollama Client Types ──────────────────────────────────────────────────────

export type OllamaRole = "user" | "assistant" | "system" | "tool"

export interface OllamaMessage {
  role: OllamaRole
  content: string
  images?: number[] // base64 encoded images (not used in this extension)
  tool_calls?: OllamaToolCall[]
}

export interface OllamaToolCall {
  index: number
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export interface OllamaToolDefinition {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface OllamaChatRequest {
  model: string
  messages: OllamaMessage[]
  stream?: boolean
  tools?: OllamaToolDefinition[]
  options?: {
    num_predict?: number
    temperature?: number
    stop?: string[]
  }
}

export interface OllamaChatResponse {
  model: string
  created_at: string
  message: OllamaMessage
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  eval_count?: number
  eval_duration?: number
}

export interface OllamaModel {
  name: string
  model: string
  modified_at: string
  size: number
  digest: string
  details: {
    parent_model: string
    format: string
    family: string
    families: string[]
    parameter_size: string
    quantization_level: string
  }
}

export interface OllamaListModelsResponse {
  models: OllamaModel[]
}

// /api/embed (batch, preferred)
export interface OllamaEmbedRequest {
  model: string
  input: string[]
  options?: Record<string, unknown>
}

export interface OllamaEmbedResponse {
  model: string
  embeddings: number[][]
}

// /api/embeddings (legacy, single string)
export interface OllamaEmbeddingRequest {
  model: string
  prompt: string
  options?: Record<string, unknown>
}

export interface OllamaEmbeddingResponse {
  model: string
  embedding: number[]
}
