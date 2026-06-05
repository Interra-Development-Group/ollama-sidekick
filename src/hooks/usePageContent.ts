// ─── Page Content Hook ────────────────────────────────────────────────────────
// Gets content from the active tab

import { useState } from "react"
import type { PageContent } from "~/types/messages"

export function usePageContent() {
  const [content, setContent] = useState<PageContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<PageContent | null> => {
    setLoading(true)
    setError(null)

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })

      if (tabs.length === 0) {
        setError("No active tab found")
        setLoading(false)
        return null
      }

      const tabId = tabs[0].id
      if (!tabId) {
        setError("Could not get tab ID")
        setLoading(false)
        return null
      }

      const result = await new Promise<PageContent | { error: string }>((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_CONTENT" }, (response: any) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message || "Unknown error" })
          } else {
            resolve(response)
          }
        })
      })

      if ("error" in result) {
        setError(result.error as string)
        setLoading(false)
        return null
      }

      setContent(result)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get page content")
      return null
    } finally {
      setLoading(false)
    }
  }

  return {
    content,
    loading,
    error,
    refresh
  }
}
