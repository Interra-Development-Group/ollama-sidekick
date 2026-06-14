import type { DBSchema, IDBPDatabase } from "idb"
import { openDB } from "idb"
import { log } from "~/lib/utils/logger"
import type { PageSnapshot } from "~/types/page"

interface AppDBSchema extends DBSchema {
  snapshots: {
    key: string
    value: PageSnapshot
    indexes: { url: string; crawledAt: number }
  }
}

const DB_NAME = "localmind"
const DB_VERSION = 2

export type AppDatabase = IDBPDatabase<AppDBSchema>

export async function getDb(): Promise<AppDatabase> {
  return openDB<AppDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // v1 created an unused favorites store — drop it
      // Cast to any: "favorites" is not in AppDBSchema, but it exists in legacy v1 databases
      const dbAny = db as any
      if (oldVersion < 2 && dbAny.objectStoreNames.contains("favorites")) {
        dbAny.deleteObjectStore("favorites")
        log("[DB] Dropped legacy favorites object store")
      }
      if (!db.objectStoreNames.contains("snapshots")) {
        const store = db.createObjectStore("snapshots", { keyPath: "id" })
        store.createIndex("url", "url")
        store.createIndex("crawledAt", "crawledAt")
        log("[DB] Created snapshots object store")
      }
    }
  })
}

export async function clearAllData(): Promise<void> {
  const db = await getDb()
  await db.clear("snapshots")
}
