// ─── MCP Client (Streamable HTTP Transport) ───────────────────────────────────
// Implements the Model Context Protocol over HTTP using JSON-RPC 2.0.
// Uses the Streamable HTTP transport: all messages are POSTed to the server
// endpoint. Responses may be JSON or SSE streams.
//
// Spec: https://modelcontextprotocol.io/specification/2024-11-05/

import type { MCPToolSchema } from "./types"

export interface MCPToolResult {
  result: unknown
  error?: string
}

interface JsonRpcRequest {
  jsonrpc: "2.0"
  method: string
  params?: unknown
  id?: number
}

interface JsonRpcResponse {
  jsonrpc: "2.0"
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
  id?: number
}

interface MCPTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

interface MCPToolCallResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>
  isError?: boolean
}

export class MCPClient {
  private sessionId: string | null = null
  private idCounter = 1

  constructor(public readonly baseUrl: string) {}

  private nextId(): number {
    return this.idCounter++
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    }
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId
    return headers
  }

  // ─── Core JSON-RPC POST ───────────────────────────────────────────────────

  private async post(body: JsonRpcRequest): Promise<JsonRpcResponse> {
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new MCPError(`MCP server returned ${res.status}: ${text}`, res.status)
    }

    const newSession = res.headers.get("Mcp-Session-Id")
    if (newSession) this.sessionId = newSession

    const contentType = res.headers.get("Content-Type") ?? ""
    if (contentType.includes("text/event-stream")) {
      return this.readSSEResponse(res)
    }

    return res.json()
  }

  // ─── SSE response reader ──────────────────────────────────────────────────
  // Some servers stream even simple request/response pairs over SSE.
  // We read until we get a message with a result or error matching our id.

  private async readSSEResponse(res: Response): Promise<JsonRpcResponse> {
    const reader = res.body?.getReader()
    if (!reader) throw new MCPError("No response body on SSE stream")

    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const payload = line.slice(6).trim()
          if (!payload || payload === "[DONE]") continue

          try {
            const msg: JsonRpcResponse = JSON.parse(payload)
            if (msg.result !== undefined || msg.error !== undefined) {
              reader.cancel()
              return msg
            }
          } catch {
            // Malformed SSE event — skip
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {})
    }

    throw new MCPError("SSE stream ended without a result")
  }

  // ─── RPC helper ───────────────────────────────────────────────────────────

  private async rpc(method: string, params?: unknown): Promise<unknown> {
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      id: this.nextId(),
      ...(params !== undefined ? { params } : {})
    }

    const res = await this.post(req)

    if (res.error) {
      throw new MCPError(`MCP error [${res.error.code}]: ${res.error.message}`)
    }

    return res.result
  }

  // ─── Notification (fire-and-forget, no id, no response expected) ──────────

  private notify(method: string, params?: unknown): void {
    const body: JsonRpcRequest = { jsonrpc: "2.0", method, ...(params ? { params } : {}) }
    fetch(this.baseUrl, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body)
    }).catch(() => {})
  }

  // ─── Initialize handshake ─────────────────────────────────────────────────
  // Required before any other call on servers that enforce the MCP lifecycle.
  // We absorb errors so callers can fall through to the actual operation.

  async initialize(): Promise<void> {
    await this.rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "localmind", version: "0.1.0" }
    })
    this.notify("notifications/initialized")
  }

  // ─── List tools ───────────────────────────────────────────────────────────

  async listTools(forceRefresh = false): Promise<MCPToolSchema[]> {
    if (!forceRefresh && this.sessionId === null) {
      try { await this.initialize() } catch { /* server may not require it */ }
    }

    const result = await this.rpc("tools/list") as { tools?: MCPTool[] }
    const tools: MCPTool[] = result?.tools ?? []

    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      parameters: t.inputSchema ?? { type: "object", properties: {} },
      serverUrl: this.baseUrl
    }))
  }

  // ─── Call a tool ──────────────────────────────────────────────────────────

  async callTool(toolName: string, args: unknown): Promise<MCPToolResult> {
    try {
      const result = await this.rpc("tools/call", {
        name: toolName,
        arguments: args ?? {}
      }) as MCPToolCallResult

      if (result?.isError) {
        const msg = result.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n") ?? "Tool returned an error"
        return { result: null, error: msg }
      }

      // Flatten content array to a string for the chat context
      const text = result?.content
        ?.map((c) => {
          if (c.type === "text") return c.text ?? ""
          return JSON.stringify(c)
        })
        .join("\n") ?? JSON.stringify(result)

      return { result: text }
    } catch (err) {
      return {
        result: null,
        error: err instanceof Error ? err.message : "Tool call failed"
      }
    }
  }

  // ─── Health check ─────────────────────────────────────────────────────────
  // Attempts a lightweight initialize to verify the server is reachable
  // and speaks MCP. Returns true only if we get a valid response.

  async ping(): Promise<boolean> {
    try {
      await this.initialize()
      return true
    } catch (err) {
      // If initialize itself failed, try a tools/list as some servers skip the handshake
      try {
        await this.rpc("tools/list")
        return true
      } catch {
        return false
      }
    }
  }
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class MCPError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message)
    this.name = "MCPError"
  }
}
