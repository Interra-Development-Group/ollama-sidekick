// ─── MCP Protocol Types ───────────────────────────────────────────────────────

export interface MCPToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
  serverUrl: string
}

export interface MCPServerStatus {
  url: string
  status: "connected" | "disconnected"
  lastChecked: number
  tools?: MCPToolSchema[]
}

export interface MCPToolCall {
  serverUrl: string
  tool: string
  args: Record<string, unknown>
}

export interface MCPToolResult {
  result: unknown
  error?: string
}
