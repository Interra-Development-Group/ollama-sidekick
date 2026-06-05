// ─── MCP Server Registry ──────────────────────────────────────────────────────
// Manages configured MCP servers and provides unified tool access

import { MCPClient } from "./client"
import type { MCPToolSchema, MCPServerStatus } from "./types"

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const MCP_SERVERS_STORAGE_KEY = "mcpServers"

// ─── Helper: Get servers from storage ─────────────────────────────────────────

async function getRegisteredServers(): Promise<string[]> {
  try {
    const result = await chrome.storage.local.get(MCP_SERVERS_STORAGE_KEY)
    const servers = result[MCP_SERVERS_STORAGE_KEY]
    return Array.isArray(servers) ? servers : []
  } catch {
    return []
  }
}

// ─── Helper: Save servers to storage ──────────────────────────────────────────

async function saveServers(servers: string[]): Promise<void> {
  await chrome.storage.local.set({ [MCP_SERVERS_STORAGE_KEY]: servers })
}

// ─── Registry API ─────────────────────────────────────────────────────────────

export async function addMcpServer(url: string): Promise<void> {
  const servers = await getRegisteredServers()
  if (servers.includes(url)) return

  // Verify the server speaks MCP before saving
  const client = new MCPClient(url)
  const reachable = await client.ping()
  if (!reachable) {
    throw new Error(`Could not connect to MCP server at ${url}. Check the URL and that the server is running.`)
  }

  servers.push(url)
  await saveServers(servers)
}

export async function removeMcpServer(url: string): Promise<void> {
  const servers = await getRegisteredServers()
  const filtered = servers.filter((s) => s !== url)
  await saveServers(filtered)
}

export async function listMcpServers(): Promise<string[]> {
  return await getRegisteredServers()
}

// ─── Tool Discovery ───────────────────────────────────────────────────────────

export async function getAllTools(): Promise<{
  tools: MCPToolSchema[]
  serverStatuses: MCPServerStatus[]
}> {
  const servers = await getRegisteredServers()
  const tools: MCPToolSchema[] = []
  const serverStatuses: MCPServerStatus[] = []

  for (const url of servers) {
    const client = new MCPClient(url)
    const status: MCPServerStatus = {
      url,
      status: "disconnected",
      lastChecked: Date.now()
    }

    try {
      const serverTools = await client.listTools()
      tools.push(...serverTools)
      status.status = "connected"
      status.tools = serverTools
    } catch {
      // Status remains disconnected
    }

    serverStatuses.push(status)
  }

  return { tools, serverStatuses }
}

// ─── Tool Routing ─────────────────────────────────────────────────────────────

export async function routeToolCall(
  serverUrl: string,
  toolName: string,
  args: unknown
): Promise<unknown> {
  const client = new MCPClient(serverUrl)
  const result = await client.callTool(toolName, args)

  if (result.error) {
    throw new Error(result.error)
  }

  return result.result
}
