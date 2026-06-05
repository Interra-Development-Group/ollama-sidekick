// ─── Favorites Hook ───────────────────────────────────────────────────────────

import { useState, useEffect } from "react"
import type { FavoriteEntry } from "~/types/messages"

export interface FavoritesState {
  entries: FavoriteEntry[]
  loading: boolean
  error: string | null
}

export interface UseFavoritesReturn {
  state: FavoritesState
  addFavorite: (url: string, title: string) => Promise<void>
  removeFavorite: (url: string) => Promise<void>
  toggleCrawl: (url: string, crawl: boolean) => Promise<void>
  refresh: () => Promise<void>
}

export function useFavorites(): UseFavoritesReturn {
  const [state, setState] = useState<FavoritesState>({
    entries: [],
    loading: true,
    error: null
  })

  useEffect(() => {
    refresh()
  }, [])

  async function refresh(): Promise<void> {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const result = await new Promise<FavoriteEntry[]>((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "GET_FAVORITES" }, (response: any) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
          else resolve(response.payload)
        })
      })
      setState({ entries: result, loading: false, error: null })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load favorites"
      }))
    }
  }

  async function addFavorite(url: string, title: string): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "ADD_FAVORITE", payload: { url, title } },
          (_response: any) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
            else resolve()
          }
        )
      })
      await refresh()
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to add favorite"
      }))
    }
  }

  async function removeFavorite(url: string): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "REMOVE_FAVORITE", payload: { url } },
          (_response: any) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
            else resolve()
          }
        )
      })
      await refresh()
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to remove favorite"
      }))
    }
  }

  async function toggleCrawl(url: string, crawl: boolean): Promise<void> {
    // Optimistic update so the toggle feels instant
    setState((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => e.url === url ? { ...e, crawl } : e)
    }))
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "UPDATE_FAVORITE", payload: { url, crawl } },
          (_response: any) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
            else resolve()
          }
        )
      })
    } catch (err) {
      // Roll back on failure
      await refresh()
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to update favorite"
      }))
    }
  }

  return { state, addFavorite, removeFavorite, toggleCrawl, refresh }
}
