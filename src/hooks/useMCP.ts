// ─── MCP Hook ─────────────────────────────────────────────────────────────────
// Discovers and invokes MCP tools from local servers

import { useState, useEffect } from "react"
import type { MCPToolSchema } from "~/types/messages"

export interface MCPState {
  tools: MCPToolSchema[]
  isConnecting: boolean
  servers: { url: string; status: "connected" | "disconnected" }[]
  error: string | null
}

export interface UseMCPReturn {
  state: MCPState
  connectServer: (url: string) => Promise<void>
  disconnectServer: (url: string) => Promise<void>
  listServers: () => Promise<string[]>
  callTool: (tool: MCPToolSchema, args: unknown) => Promise<unknown>
}

export function useMCP(): UseMCPReturn {
  const [state, setState] = useState<MCPState>({
    tools: [],
    isConnecting: false,
    servers: [],
    error: null
  })

  useEffect(() => {
    refreshTools()
  }, [])

  async function refreshTools() {
    try {
      const result = await new Promise<unknown>((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "LIST_MCP_TOOLS" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
          } else {
            resolve(response)
          }
        })
      })

      if (result && typeof result === "object" && "payload" in result) {
        const payload = (result as any).payload
        setState((prev) => ({
          ...prev,
          tools: payload.tools || [],
          servers: payload.serverStatuses || [],
          error: null
        }))
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to load tools"
      }))
    }
  }

  async function connectServer(url: string): Promise<void> {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }))

    try {
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "ADD_MCP_SERVER", payload: { url } },
          (_response: any) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError)
            } else {
              resolve()
            }
          }
        )
      })

      await refreshTools()
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to add server"
      }))
    } finally {
      setState((prev) => ({ ...prev, isConnecting: false }))
    }
  }

  async function disconnectServer(url: string): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "REMOVE_MCP_SERVER", payload: { url } },
          (_response: any) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError)
            } else {
              resolve()
            }
          }
        )
      })

      await refreshTools()
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to remove server"
      }))
    }
  }

  async function listServers(): Promise<string[]> {
    try {
      const result = await new Promise<unknown>((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "LIST_MCP_SERVERS" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
          } else {
            resolve(response)
          }
        })
      })

      if (result && typeof result === "object" && "servers" in result) {
        const data = result as any
        return data.servers || []
      }
      return []
    } catch {
      return []
    }
  }

  async function callTool(tool: MCPToolSchema, args: unknown): Promise<unknown> {
    try {
      const result = await new Promise<unknown>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "CALL_MCP_TOOL", payload: { server: tool.serverUrl, tool: tool.name, args } },
          (_response: any) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError)
            } else {
              resolve(_response)
            }
          }
        )
      })
      return result
    } catch (err) {
      throw err
    }
  }

  return {
    state,
    connectServer,
    disconnectServer,
    listServers,
    callTool
  }
}
