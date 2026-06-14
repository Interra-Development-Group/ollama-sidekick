// ─── Background Service Worker ────────────────────────────────────────────────
// The central hub. All Ollama calls, MCP calls, and crawler scheduling happen
// here. The side panel and content scripts communicate via message passing.
//
// MV3 IMPORTANT: This worker can be killed by Chrome at any time. Do not store
// state in module-level variables — use chrome.storage or IndexedDB instead.
// The chrome.alarms API will wake this worker when needed.

import { streamChat, healthCheck, listModels } from "~/lib/ollama/client"
import { log, warn } from "~/lib/utils/logger"
import { getAllTools, routeToolCall, addMcpServer, removeMcpServer, listMcpServers } from "~/lib/mcp/registry"
import { getAllSnapshots } from "~/lib/storage/snapshots"
import { getAllFavorites, addFavorite, removeFavorite, updateFavorite } from "~/lib/storage/favorites"
import { semanticSearch } from "~/lib/embeddings/similarity"
import { initCrawlSchedule, handleCrawlAlarm, runCrawl } from "~/lib/crawler/scheduler"
import type { ExtensionMessage, HealthStatus } from "~/types/messages"
import type { ChatMessage } from "~/types/chat"
import type { OllamaToolDefinition } from "~/lib/ollama/types"

// ─── Environment config ───────────────────────────────────────────────────────
import { CHAT_MODEL } from "~/lib/ollama/models"

// ─── Lifecycle: install + startup ─────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  log("[Sidekick] Extension installed")
  await initCrawlSchedule()
  // Open side panel behavior: clicking the action icon opens the side panel
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

chrome.runtime.onStartup.addListener(async () => {
  await initCrawlSchedule()
})

// ─── Alarm handler (crawler) ──────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  await handleCrawlAlarm(alarm, (url, status, message) => {
    // Broadcast crawl status to any open side panel ports
    broadcastToAllPorts({ type: "CRAWL_STATUS", payload: { url, status, message } })
  })
})

// ─── Port management (for streaming) ─────────────────────────────────────────
// Side panel connects via a named port to receive streaming tokens.
// Store active ports so we can broadcast crawl status updates.

const activePorts = new Set<chrome.runtime.Port>()

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "sidekick") return

  activePorts.add(port)
  port.onDisconnect.addListener(() => activePorts.delete(port))

  port.onMessage.addListener(async (msg: ExtensionMessage) => {
    await handlePortMessage(msg, port)
  })
})

function broadcastToAllPorts(msg: ExtensionMessage): void {
  activePorts.forEach((port) => {
    try { port.postMessage(msg) } catch { /* port may be closed */ }
  })
}

// ─── Port message handler ─────────────────────────────────────────────────────

async function handlePortMessage(
  msg: ExtensionMessage,
  port: chrome.runtime.Port
): Promise<void> {
  switch (msg.type) {
    case "CHAT":
      await handleChat(msg.payload, port)
      break

    case "CRAWL_NOW":
      await runCrawl((url, status, message) => {
        port.postMessage({ type: "CRAWL_STATUS", payload: { url, status, message } })
      })
      break

    case "GET_FAVORITES": {
      const entries = await getAllFavorites()
      port.postMessage({ type: "FAVORITES_RESPONSE", payload: entries })
      break
    }

    case "ADD_FAVORITE": {
      try {
        const entry = await addFavorite(msg.payload.url, msg.payload.title)
        port.postMessage({ type: "FAVORITE_ADDED", payload: entry })
      } catch (err) {
        port.postMessage({ type: "CHAT_ERROR", payload: { message: err instanceof Error ? err.message : "Failed to add favorite" } })
      }
      break
    }

    case "REMOVE_FAVORITE": {
      await removeFavorite(msg.payload.url)
      port.postMessage({ type: "FAVORITE_REMOVED", payload: { url: msg.payload.url } })
      break
    }

    case "UPDATE_FAVORITE": {
      const updated = await updateFavorite(msg.payload.url, { crawl: msg.payload.crawl })
      if (updated) port.postMessage({ type: "FAVORITE_UPDATED", payload: updated })
      break
    }

    case "GET_HEALTH": {
      const status = await buildHealthStatus()
      port.postMessage({ type: "HEALTH_RESPONSE", payload: status })
      break
    }

    case "LIST_MCP_TOOLS": {
      try {
        const { tools } = await getAllTools()
        port.postMessage({ type: "MCP_TOOLS_RESPONSE", payload: { tools } })
      } catch (err) {
        port.postMessage({ type: "CHAT_ERROR", payload: { message: err instanceof Error ? err.message : "Failed to list tools" } })
      }
      break
    }

    case "SEARCH_SNAPSHOTS": {
      try {
        const snapshots = await getAllSnapshots()
        const chunks = await semanticSearch(msg.payload.query, snapshots)
        port.postMessage({ type: "SNAPSHOT_RESULTS", payload: { chunks } })
      } catch (err) {
        port.postMessage({ type: "CHAT_ERROR", payload: { message: err instanceof Error ? err.message : "Search failed" } })
      }
      break
    }

    case "ADD_MCP_SERVER": {
      try {
        await addMcpServer(msg.payload.url)
        port.postMessage({ type: "MCP_SERVER_ADDED", payload: { url: msg.payload.url } })
      } catch (err) {
        port.postMessage({ type: "CHAT_ERROR", payload: { message: err instanceof Error ? err.message : "Failed to add server" } })
      }
      break
    }

    case "REMOVE_MCP_SERVER": {
      try {
        await removeMcpServer(msg.payload.url)
        port.postMessage({ type: "MCP_SERVER_REMOVED", payload: { url: msg.payload.url } })
      } catch (err) {
        port.postMessage({ type: "CHAT_ERROR", payload: { message: err instanceof Error ? err.message : "Failed to remove server" } })
      }
      break
    }

    case "LIST_MCP_SERVERS": {
      try {
        const servers = await listMcpServers()
        port.postMessage({ type: "MCP_SERVERS_RESPONSE", payload: { servers } })
      } catch (err) {
        port.postMessage({ type: "CHAT_ERROR", payload: { message: err instanceof Error ? err.message : "Failed to list servers" } })
      }
      break
    }

    default:
      break
  }
}

// ─── One-shot message handler ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (msg: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(msg).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message })
    })
    return true // keep channel open for async response
  }
)

async function handleMessage(msg: ExtensionMessage): Promise<unknown> {
  switch (msg.type) {
    case "GET_HEALTH":
      return buildHealthStatus()

    case "GET_FAVORITES":
      return { type: "FAVORITES_RESPONSE", payload: await getAllFavorites() }

    case "ADD_FAVORITE": {
      const entry = await addFavorite(msg.payload.url, msg.payload.title)
      return { type: "FAVORITE_ADDED", payload: entry }
    }

    case "REMOVE_FAVORITE": {
      await removeFavorite(msg.payload.url)
      return { type: "FAVORITE_REMOVED", payload: { url: msg.payload.url } }
    }

    case "UPDATE_FAVORITE": {
      const updated = await updateFavorite(msg.payload.url, { crawl: msg.payload.crawl })
      return updated ? { type: "FAVORITE_UPDATED", payload: updated } : null
    }

    case "LIST_MCP_TOOLS": {
      try {
        const { tools } = await getAllTools()
        return { type: "MCP_TOOLS_RESPONSE", payload: { tools } }
      } catch {
        return { type: "MCP_TOOLS_RESPONSE", payload: { tools: [] } }
      }
    }

    case "LIST_MCP_SERVERS":
      return { type: "MCP_SERVERS_RESPONSE", payload: { servers: await listMcpServers() } }

    case "ADD_MCP_SERVER": {
      await addMcpServer(msg.payload.url)
      return { type: "MCP_SERVER_ADDED", payload: { url: msg.payload.url } }
    }

    case "REMOVE_MCP_SERVER": {
      await removeMcpServer(msg.payload.url)
      return { type: "MCP_SERVER_REMOVED", payload: { url: msg.payload.url } }
    }

    case "CRAWL_NOW": {
      await runCrawl()
      return { type: "CRAWL_STARTED" }
    }

    default:
      return null
  }
}

// ─── Chat handler with tool calling ──────────────────────────────────────────

async function handleChat(
  payload: Extract<ExtensionMessage, { type: "CHAT" }>["payload"],
  port: chrome.runtime.Port
): Promise<void> {
  const { messages, pageContext, availableTools, model } = payload

  // Build system message with page context + knowledge base context (RAG)
  const systemParts: string[] = [
    "You are LocalMind, a helpful AI assistant embedded in the user's browser.",
    "You have access to the content of the current web page and the user's saved knowledge base."
  ]

  if (pageContext) {
    systemParts.push(`\n--- CURRENT PAGE CONTENT ---\n${pageContext}\n--- END PAGE CONTENT ---`)
  }

  // List available tools in the system prompt so the model can answer
  // questions about them and knows when to invoke them.
  if (availableTools.length > 0) {
    const toolList = availableTools
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n")
    systemParts.push(`\n--- AVAILABLE TOOLS ---\nYou have the following tools available. Use them when appropriate, or describe them if the user asks:\n${toolList}\n--- END AVAILABLE TOOLS ---`)
  }

  // Semantic search over the knowledge base and inject top matching chunks
  try {
    const snapshots = await getAllSnapshots()
    const searchable = snapshots.filter((s) => s.embeddings.length > 0)
    if (searchable.length > 0) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")
      if (lastUserMsg) {
        const chunks = await semanticSearch(lastUserMsg.content, searchable)
        const goodChunks = chunks.filter((c) => !c.belowThreshold)
        if (goodChunks.length > 0) {
          const ctx = goodChunks.map((c) => `[${c.title}](${c.url})\n${c.chunk}`).join("\n\n---\n\n")
          systemParts.push(`\n--- KNOWLEDGE BASE ---\n${ctx}\n--- END KNOWLEDGE BASE ---`)
          log(`[Chat] Injected ${goodChunks.length} knowledge base chunks`)
        }
      }
    }
  } catch (err) {
    warn("[Chat] Knowledge base search skipped:", err)
  }

  const fullMessages: Extract<ExtensionMessage, { type: "CHAT" }>["payload"]["messages"] = [
    { role: "system", content: systemParts.join("\n"), id: "system", timestamp: Date.now() },
    ...messages.map(m => ({
      role: m.role,
      content: m.content,
      id: m.id,
      timestamp: m.timestamp
    }))
  ]

  // Convert available tools to Ollama's expected format
  const ollamaTools: OllamaToolDefinition[] = availableTools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }))

  try {
    let assistantContent = ""
    let pendingToolCalls: { name: string; args: unknown }[] = []

    // First streaming pass
    for await (const chunk of streamChat(model || CHAT_MODEL, fullMessages as any, ollamaTools)) {
      if (chunk.message?.content) {
        assistantContent += chunk.message.content
        port.postMessage({
          type: "CHAT_TOKEN",
          payload: { token: chunk.message.content, done: false }
        })
      }

      if (chunk.done && chunk.message?.tool_calls) {
        pendingToolCalls = chunk.message.tool_calls.map((tc) => ({
          name: tc.function.name,
          args: typeof tc.function.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments
        }))
      }
    }

    // Execute any tool calls
    if (pendingToolCalls.length > 0) {
      const toolResultMessages: ChatMessage[] = []

      for (const tc of pendingToolCalls) {
        const tool = availableTools.find((t) => t.name === tc.name)
        if (!tool) continue

        try {
          const result = await routeToolCall(tool.serverUrl, tc.name, tc.args)
          toolResultMessages.push({
            id: `tool-${Date.now()}-${tc.name}`,
            role: "tool",
            content: JSON.stringify(result),
            timestamp: Date.now()
          })

          port.postMessage({
            type: "MCP_TOOL_RESULT",
            payload: { tool: tc.name, result }
          })
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Tool call failed"
          port.postMessage({
            type: "MCP_TOOL_ERROR",
            payload: { tool: tc.name, message: errMsg }
          })
        }
      }

      // Second pass: include tool results
      if (toolResultMessages.length > 0) {
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: assistantContent,
          timestamp: Date.now()
        }

        const secondMessages = [...fullMessages, assistantMsg, ...toolResultMessages]

        for await (const chunk of streamChat(model || CHAT_MODEL, secondMessages as any, ollamaTools)) {
          if (chunk.message?.content) {
            port.postMessage({
              type: "CHAT_TOKEN",
              payload: { token: chunk.message.content, done: false }
            })
          }
        }
      }
    }

    // Signal completion
    port.postMessage({ type: "CHAT_TOKEN", payload: { token: "", done: true } })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed"
    port.postMessage({ type: "CHAT_ERROR", payload: { message } })
  }
}

// ─── Health status builder ────────────────────────────────────────────────────

async function buildHealthStatus(): Promise<HealthStatus> {
  const [ollamaStatus, ollamaModels, { serverStatuses }] = await Promise.all([
    healthCheck(),
    listModels().then((m) => m.map((m) => m.name)).catch(() => []),
    getAllTools().catch(() => ({ serverStatuses: [] }))
  ])

  return {
    ollama: ollamaStatus,
    ollamaModels,
    mcpServers: serverStatuses
  }
}

