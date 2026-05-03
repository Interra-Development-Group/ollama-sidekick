// ─── Favorites Storage ────────────────────────────────────────────────────────

import type { FavoriteEntry } from "~/types/messages"

export type { FavoriteEntry }

const STORAGE_KEY = "favorites"

function migrateEntry(raw: Record<string, unknown>): FavoriteEntry {
  return {
    url: raw.url as string,
    title: (raw.title as string) ?? "",
    addedAt: (raw.addedAt as number) ?? Date.now(),
    crawl: raw.crawl !== false  // default true for old entries without the field
  }
}

// ─── Get all favorites (with metadata) ───────────────────────────────────────

export async function getAllFavorites(): Promise<FavoriteEntry[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const data = result[STORAGE_KEY] as Record<string, unknown>[] | undefined
    return (data ?? []).map(migrateEntry)
  } catch {
    return []
  }
}

// ─── Get URLs only (for crawler — only returns crawl-enabled entries) ─────────

export async function getFavorites(): Promise<string[]> {
  const entries = await getAllFavorites()
  return entries.filter((e) => e.crawl !== false).map((e) => e.url)
}

// ─── Add a favorite ───────────────────────────────────────────────────────────

export async function addFavorite(url: string, title: string): Promise<FavoriteEntry> {
  const entry: FavoriteEntry = { url, title, addedAt: Date.now(), crawl: true }

  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const data = (result[STORAGE_KEY] as Record<string, unknown>[] | undefined) ?? []
    const favorites = data.map(migrateEntry)

    if (favorites.some((f) => f.url === url)) return entry

    favorites.push(entry)
    await chrome.storage.local.set({ [STORAGE_KEY]: favorites })
    return entry
  } catch (e) {
    if (e instanceof Error && e.name === "QuotaExceededError") {
      throw new Error("Storage quota exceeded. Please remove some favorites.")
    }
    throw e
  }
}

// ─── Remove a favorite ────────────────────────────────────────────────────────

export async function removeFavorite(url: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const data = result[STORAGE_KEY] as Record<string, unknown>[] | undefined
    if (!data) return
    const filtered = data.filter((f) => (f.url as string) !== url)
    if (filtered.length === data.length) return
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered })
  } catch {
    // ignore
  }
}

// ─── Update a favorite (e.g. toggle crawl) ───────────────────────────────────

export async function updateFavorite(url: string, updates: Partial<Pick<FavoriteEntry, "crawl" | "title">>): Promise<FavoriteEntry | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const data = (result[STORAGE_KEY] as Record<string, unknown>[] | undefined) ?? []
    const favorites = data.map(migrateEntry)

    const idx = favorites.findIndex((f) => f.url === url)
    if (idx === -1) return null

    favorites[idx] = { ...favorites[idx], ...updates }
    await chrome.storage.local.set({ [STORAGE_KEY]: favorites })
    return favorites[idx]
  } catch {
    return null
  }
}

// ─── Check if URL is favorited ────────────────────────────────────────────────

export async function isFavorite(url: string): Promise<boolean> {
  const entries = await getAllFavorites()
  return entries.some((e) => e.url === url)
}
