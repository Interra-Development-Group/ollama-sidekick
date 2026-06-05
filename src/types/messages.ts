// ─── Chrome Extension Message Types ───────────────────────────────────────────
// Discriminated union for all messages passed between contexts

export interface PageContent {
  url: string
  title: string
  text: string
  selection: string
}

export interface FavoriteEntry {
  url: string
  title: string
  addedAt: number
  crawl: boolean  // false = skip during auto-crawl; still crawlable on-demand
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  timestamp: number
  tool_call_id?: string
  name?: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  pageContext?: string
  availableTools: MCPToolSchema[]
  model: string
}

export interface MCPToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
  serverUrl: string
}

export interface ChatTokenPayload {
  token: string
  done: boolean
}

export interface HealthStatus {
  ollama: "connected" | "disconnected" | "cors_error" | "not_found"
  ollamaModels: string[]
  mcpServers: { url: string; status: "connected" | "disconnected" }[]
}

export interface CrawlStatus {
  url: string
  status: "running" | "done" | "error"
  message?: string
}

export interface SnapshotResult {
  chunks: ScoredChunk[]
}

export interface ScoredChunk {
  url: string
  title: string
  chunk: string
  score: number
}

export interface MCPToolResult {
  tool: string
  result: unknown
}

export interface MCPToolError {
  tool: string
  message: string
}

// ─── Message Types ────────────────────────────────────────────────────────────

export type ExtensionMessage =
  // Side panel → Background
  | { type: "GET_PAGE_CONTENT" }
  | { type: "CHAT"; payload: ChatRequest }
  | { type: "CRAWL_NOW" }
  | { type: "GET_FAVORITES" }
  | { type: "ADD_FAVORITE"; payload: { url: string; title: string } }
  | { type: "REMOVE_FAVORITE"; payload: { url: string } }
  | { type: "UPDATE_FAVORITE"; payload: { url: string; crawl: boolean } }
  | { type: "SEARCH_SNAPSHOTS"; payload: { query: string } }
  | { type: "GET_HEALTH" }
  | { type: "LIST_MCP_TOOLS" }
  | { type: "ADD_MCP_SERVER"; payload: { url: string } }
  | { type: "REMOVE_MCP_SERVER"; payload: { url: string } }
  | { type: "LIST_MCP_SERVERS" }
  | { type: "TEST_MCP_SERVER"; payload: { url: string } }

  // Background → Side panel
  | { type: "PAGE_CONTENT_RESPONSE"; payload: PageContent }
  | { type: "CHAT_TOKEN"; payload: ChatTokenPayload }
  | { type: "CHAT_ERROR"; payload: { message: string } }
  | { type: "CRAWL_STATUS"; payload: CrawlStatus }
  | { type: "FAVORITES_RESPONSE"; payload: FavoriteEntry[] }
  | { type: "FAVORITE_ADDED"; payload: FavoriteEntry }
  | { type: "FAVORITE_REMOVED"; payload: { url: string } }
  | { type: "FAVORITE_UPDATED"; payload: FavoriteEntry }
  | { type: "SNAPSHOT_RESULTS"; payload: SnapshotResult }
  | { type: "HEALTH_RESPONSE"; payload: HealthStatus }
  | { type: "MCP_TOOLS_RESPONSE"; payload: { tools: MCPToolSchema[] } }
  | { type: "MCP_TOOL_RESULT"; payload: MCPToolResult }
  | { type: "MCP_TOOL_ERROR"; payload: MCPToolError }
  | { type: "MCP_SERVER_ADDED"; payload: { url: string } }
  | { type: "MCP_SERVER_REMOVED"; payload: { url: string } }
  | { type: "MCP_SERVERS_RESPONSE"; payload: { servers: string[] } }
  | { type: "CRAWL_STARTED" }

  // Content script → Background
  | { type: "CONTENT_SCRIPT_READY" }
