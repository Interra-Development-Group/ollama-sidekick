// ─── Page Snapshot Storage ────────────────────────────────────────────────────
// Stores crawled pages with embeddings in IndexedDB

import type { PageSnapshot } from "~/types/page"
import { getDb } from "./db"

// ─── CRUD Operations ──────────────────────────────────────────────────────────

export async function saveSnapshot(snapshot: PageSnapshot): Promise<void> {
  const db = await getDb()

  await db.put("snapshots", {
    ...snapshot,
    crawledAt: Date.now()
  })
}

export async function getSnapshot(url: string): Promise<PageSnapshot | undefined> {
  const db = await getDb()
  return db.get("snapshots", url)
}

export async function getAllSnapshots(): Promise<PageSnapshot[]> {
  const db = await getDb()
  return db.getAll("snapshots")
}

export async function deleteSnapshot(url: string): Promise<void> {
  const db = await getDb()
  await db.delete("snapshots", url)
}

export async function clearAllSnapshots(): Promise<void> {
  const db = await getDb()
  await db.clear("snapshots")
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

export async function getSnapshotsByUrls(urls: string[]): Promise<PageSnapshot[]> {
  const results: PageSnapshot[] = []

  for (const url of urls) {
    try {
      const snapshot = await getSnapshot(url)
      if (snapshot) {
        results.push(snapshot)
      }
    } catch {
      // Continue on individual errors
    }
  }

  return results
}
