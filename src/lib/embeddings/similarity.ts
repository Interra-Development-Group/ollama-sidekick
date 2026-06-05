// ─── Similarity Search ────────────────────────────────────────────────────────
// Brute-force semantic search using cosine similarity

import { generateEmbeddings } from "~/lib/ollama/client"
import { EMBED_MODEL, MAX_CONTEXT_CHUNKS, SIMILARITY_THRESHOLD } from "~/lib/ollama/models"
import { log } from "~/lib/utils/logger"
import type { PageSnapshot } from "~/types/page"

// ─── ScoredChunk type ────────────────────────────────────────────────────────
export interface ScoredChunk {
  url: string
  title: string
  chunk: string
  score: number
  belowThreshold?: boolean
}

// ─── Cosine Similarity ────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must be same length")
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ─── Query Embedding Generation ───────────────────────────────────────────────

export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const embeddings = await generateEmbeddings(EMBED_MODEL, [query])
  return embeddings[0]
}

// ─── Semantic Search ──────────────────────────────────────────────────────────

export async function semanticSearch(
  query: string,
  snapshots: PageSnapshot[]
): Promise<ScoredChunk[]> {
  const searchable = snapshots.filter((s) => s.embeddings.length > 0)
  log(`[Search] ${searchable.length}/${snapshots.length} snapshots have embeddings, threshold=${SIMILARITY_THRESHOLD}`)

  if (searchable.length === 0) return []

  const queryEmbedding = await generateQueryEmbedding(query)
  const all: ScoredChunk[] = []

  for (const snapshot of searchable) {
    for (let i = 0; i < snapshot.embeddings.length; i++) {
      const score = cosineSimilarity(queryEmbedding, snapshot.embeddings[i])
      all.push({ url: snapshot.url, title: snapshot.title, chunk: snapshot.chunks[i], score })
    }
  }

  all.sort((a, b) => b.score - a.score)

  const aboveThreshold = all.filter((r) => r.score >= SIMILARITY_THRESHOLD)
  log(`[Search] ${aboveThreshold.length} results above threshold, best score=${all[0]?.score.toFixed(3) ?? "n/a"}`)

  if (aboveThreshold.length > 0) {
    return aboveThreshold.slice(0, MAX_CONTEXT_CHUNKS)
  }

  // Nothing above threshold — return top-3 best matches flagged as low confidence
  return all.slice(0, 3).map((r) => ({ ...r, belowThreshold: true }))
}

// ─── Find best matching chunk ─────────────────────────────────────────────────

export async function findBestMatchingChunk(
  query: string,
  snapshots: PageSnapshot[]
): Promise<ScoredChunk | null> {
  const results = await semanticSearch(query, snapshots)
  return results.length > 0 ? results[0] : null
}
