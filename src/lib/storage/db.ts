import type { DBSchema, IDBPDatabase } from "idb"
import { openDB } from "idb"
import type { PageSnapshot } from "~/types/page"

interface AppDBSchema extends DBSchema {
  snapshots: {
    key: string
    value: PageSnapshot
    indexes: { url: string; crawledAt: number }
  }
}

const DB_NAME = "ollama-sidekick"
const DB_VERSION = 1

export type AppDatabase = IDBPDatabase<AppDBSchema>

export async function getDb(): Promise<AppDatabase> {
  return openDB<AppDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("snapshots")) {
        const store = db.createObjectStore("snapshots", { keyPath: "id" })
        store.createIndex("url", "url")
        store.createIndex("crawledAt", "crawledAt")
      }
    }
  })
}

export async function clearAllData(): Promise<void> {
  const db = await getDb()
  await db.clear("snapshots")
}
